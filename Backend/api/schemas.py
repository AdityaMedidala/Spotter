from ninja import Schema
from typing import List

class TripInput(Schema):
    current_location: str
    pickup_location: str
    dropoff_location: str
    cycle_used_hours: float

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