import httpx
from ninja import NinjaAPI
from ninja.errors import HttpError

from .schemas import TripInput, TripOutput
from .hos_engine import calculate_trip
from .ors_client import get_route, autocomplete_location

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
        # Bad location string or ORS returned no route → 400
        raise HttpError(400, str(e))
    except httpx.HTTPError as e:
        # Network / 5xx from ORS → 502 so client knows it's upstream
        raise HttpError(502, f"Routing service unavailable: {e}")

    result = calculate_trip(route_data, payload.cycle_used_hours)
    return result


@api.get("/autocomplete")
async def autocomplete(request, q: str):
    """Return location suggestions for the given query string."""
    if not q or len(q.strip()) < 2:
        return {"suggestions": []}
    try:
        suggestions = await autocomplete_location(q)
    except httpx.HTTPError:
        # Don't surface ORS errors to autocomplete — just return empty
        return {"suggestions": []}
    return {"suggestions": suggestions}