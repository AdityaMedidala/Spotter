import httpx
from decouple import config

ORS_KEY = config('ORS_API_KEY')
BASE = "https://api.openrouteservice.org"

# ORS layers that are too vague to route to/from.
# "region" = state/province, "country" = entire country,
# "macroregion" = multi-state area, "continent" = self-explanatory.
_VAGUE_LAYERS = {"region", "country", "macroregion", "continent"}

# ORS confidence below this threshold usually means a poor match
# (e.g. snapped to a state centroid in the middle of nowhere).
_MIN_CONFIDENCE = 0.4


def _validate_geocode_result(feature: dict, original_query: str) -> None:
    """
    Raise ValueError with a user-friendly message if the geocoded result
    is too vague or unlikely to be routable by truck.
    """
    props = feature.get("properties", {})
    layer = props.get("layer", "")
    label = props.get("label", original_query)
    confidence = props.get("confidence", 1.0)

    if layer in _VAGUE_LAYERS:
        # Give a helpful hint based on what ORS matched
        if layer == "region":
            hint = f'Try a city name instead, e.g. "Albuquerque, NM" or "Santa Fe, NM"'
        elif layer == "country":
            hint = "Please enter a specific city or address"
        else:
            hint = "Please enter a more specific location"

        raise ValueError(
            f'"{original_query}" resolved to an entire {layer} ({label}). '
            f'{hint}.'
        )

    if confidence < _MIN_CONFIDENCE:
        raise ValueError(
            f'"{original_query}" could not be matched confidently (matched: "{label}"). '
            f'Please enter a more specific address or city name.'
        )


async def geocode(place: str, client: httpx.AsyncClient) -> tuple[float, float]:
    r = await client.get(
        f"{BASE}/geocode/search",
        params={"api_key": ORS_KEY, "text": place, "size": 1},
        timeout=10.0,
    )
    r.raise_for_status()
    features = r.json().get("features", [])
    if not features:
        raise ValueError(f'Location not found: "{place}". Please enter a valid US city or address.')

    feature = features[0]

    # Validate before returning — catches states, countries, low-confidence matches
    _validate_geocode_result(feature, place)

    coords = feature["geometry"]["coordinates"]
    return coords[1], coords[0]


async def autocomplete_location(query: str) -> list[dict]:
    async with httpx.AsyncClient() as client:
        r = await client.get(
            f"{BASE}/geocode/autocomplete",
            params={
                "api_key": ORS_KEY,
                "text": query,
                "size": 6,
                "layers": "locality,region,country,address",
                "boundary.country": "US",
            },
            timeout=8.0,
        )
        r.raise_for_status()

    features = r.json().get("features", [])
    results = []
    for f in features:
        props = f.get("properties", {})
        label = props.get("label", "")
        if label:
            results.append({
                "label": label,
                "lat": f["geometry"]["coordinates"][1],
                "lng": f["geometry"]["coordinates"][0],
            })
    return results


async def get_route(current: str, pickup: str, dropoff: str) -> dict:
    async with httpx.AsyncClient(timeout=15.0) as client:
        # Each geocode call now validates the result before returning.
        # ValueError is raised with a user-friendly message for vague locations.
        c_lat, c_lng = await geocode(current, client)
        p_lat, p_lng = await geocode(pickup, client)
        d_lat, d_lng = await geocode(dropoff, client)

        r = await client.post(
            f"{BASE}/v2/directions/driving-hgv/geojson",
            headers={"Authorization": ORS_KEY, "Content-Type": "application/json"},
            json={
                "coordinates": [
                    [c_lng, c_lat],
                    [p_lng, p_lat],
                    [d_lng, d_lat],
                ]
            },
        )
        r.raise_for_status()

    data = r.json()
    features = data.get("features", [])
    if not features:
        raise ValueError("ORS returned no route — locations may not be reachable by truck")
    feature = features[0]
    summary = feature["properties"]["summary"]
    coords = feature["geometry"]["coordinates"]

    return {
        "distance_miles": summary["distance"] * 0.000621371,
        "duration_hours": summary["duration"] / 3600,
        "polyline": [[c[1], c[0]] for c in coords],
        "waypoints": [
            {"lat": c_lat, "lng": c_lng, "name": current},
            {"lat": p_lat, "lng": p_lng, "name": pickup},
            {"lat": d_lat, "lng": d_lng, "name": dropoff},
        ],
    }