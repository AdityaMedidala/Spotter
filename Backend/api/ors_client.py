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
                "boundary.country": "US",  # restrict to US; remove for worldwide
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
    # Single shared client — reuses the TCP connection across all 4 calls
    # (3 geocodes + 1 directions) instead of opening fresh ones each time.
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