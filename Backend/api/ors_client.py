import httpx
from decouple import config

ORS_KEY = config('ORS_API_KEY')
BASE = "https://api.openrouteservice.org"


async def geocode(place: str) -> tuple[float, float]:
    async with httpx.AsyncClient() as client:
        r = await client.get(
            f"{BASE}/geocode/search",
            params={"api_key": ORS_KEY, "text": place, "size": 1},
            timeout=10.0,
        )
        r.raise_for_status()
        coords = r.json()["features"][0]["geometry"]["coordinates"]
        return coords[1], coords[0]  # lat, lng


async def get_route(current: str, pickup: str, dropoff: str) -> dict:
    c_lat, c_lng = await geocode(current)
    p_lat, p_lng = await geocode(pickup)
    d_lat, d_lng = await geocode(dropoff)

    async with httpx.AsyncClient() as client:
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
            timeout=15.0,
        )
        r.raise_for_status()

    data = r.json()
    feature = data["features"][0]
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