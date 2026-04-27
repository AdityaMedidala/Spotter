from datetime import datetime, timedelta
from typing import List, Dict, Any

# HOS Constants (70hr/8day property carrier)
MAX_DRIVE_HOURS = 11.0
MAX_WINDOW_HOURS = 14.0
REQUIRED_OFF_HOURS = 10.0
BREAK_AFTER_HOURS = 8.0
BREAK_DURATION = 0.5
MAX_CYCLE_HOURS = 70.0
RESTART_HOURS = 34.0
FUEL_INTERVAL_MILES = 1000.0
FUEL_STOP_HOURS = 0.5
PICKUP_HOURS = 1.0
DROPOFF_HOURS = 1.0


def calculate_trip(route_data: Dict, cycle_used_hours: float) -> Dict[str, Any]:
    total_miles = route_data["distance_miles"]
    total_drive_time = route_data["duration_hours"]
    polyline = route_data["polyline"]
    waypoints = route_data["waypoints"]

    stops = []
    daily_logs = []

    # Time tracking
    current_hour = 0.0        # hours elapsed since trip start
    shift_start_hour = current_hour
    drive_hours_today = 0.0   # hours driven this shift
    on_duty_hours_today = 0.0 # total on duty this shift
    drive_since_break = 0.0   # hours driven since last 30-min break
    cycle_hours = cycle_used_hours
    day = 1
    miles_since_fuel = 0.0
    miles_driven_total = 0.0

    # Segments for today's log
    segments = []
    day_start_hour = 0.0

    # FIX 1: Real datetime base for ISO 8601 arrival_time strings.
    # FIX 8: Anchor trip_start to calendar midnight (not current wall-clock
    # hour). This makes Day 1's shift-relative segment hours exactly equal
    # to calendar clock hours, so the canvas hour labels (Midnight, 1AM, …)
    # are accurate for Day 1 and remarks line up with bars without any
    # offset arithmetic. For Day 2+ the canvas hours are shift-relative,
    # but bars and remarks still align (frontend uses log.start_time).
    trip_start = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)

    def format_time(elapsed_hours: float) -> str:
        return (trip_start + timedelta(hours=elapsed_hours)).strftime("%Y-%m-%dT%H:%M:%S")

    def shift_start_dt(absolute_hour: float) -> datetime:
        return trip_start + timedelta(hours=absolute_hour)

    def add_segment(status: str, duration: float):
        # Add this guard clause to prevent 0.0 hour segments:
        if duration <= 0:
            return

        nonlocal current_hour
        start = current_hour - day_start_hour
        end = start + duration
        segments.append({
            "status": status,
            "start_hour": round(start, 2),
            "end_hour": round(end, 2),
        })
        current_hour += duration

    def new_day():
        nonlocal day, drive_hours_today, on_duty_hours_today, shift_start_hour
        nonlocal drive_since_break, day_start_hour, segments

        # Calendar date and ISO start time of THIS shift (the one we're closing).
        # Use the shift's actual start hour, not (today + day index), so the
        # date field reflects when the shift really began.
        shift_start = shift_start_dt(day_start_hour)

        daily_logs.append({
            "day": day,
            "date": shift_start.strftime("%Y-%m-%d"),
            "start_time": shift_start.strftime("%Y-%m-%dT%H:%M:%S"),
            "segments": list(segments),
            "total_drive": round(drive_hours_today, 2),
            "total_on_duty": round(sum(
                s["end_hour"] - s["start_hour"]
                for s in segments
                if s["status"] in ("driving", "on_duty")
            ), 2),
        })
        day += 1
        day_start_hour = current_hour
        shift_start_hour = current_hour
        drive_hours_today = 0.0
        on_duty_hours_today = 0.0
        drive_since_break = 0.0
        segments = []

    # FIX 7: split a long rest block (e.g. 34hr restart) across calendar days,
    # logged as sleeper berth — an OTR driver on a multi-day haul lives in the
    # truck during long rests. FMCSA §395.1(g) allows sleeper berth time to
    # satisfy the 10hr off-duty requirement.
    def add_sleeper_split(duration: float):
        """Add a sleeper segment of any length, splitting at 24hr boundaries."""
        remaining = duration
        while remaining > 0:
            hours_left_in_day = 24.0 - (current_hour - day_start_hour)
            chunk = min(remaining, hours_left_in_day)
            add_segment("sleeper", chunk)
            remaining = round(remaining - chunk, 6)
            if remaining > 0:
                new_day()

    def coords_at_miles(miles: float):
        """Interpolate lat/lng along the polyline proportional to miles driven."""
        if total_miles == 0:
            return waypoints[0]["lat"], waypoints[0]["lng"]

        frac = max(0.0, min(1.0, miles / total_miles))

        # If polyline exists and has valid geographic coordinates, use it
        if polyline and len(polyline) >= 2:
            mid = polyline[len(polyline) // 2]
            valid_lat = 24.0 <= mid[0] <= 50.0
            valid_lng = -125.0 <= mid[1] <= -66.0
            if valid_lat and valid_lng:
                idx_f = frac * (len(polyline) - 1)
                i = int(idx_f)
                if i >= len(polyline) - 1:
                    return polyline[-1][0], polyline[-1][1]
                t = idx_f - i
                lat = polyline[i][0] + t * (polyline[i + 1][0] - polyline[i][0])
                lng = polyline[i][1] + t * (polyline[i + 1][1] - polyline[i][1])
                return lat, lng

        # Fallback: interpolate linearly between waypoints
        n_segs = len(waypoints) - 1
        if n_segs <= 0:
            return waypoints[0]["lat"], waypoints[0]["lng"]
        seg_f = frac * n_segs
        i = min(int(seg_f), n_segs - 1)
        t = seg_f - i
        a, b = waypoints[i], waypoints[i + 1]
        lat = a["lat"] + t * (b["lat"] - a["lat"])
        lng = a["lng"] + t * (b["lng"] - a["lng"])
        return lat, lng

    # --- Pickup stop (1 hr on-duty) ---
    stops.append({
        "type": "pickup",
        "location": waypoints[1]["name"],
        "arrival_time": format_time(current_hour),
        "duration_hours": PICKUP_HOURS,
        "lat": waypoints[1]["lat"],
        "lng": waypoints[1]["lng"],
    })
    add_segment("on_duty", PICKUP_HOURS)
    on_duty_hours_today += PICKUP_HOURS
    cycle_hours += PICKUP_HOURS

    # --- Main driving loop ---
    remaining_drive = total_drive_time
    remaining_miles = total_miles

    while remaining_drive > 0:
        # Check cycle limit
        if cycle_hours >= MAX_CYCLE_HOURS:
            _lat, _lng = coords_at_miles(miles_driven_total)
            stops.append({
                "type": "restart",
                "location": "Current location",
                "arrival_time": format_time(current_hour),
                "duration_hours": RESTART_HOURS,
                "lat": _lat,
                "lng": _lng,
            })
            add_sleeper_split(RESTART_HOURS)
            new_day()
            cycle_hours = 0.0
            continue

        # How much can we drive right now?
        cycle_remaining = MAX_CYCLE_HOURS - cycle_hours
        # FIX 5: Use wall-clock elapsed since shift start for the 14hr window,
        # NOT on_duty_hours_today. Off-duty breaks (e.g. the 30-min break) do
        # not extend the 14hr driving window per § 395.3(a)(2).
        can_drive = min(
            MAX_DRIVE_HOURS - drive_hours_today,
            MAX_WINDOW_HOURS - (current_hour - shift_start_hour),
            BREAK_AFTER_HOURS - drive_since_break if drive_since_break < BREAK_AFTER_HOURS else 0,
            cycle_remaining,
            remaining_drive,
        )

        # Need a 30-min break?
        if drive_since_break >= BREAK_AFTER_HOURS:
            _lat, _lng = coords_at_miles(miles_driven_total)
            stops.append({
                "type": "rest",
                "location": "Rest area",
                "arrival_time": format_time(current_hour),
                "duration_hours": BREAK_DURATION,
                "lat": _lat,
                "lng": _lng,
            })
            add_segment("off_duty", BREAK_DURATION)
            drive_since_break = 0.0
            continue

        # Need mandatory 10-hr reset?
        if drive_hours_today >= MAX_DRIVE_HOURS or (current_hour - shift_start_hour) >= MAX_WINDOW_HOURS:
            _lat, _lng = coords_at_miles(miles_driven_total)
            stops.append({
                "type": "rest",
                "location": "Rest stop / sleeper berth",
                "arrival_time": format_time(current_hour),
                "duration_hours": REQUIRED_OFF_HOURS,
                "lat": _lat,
                "lng": _lng,
            })
            add_segment("sleeper", REQUIRED_OFF_HOURS)
            new_day()
            continue

        if can_drive <= 0:
            add_segment("sleeper", REQUIRED_OFF_HOURS)
            new_day()
            continue

        # Check fuel stop
        miles_this_segment = (can_drive / total_drive_time) * total_miles
        if round(miles_since_fuel + miles_this_segment, 4) > FUEL_INTERVAL_MILES:
            drive_to_fuel = ((FUEL_INTERVAL_MILES - miles_since_fuel) / total_miles) * total_drive_time
            drive_to_fuel = min(drive_to_fuel, can_drive)

            add_segment("driving", drive_to_fuel)
            drive_hours_today += drive_to_fuel
            on_duty_hours_today += drive_to_fuel
            drive_since_break += drive_to_fuel
            cycle_hours += drive_to_fuel
            remaining_drive -= drive_to_fuel
            miles_driven = (drive_to_fuel / total_drive_time) * total_miles
            remaining_miles -= miles_driven
            miles_since_fuel += miles_driven
            miles_driven_total += miles_driven

            _lat, _lng = coords_at_miles(miles_driven_total)
            stops.append({
                "type": "fuel",
                "location": "Fuel stop",
                "arrival_time": format_time(current_hour),
                "duration_hours": FUEL_STOP_HOURS,
                "lat": _lat,
                "lng": _lng,
            })
            add_segment("on_duty", FUEL_STOP_HOURS)
            on_duty_hours_today += FUEL_STOP_HOURS
            cycle_hours += FUEL_STOP_HOURS
            miles_since_fuel = 0.0
            continue

        # Normal driving segment
        add_segment("driving", can_drive)
        drive_hours_today += can_drive
        on_duty_hours_today += can_drive
        drive_since_break += can_drive
        cycle_hours += can_drive
        remaining_drive -= can_drive
        miles_driven = (can_drive / total_drive_time) * total_miles
        remaining_miles -= miles_driven
        miles_since_fuel += miles_driven
        miles_driven_total += miles_driven

    # FIX 6: Check if dropoff would breach the 14hr window before adding it.
    if (current_hour - shift_start_hour) + DROPOFF_HOURS > MAX_WINDOW_HOURS:
        _lat, _lng = coords_at_miles(miles_driven_total)
        stops.append({
            "type": "rest",
            "location": "Rest stop / sleeper berth",
            "arrival_time": format_time(current_hour),
            "duration_hours": REQUIRED_OFF_HOURS,
            "lat": _lat,
            "lng": _lng,
        })
        add_segment("sleeper", REQUIRED_OFF_HOURS)
        new_day()

    # FIX 2: Check if dropoff would breach the cycle limit before adding it
    if cycle_hours + DROPOFF_HOURS > MAX_CYCLE_HOURS:
        _lat, _lng = coords_at_miles(miles_driven_total)
        stops.append({
            "type": "restart",
            "location": "Current location",
            "arrival_time": format_time(current_hour),
            "duration_hours": RESTART_HOURS,
            "lat": _lat,
            "lng": _lng,
        })
        add_sleeper_split(RESTART_HOURS)
        new_day()
        cycle_hours = 0.0

    # --- Dropoff stop (1 hr on-duty) ---
    stops.append({
        "type": "dropoff",
        "location": waypoints[2]["name"],
        "arrival_time": format_time(current_hour),
        "duration_hours": DROPOFF_HOURS,
        "lat": waypoints[2]["lat"],
        "lng": waypoints[2]["lng"],
    })
    add_segment("on_duty", DROPOFF_HOURS)
    on_duty_hours_today += DROPOFF_HOURS

    # Save final day with the same shift_start metadata
    final_shift_start = shift_start_dt(day_start_hour)
    daily_logs.append({
        "day": day,
        "date": final_shift_start.strftime("%Y-%m-%d"),
        "start_time": final_shift_start.strftime("%Y-%m-%dT%H:%M:%S"),
        "segments": list(segments),
        "total_drive": round(drive_hours_today, 2),
        "total_on_duty": round(sum(
            s["end_hour"] - s["start_hour"]
            for s in segments
            if s["status"] in ("driving", "on_duty")
        ), 2),
    })

    return {
        "stops": stops,
        "daily_logs": daily_logs,
        "polyline": polyline,
        "total_miles": round(total_miles, 1),
        "total_days": day,
        "total_drive_hours": round(total_drive_time, 1),
    }