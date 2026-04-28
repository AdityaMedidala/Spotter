import httpx
from ninja import NinjaAPI
from ninja.errors import HttpError

from .schemas import TripInput, TripOutput
from .hos_engine import calculate_trip
from .ors_client import get_route, autocomplete_location, enrich_stop_locations

api = NinjaAPI()


@api.post("/plan-trip", response=TripOutput)
async def plan_trip(request, payload: TripInput):
    try:
        route_data = await get_route(
            payload.current_location,
            payload.pickup_location,
            payload.dropoff_location,
        )
    except ValueError as e:
        raise HttpError(400, str(e))
    except httpx.HTTPError as e:
        raise HttpError(502, f"Routing service unavailable: {e}")

    result = calculate_trip(route_data, payload.cycle_used_hours)
    try:
        result["stops"] = await enrich_stop_locations(result["stops"])
    except httpx.HTTPError:
        pass

    return result


@api.get("/autocomplete")
async def autocomplete(request, q: str):
    """Return location suggestions for the given query string."""
    if not q or len(q.strip()) < 2:
        return {"suggestions": []}
    try:
        suggestions = await autocomplete_location(q)
    except httpx.HTTPError:
        return {"suggestions": []}
    return {"suggestions": suggestions}