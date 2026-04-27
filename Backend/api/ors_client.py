import httpx
from decouple import config

ORS_KEY = config('ORS_API_KEY')
BASE = "https://api.openrouteservice.org"


async def geocode(place: str, client: httpx.AsyncClient) -> tuple[float, float]:
    r = await client.get(
        f"{BASE}/geocode/search",
        params={"api_key": ORS_KEY, "text": place, "size": 1},
        timeout=10.0,
    )
    r.raise_for_status()
    features = r.json().get("features", [])
    if not features:
        raise ValueError(f"Location not found: {place!r}")
    coords = features[0]["geometry"]["coordinates"]
    return coords[1], coords[0]  # lat, lng


async def reverse_geocode(lat: float, lng: float, client: httpx.AsyncClient) -> str:
    """Convert lat/lng → 'City, ST' string. Falls back to nearest locality.

    On any failure (timeout, no result, etc.) returns an empty string so the
    caller can decide on a fallback label. We never raise here because rest
    stops are best-effort labels — the trip is still valid without them.
    """
    try:
        r = await client.get(
            f"{BASE}/geocode/reverse",
            params={
                "api_key": ORS_KEY,
                "point.lat": lat,
                "point.lon": lng,
                "size": 1,
                "layers": "locality,region",
                "boundary.country": "US",
            },
            timeout=6.0,
        )
        r.raise_for_status()
        features = r.json().get("features", [])
        if not features:
            return ""
        props = features[0].get("properties", {})
        # Prefer "locality, region" (e.g. "Memphis, Tennessee"). Build short form
        # using the standard 2-letter state abbreviation when available.
        locality = props.get("locality") or props.get("name") or ""
        region_a = props.get("region_a") or ""  # e.g. "TN"
        region   = props.get("region")   or ""  # e.g. "Tennessee"
        state = region_a if region_a else region
        if locality and state:
            return f"{locality}, {state}"
        return locality or state or ""
    except (httpx.HTTPError, ValueError, KeyError):
        return ""


async def autocomplete_location(query: str) -> list[dict]:
    """Return up to 6 location suggestions for the given query."""
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


async def enrich_stop_locations(stops: list[dict]) -> list[dict]:
    """Reverse-geocode rest/fuel/restart stops in-place and return them.

    Pickup and dropoff already have human-readable names from waypoints, so
    they're skipped. Generic stop types ('rest', 'fuel', 'restart') get their
    'location' field replaced with the actual city/state.
    """
    GENERIC_TYPES = {"rest", "fuel", "restart"}

    # Single shared client for all reverse-geocode calls
    async with httpx.AsyncClient(timeout=10.0) as client:
        for stop in stops:
            if stop.get("type") not in GENERIC_TYPES:
                continue
            lat = stop.get("lat")
            lng = stop.get("lng")
            if lat is None or lng is None:
                continue
            city = await reverse_geocode(lat, lng, client)
            if city:
                # Preserve the stop type prefix so users still see what kind
                # of stop it is, e.g. "Rest area near Memphis, TN" or
                # "Fuel stop near Little Rock, AR"
                prefix = {
                    "rest":    "Rest near",
                    "fuel":    "Fuel stop near",
                    "restart": "34hr restart near",
                }.get(stop["type"], "Near")
                stop["location"] = f"{prefix} {city}"
    return stops