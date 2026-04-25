from ninja import NinjaAPI
from .schemas import TripInput, TripOutput
from .hos_engine import calculate_trip
from .ors_client import get_route

api = NinjaAPI()

@api.post("/plan-trip", response=TripOutput)
async def plan_trip(request, payload: TripInput):
    route_data = await get_route(
        payload.current_location,
        payload.pickup_location,
        payload.dropoff_location,
    )
    result = calculate_trip(route_data, payload.cycle_used_hours)
    return result