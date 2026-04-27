import logging

import httpx
from ninja import NinjaAPI
from ninja.errors import HttpError

from .schemas import TripInput, TripOutput
from .hos_engine import calculate_trip
from .ors_client import get_route, autocomplete_location

logger = logging.getLogger(__name__)

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
    except httpx.HTTPStatusError as e:
        logger.error("[plan-trip] ORS HTTP error: %s", e)
        raise HttpError(502, f"Routing service error: {e.response.status_code}")
    except httpx.HTTPError as e:
        logger.error("[plan-trip] ORS network error: %s", e)
        raise HttpError(502, f"Routing service unavailable: {e}")
    except Exception as e:
        logger.exception("[plan-trip] Unexpected error")
        raise HttpError(500, f"Internal error: {e}")

    try:
        result = calculate_trip(route_data, payload.cycle_used_hours)
    except Exception as e:
        logger.exception("[plan-trip] HOS engine error")
        raise HttpError(500, f"Trip calculation failed: {e}")

    return result


@api.get("/autocomplete")
async def autocomplete(request, q: str):
    if not q or len(q.strip()) < 2:
        return {"suggestions": []}
    try:
        suggestions = await autocomplete_location(q)
        return {"suggestions": suggestions}
    except httpx.HTTPStatusError as e:
        logger.warning("[autocomplete] ORS returned %s", e.response.status_code)
        return {"suggestions": []}
    except httpx.HTTPError as e:
        logger.warning("[autocomplete] ORS network error: %s", e)
        return {"suggestions": []}
    except Exception as e:
        logger.exception("[autocomplete] Unexpected error: %s", e)
        return {"suggestions": []}