from ninja import Schema
from pydantic import field_validator
from typing import List


class TripInput(Schema):
    current_location: str
    pickup_location: str
    dropoff_location: str
    cycle_used_hours: float

    @field_validator('cycle_used_hours')
    @classmethod
    def cycle_in_range(cls, v):
        if not 0 <= v <= 70:
            raise ValueError('cycle_used_hours must be between 0 and 70')
        return v

    @field_validator('current_location', 'pickup_location', 'dropoff_location')
    @classmethod
    def location_not_empty(cls, v):
        if not v or not v.strip():
            raise ValueError('location cannot be empty')
        return v.strip()


class Stop(Schema):
    type: str
    location: str
    arrival_time: str
    duration_hours: float
    lat: float
    lng: float


class LogSegment(Schema):
    status: str        # 'off_duty' | 'driving' | 'on_duty' | 'sleeper'
    start_hour: float
    end_hour: float


class DailyLog(Schema):
    day: int
    date: str
    start_time: str    # ISO 8601 wall-clock when this shift started; the
                       # frontend uses this to compute remark x-positions
                       # in shift-relative time so they align with the bars.
    segments: List[LogSegment]
    total_drive: float
    total_on_duty: float


class TripOutput(Schema):
    stops: List[Stop]
    daily_logs: List[DailyLog]
    polyline: List[List[float]]
    total_miles: float
    total_days: int
    total_drive_hours: float