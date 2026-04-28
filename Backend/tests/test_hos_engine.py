
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from datetime import datetime

# ── Path setup ──────────────────────────────────────────────────────────────
HOS_ENGINE_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".")
sys.path.insert(0, HOS_ENGINE_PATH)

try:
    from hos_engine import calculate_trip
except ImportError:
    sys.path.insert(0, "/mnt/user-data/uploads")
    from api.hos_engine import calculate_trip


# ════════════════════════════════════════════════════════════════════════════
#  CONSTANTS  — single source of truth for every HOS threshold
# ════════════════════════════════════════════════════════════════════════════
MAX_DRIVE_HRS        = 11.0   # § 395.3(a)(3)
DRIVE_WINDOW_HRS     = 14.0   # § 395.3(a)(2)
MANDATORY_REST_HRS   = 10.0   # § 395.3(a)(1)
BREAK_THRESHOLD_HRS  = 8.0    # 30-min break after 8 cumulative driving hrs
BREAK_DURATION_HRS   = 0.5    # § 395.3(a)(3)(ii)
CYCLE_LIMIT_HRS      = 70.0   # § 395.3(b) — 70 hr / 8-day
RESTART_HRS          = 34.0   # § 395.3(c)
FUEL_INTERVAL_MI     = 1000.0 # engine-defined fuel stop interval
PICKUP_DURATION_HRS  = 1.0    # app assumption
DROPOFF_DURATION_HRS = 1.0    # app assumption

EPSILON = 0.01   # floating-point tolerance used consistently throughout

# Valid segment statuses per FMCSA
VALID_STATUSES   = {"driving", "on_duty", "off_duty", "sleeper"}
# Statuses that count as non-driving (break can be any of these)
NON_DRIVING      = {"off_duty", "on_duty", "sleeper"}


# ════════════════════════════════════════════════════════════════════════════
#  HELPERS
# ════════════════════════════════════════════════════════════════════════════

def make_route(miles: float, hours: float) -> dict:
    """Minimal mock route — no ORS API call needed."""
    return {
        "distance_miles":  miles,
        "duration_hours":  hours,
        "polyline":        [[0, 0], [1, 1]],
        "waypoints": [
            {"lat": 41.8781, "lng": -87.6298, "name": "Chicago, IL"},
            {"lat": 38.6270, "lng": -90.1994, "name": "St. Louis, MO"},
            {"lat": 32.7767, "lng": -96.7970, "name": "Dallas, TX"},
        ],
    }


PASS    = "✅ PASS"
FAIL    = "❌ FAIL"
results = []


def check(name: str, condition: bool, detail: str = "") -> bool:
    status = PASS if condition else FAIL
    msg = f"{status}  {name}"
    if detail:
        msg += f"\n        → {detail}"
    print(msg)
    results.append((name, condition))
    return condition


def segment_duration(log: dict, status: str) -> float:
    """Total hours of a given status in one daily log."""
    return round(
        sum(
            s["end_hour"] - s["start_hour"]
            for s in log["segments"]
            if s["status"] == status
        ),
        4,
    )


def all_driving_hours(result: dict) -> float:
    return round(
        sum(segment_duration(log, "driving") for log in result["daily_logs"]), 4
    )


def stops_of_type(result: dict, t: str) -> list:
    return [s for s in result["stops"] if s["type"] == t]


def parse_arrival(s: dict):
    """
    Parse arrival_time to a datetime.  Always returns a tz-NAIVE datetime
    (strips offset) so comparisons between stops never raise TypeError.
    Returns None if unparseable.
    """
    val = s.get("arrival_time")
    if not val:
        return None
    val_str = str(val)
    for fmt in (
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%dT%H:%M",
        "%Y-%m-%d %H:%M",
    ):
        try:
            return datetime.strptime(val_str, fmt)
        except ValueError:
            pass
    # ISO with timezone — strip offset to keep everything tz-naive
    try:
        dt = datetime.fromisoformat(val_str.replace("Z", "+00:00"))
        return dt.replace(tzinfo=None)
    except Exception:
        pass
    return None


def last_driving_end(log: dict) -> float:
    """Hour at which the last driving segment on a day ends."""
    segs = [s for s in log["segments"] if s["status"] == "driving"]
    return max((s["end_hour"] for s in segs), default=0.0)


def is_short_break(seg: dict) -> bool:
    """
    True if a segment qualifies as the 30-minute HOS rest break.
    FMCSA §395.3(a)(3)(ii): break may be on_duty, off_duty, or sleeper.
    """
    dur = seg["end_hour"] - seg["start_hour"]
    return seg["status"] in NON_DRIVING and abs(dur - BREAK_DURATION_HRS) < EPSILON


def valid_us_coords(s: dict) -> bool:
    """Loose CONUS bounding box check."""
    lat, lng = s.get("lat"), s.get("lng")
    if lat is None or lng is None:
        return False
    return 20 <= lat <= 55 and -135 <= lng <= -60


def section(title: str) -> None:
    print(f"\n{'═'*50}")
    print(f"  {title}")
    print(f"{'═'*50}")


# ════════════════════════════════════════════════════════════════════════════
#  SECTION 1 — Basic output structure
# ════════════════════════════════════════════════════════════════════════════
section("SECTION 1: Basic output structure")

r = calculate_trip(make_route(100, 2.0), 0)

for key in ("stops", "daily_logs", "polyline", "total_miles", "total_days", "total_drive_hours"):
    check(f"Output has '{key}' key", key in r)

check("total_miles matches input",        abs(r["total_miles"] - 100) < 1)
check("total_drive_hours matches input",  abs(r["total_drive_hours"] - 2.0) < EPSILON)

req_stop_fields = ("type", "location", "arrival_time", "duration_hours", "lat", "lng")
check(
    "All stops have required fields",
    all(all(k in s for k in req_stop_fields) for s in r["stops"]),
    f"fields checked: {req_stop_fields}",
)

req_log_fields = ("day", "date", "segments", "total_drive", "total_on_duty")
check(
    "All daily_logs have required fields",
    all(all(k in log for k in req_log_fields) for log in r["daily_logs"]),
    f"fields checked: {req_log_fields}",
)

req_seg_fields = ("status", "start_hour", "end_hour")
check(
    "All segments have required fields",
    all(
        all(k in seg for k in req_seg_fields)
        for log in r["daily_logs"]
        for seg in log["segments"]
    ),
)

check(
    "All segment statuses are valid",
    all(
        seg["status"] in VALID_STATUSES
        for log in r["daily_logs"]
        for seg in log["segments"]
    ),
    f"valid = {VALID_STATUSES}",
)

check("total_days is a positive integer", isinstance(r["total_days"], int) and r["total_days"] >= 1)
check("total_miles is a positive number", isinstance(r["total_miles"], (int, float)) and r["total_miles"] > 0)
check("stops list is non-empty",          len(r["stops"]) >= 2)
check("daily_logs list is non-empty",     len(r["daily_logs"]) >= 1)
check("polyline returned unchanged",      r["polyline"] == [[0, 0], [1, 1]])


# ════════════════════════════════════════════════════════════════════════════
#  SECTION 2 — Pickup & Dropoff rules
# ════════════════════════════════════════════════════════════════════════════
section("SECTION 2: Pickup & Dropoff rules")

r = calculate_trip(make_route(100, 2.0), 0)
pickups  = stops_of_type(r, "pickup")
dropoffs = stops_of_type(r, "dropoff")

check("Exactly 1 pickup stop",   len(pickups) == 1,  f"got {len(pickups)}")
check("Exactly 1 dropoff stop",  len(dropoffs) == 1, f"got {len(dropoffs)}")
check("Pickup is first stop",    r["stops"][0]["type"] == "pickup")
check("Dropoff is last stop",    r["stops"][-1]["type"] == "dropoff")

check(
    f"Pickup duration = {PICKUP_DURATION_HRS} hr",
    pickups[0]["duration_hours"] == PICKUP_DURATION_HRS,
    f"got {pickups[0]['duration_hours']}",
)
check(
    f"Dropoff duration = {DROPOFF_DURATION_HRS} hr",
    dropoffs[0]["duration_hours"] == DROPOFF_DURATION_HRS,
    f"got {dropoffs[0]['duration_hours']}",
)

check("Pickup location = St. Louis (waypoints[1])",
      "St. Louis" in pickups[0]["location"],  f"got '{pickups[0]['location']}'")
check("Dropoff location = Dallas (waypoints[2])",
      "Dallas" in dropoffs[0]["location"],    f"got '{dropoffs[0]['location']}'")

check("Pickup has valid US lat/lng",  valid_us_coords(pickups[0]))
check("Dropoff has valid US lat/lng", valid_us_coords(dropoffs[0]))


# ════════════════════════════════════════════════════════════════════════════
#  SECTION 3 — 11-Hour Driving Limit  § 395.3(a)(3)
# ════════════════════════════════════════════════════════════════════════════
section(f"SECTION 3: {MAX_DRIVE_HRS}-hour driving limit")

r_2  = calculate_trip(make_route(100,  2.0), 0)
r_11 = calculate_trip(make_route(550, 11.0), 0)
r_12 = calculate_trip(make_route(600, 12.0), 0)

check("2hr trip: no 10hr mandatory rest",
      not any(s["type"] == "rest" and s["duration_hours"] >= MANDATORY_REST_HRS for s in r_2["stops"]))
check("2hr trip: day 1 driving = 2.0 hr",
      abs(segment_duration(r_2["daily_logs"][0], "driving") - 2.0) < EPSILON,
      f"got {segment_duration(r_2['daily_logs'][0], 'driving')}")

d1_11 = segment_duration(r_11["daily_logs"][0], "driving")
check(f"11hr trip: day 1 driving ≤ {MAX_DRIVE_HRS} hr", d1_11 <= MAX_DRIVE_HRS + EPSILON, f"got {d1_11}")
check("11hr trip: completes in 1 day",  r_11["total_days"] == 1, f"got {r_11['total_days']}")

check("12hr trip: spans 2 days", r_12["total_days"] == 2, f"got {r_12['total_days']}")
d1_12 = segment_duration(r_12["daily_logs"][0], "driving")
d2_12 = segment_duration(r_12["daily_logs"][1], "driving")
check(f"12hr trip: day 1 driving ≤ {MAX_DRIVE_HRS} hr", d1_12 <= MAX_DRIVE_HRS + EPSILON, f"got {d1_12}")
check("12hr trip: day 2 driving > 0",   d2_12 > 0, f"got {d2_12}")
check("12hr trip: day1 + day2 = 12 hr total",
      abs(d1_12 + d2_12 - 12.0) < EPSILON,
      f"day1={d1_12} + day2={d2_12} = {d1_12+d2_12}")


# ════════════════════════════════════════════════════════════════════════════
#  SECTION 4 — 30-Minute Break  § 395.3(a)(3)(ii)
# ════════════════════════════════════════════════════════════════════════════
section(f"SECTION 4: {BREAK_DURATION_HRS*60:.0f}-min break after {BREAK_THRESHOLD_HRS} cumulative driving hrs")

r_9  = calculate_trip(make_route(450,  9.0), 0)
r_7  = calculate_trip(make_route(350,  7.0), 0)
r_81 = calculate_trip(make_route(405,  8.1), 0)
r_8e = calculate_trip(make_route(400,  8.0), 0)   # exactly 8hr — no break needed

breaks_9  = [s for s in r_9["stops"]  if s["type"] == "rest" and abs(s["duration_hours"] - BREAK_DURATION_HRS) < EPSILON]
breaks_7  = [s for s in r_7["stops"]  if s["type"] == "rest" and s["duration_hours"] < MANDATORY_REST_HRS]
breaks_81 = [s for s in r_81["stops"] if s["type"] == "rest" and abs(s["duration_hours"] - BREAK_DURATION_HRS) < EPSILON]
breaks_8e = [s for s in r_8e["stops"] if s["type"] == "rest" and s["duration_hours"] < MANDATORY_REST_HRS]

check("9hr drive: exactly 1 thirty-min break",   len(breaks_9) == 1,  f"got {len(breaks_9)}")
check(f"7hr drive: NO break (< {BREAK_THRESHOLD_HRS} hr driving)", len(breaks_7) == 0, f"got {len(breaks_7)}")
check("8.1hr drive: break IS required",           len(breaks_81) >= 1, f"got {len(breaks_81)}")
check(f"Exactly {BREAK_THRESHOLD_HRS}hr drive: NO break (at limit, not over)",
      len(breaks_8e) == 0, f"got {len(breaks_8e)}")

# Break must be taken AFTER ≤ 8 hr cumulative driving — verify timing
if r_9["daily_logs"]:
    log9 = r_9["daily_logs"][0]
    segs9 = log9["segments"]
    break_segs = [s for s in segs9 if is_short_break(s)]
    if break_segs:
        break_start = break_segs[0]["start_hour"]
        drive_before = sum(
            s["end_hour"] - s["start_hour"]
            for s in segs9
            if s["status"] == "driving" and s["end_hour"] <= break_start + EPSILON
        )
        check(
            f"Break taken after ≤ {BREAK_THRESHOLD_HRS} hr cumulative driving",
            drive_before <= BREAK_THRESHOLD_HRS + EPSILON,
            f"drive before break = {round(drive_before, 2)} hr",
        )
    else:
        check("Break segment found in daily log", False, "no qualifying non-driving segment found")

# Break resets after 10hr mandatory rest
r_20 = calculate_trip(make_route(1000, 20.0), 0)
if len(r_20["daily_logs"]) >= 2:
    day2_20 = r_20["daily_logs"][1]
    day2_drive = segment_duration(day2_20, "driving")
    day2_breaks = [s for s in day2_20["segments"] if is_short_break(s)]
    check(
        "C: Day 2 (9 hr driving) has 30-min break — counter reset after 10hr rest",
        len(day2_breaks) >= 1,
        f"day2 drive={round(day2_drive,2)} hr, breaks={len(day2_breaks)}",
    )

# No 30-min break on day 2 of a 12-hr trip (only 1 hr driving on day 2)
r_c12 = calculate_trip(make_route(600, 12.0), 0)
if len(r_c12["daily_logs"]) >= 2:
    day2_c12 = r_c12["daily_logs"][1]
    short_d2 = [s for s in day2_c12["segments"] if is_short_break(s)]
    check(
        "C: After 10hr rest, day 2 (1 hr driving) has NO 30-min break",
        len(short_d2) == 0,
        f"found {len(short_d2)} break segments on day 2",
    )


# ════════════════════════════════════════════════════════════════════════════
#  SECTION 5 — 14-Hour Driving Window  § 395.3(a)(2)
# ════════════════════════════════════════════════════════════════════════════
section(f"SECTION 5: {DRIVE_WINDOW_HRS}-hour driving window")

r_11w = calculate_trip(make_route(550, 11.0), 0)
r_13  = calculate_trip(make_route(650, 13.0), 0)
r_12w = calculate_trip(make_route(600, 12.0), 0)

# ── S1: elapsed to last DRIVING segment end (not last segment end) ──────────
# FIX for original D3 bug: segments[-1] includes trailing rest → wrong metric.
# Correct check: last driving segment must end ≤ 14 hr from shift start.
day1_11w = r_11w["daily_logs"][0]
lde_11   = last_driving_end(day1_11w)
check(
    f"11hr drive: last driving ends ≤ {DRIVE_WINDOW_HRS} hr from shift start",
    lde_11 <= DRIVE_WINDOW_HRS + EPSILON,
    f"last driving end = {round(lde_11, 2)} hr",
)

check(
    "13hr drive: forces 2-day split (14hr window)",
    r_13["total_days"] >= 2,
    f"total_days = {r_13['total_days']}",
)

# ── No driving segment may START at or after hour 14 ──────────────────────
day1_12w = r_12w["daily_logs"][0]
segs_after_14 = [
    s for s in day1_12w["segments"]
    if s["status"] == "driving" and s["start_hour"] >= DRIVE_WINDOW_HRS
]
check(
    "12hr trip: no driving segment starts at/after hr 14 (break doesn't extend window)",
    len(segs_after_14) == 0,
    f"offending segments: {[(s['start_hour'], s['end_hour']) for s in segs_after_14]}",
)

# ── Elapsed includes break time (break does NOT pause the 14-hr clock) ─────
# 11hr trip layout: 1hr pickup + 8hr drive + 0.5hr break + 3hr drive + 1hr dropoff = 13.5hr
# That 13.5 hr is entirely within the 14hr window.
total_elapsed_11 = day1_11w["segments"][-1]["end_hour"] if day1_11w["segments"] else 0
check(
    "11hr trip: total day-1 span (incl. break) ≤ 14 hr",
    total_elapsed_11 <= DRIVE_WINDOW_HRS + EPSILON,
    f"day-1 end = {round(total_elapsed_11, 2)} hr",
)


# ════════════════════════════════════════════════════════════════════════════
#  SECTION 6 — 10-Hour Mandatory Rest  § 395.3(a)(1)
# ════════════════════════════════════════════════════════════════════════════
section(f"SECTION 6: {MANDATORY_REST_HRS}-hour mandatory rest between shifts")

r_12r = calculate_trip(make_route(600, 12.0), 0)
r_28r = calculate_trip(make_route(1500, 28.0), 0)

mandatory_12 = [s for s in r_12r["stops"] if s["type"] == "rest" and s["duration_hours"] >= MANDATORY_REST_HRS]
check("12hr trip: ≥ 1 mandatory 10hr rest",     len(mandatory_12) >= 1, f"got {len(mandatory_12)}")
check("12hr trip: mandatory rest = exactly 10hr",
      all(s["duration_hours"] == MANDATORY_REST_HRS for s in mandatory_12),
      f"durations = {[s['duration_hours'] for s in mandatory_12]}")

mandatory_28 = [s for s in r_28r["stops"] if s["type"] == "rest" and s["duration_hours"] >= MANDATORY_REST_HRS]
check("28hr trip: ≥ 2 mandatory 10hr rest stops", len(mandatory_28) >= 2, f"got {len(mandatory_28)}")


# ════════════════════════════════════════════════════════════════════════════
#  SECTION 7 — 70-Hour / 8-Day Cycle Limit  § 395.3(b)
# ════════════════════════════════════════════════════════════════════════════
section(f"SECTION 7: {CYCLE_LIMIT_HRS:.0f}-hour/8-day cycle limit")

r_c0  = calculate_trip(make_route(100, 2.0),  0)
r_c65 = calculate_trip(make_route(100, 2.0), 65)
r_c68 = calculate_trip(make_route(300, 5.0), 68)
r_c70 = calculate_trip(make_route(100, 2.0), 70)
r_c69 = calculate_trip(make_route(100, 2.0), 69)
# Boundary: cycle=63, 5hr drive → on-duty=7hr → 63+7=70 exactly, no restart
r_c63_5 = calculate_trip(make_route(250, 5.0), 63)
# Boundary: cycle=63, 6hr drive → on-duty=8hr → 63+8=71 > 70, restart needed
r_c63_6 = calculate_trip(make_route(300, 6.0), 63)

has_restart = lambda r: any(s["type"] == "restart" for s in r["stops"])

check("cycle=0:  no restart",       not has_restart(r_c0),
      f"stops: {[s['type'] for s in r_c0['stops']]}")
check("cycle=65: no restart (65+4=69 ≤ 70)",  not has_restart(r_c65),
      f"stops: {[s['type'] for s in r_c65['stops']]}")
check("cycle=68: restart fires",    has_restart(r_c68),
      f"stops: {[s['type'] for s in r_c68['stops']]}")
check("cycle=70: restart fires",    has_restart(r_c70),
      f"stops: {[s['type'] for s in r_c70['stops']]}")
check("cycle=69: restart fires (pickup pushes to 70)", has_restart(r_c69),
      f"stops: {[s['type'] for s in r_c69['stops']]}")
check("cycle=63, 5hr drive (total on-duty=7hr, 63+7=70): no restart",
      not has_restart(r_c63_5), f"stops: {[s['type'] for s in r_c63_5['stops']]}")
check("cycle=63, 6hr drive (total on-duty=8hr, 63+8=71): restart fires",
      has_restart(r_c63_6), f"stops: {[s['type'] for s in r_c63_6['stops']]}")

# CRITICAL: pre-restart driving must be capped (cycle=68 → only 1hr left after pickup)
restart_idx_68 = next((i for i, s in enumerate(r_c68["stops"]) if s["type"] == "restart"), None)
if restart_idx_68 is not None:
    day1_drive_68 = segment_duration(r_c68["daily_logs"][0], "driving")
    check(
        "CRITICAL — cycle=68: pre-restart driving capped at 1hr",
        day1_drive_68 <= 1.0 + EPSILON,
        f"day1 driving = {day1_drive_68} hr  ← ENGINE BUG if > 1",
    )
else:
    check("CRITICAL — cycle=68: pre-restart driving capped at 1hr", False, "no restart found")

# cycle=70: restart appears early (within first 3 stops)
restart_idx_70 = next((i for i, s in enumerate(r_c70["stops"]) if s["type"] == "restart"), None)
check("cycle=70: restart within first 3 stops",
      restart_idx_70 is not None and restart_idx_70 <= 2,
      f"restart at index {restart_idx_70}")

# cycle=67, 4hr drive: pickup(1hr)→cycle=68, drive 2hr→cycle=70, restart fires
r_c67 = calculate_trip(make_route(200, 4.0), 67)
check("cycle=67, 4hr drive: restart fires",
      has_restart(r_c67), f"stops: {[s['type'] for s in r_c67['stops']]}")
if has_restart(r_c67):
    day1_67 = segment_duration(r_c67["daily_logs"][0], "driving")
    check("cycle=67, 4hr drive: day1 driving ≤ 2hr (only 2hr of cycle left after pickup)",
          day1_67 <= 2.0 + EPSILON, f"day1 driving = {day1_67}")


# ════════════════════════════════════════════════════════════════════════════
#  SECTION 8 — 34-Hour Restart  § 395.3(c)
# ════════════════════════════════════════════════════════════════════════════
section(f"SECTION 8: {RESTART_HRS:.0f}-hour restart")

r_70r = calculate_trip(make_route(100, 2.0), 70)
restarts_70 = stops_of_type(r_70r, "restart")

check(f"Restart duration = {RESTART_HRS} hr",
      all(s["duration_hours"] == RESTART_HRS for s in restarts_70),
      f"durations = {[s['duration_hours'] for s in restarts_70]}")
check("Trip completes after restart (≥ 3 stops: pickup→restart→dropoff)",
      len(r_70r["stops"]) >= 3)

# restart must appear after pickup and before dropoff
stop_types_70 = [s["type"] for s in r_70r["stops"]]
if "restart" in stop_types_70:
    ri = stop_types_70.index("restart")
    pi = stop_types_70.index("pickup")
    di = len(stop_types_70) - 1 - stop_types_70[::-1].index("dropoff")
    check("Restart is after pickup and before dropoff",
          pi < ri < di, f"order = {stop_types_70}")

# After restart, cycle resets → ONLY 1 restart for a short post-restart trip
r_70_11 = calculate_trip(make_route(550, 11.0), 70)
restarts_70_11 = stops_of_type(r_70_11, "restart")
check("cycle=70, 11hr drive: exactly 1 restart (cycle resets — no double restart)",
      len(restarts_70_11) == 1, f"got {len(restarts_70_11)}")

# Total driving still = 11hr after restart
total_dr_70_11 = all_driving_hours(r_70_11)
check("cycle=70, 11hr drive: total driving = 11hr post-restart",
      abs(total_dr_70_11 - 11.0) < EPSILON, f"got {total_dr_70_11}")

# 34hr restart spans into daily_logs as off_duty/sleeper
restart_stop = next((s for s in r_70r["stops"] if s["type"] == "restart"), None)
if restart_stop:
    all_off_days = [
        log for log in r_70r["daily_logs"]
        if all(s["status"] in ("off_duty", "sleeper") for s in log["segments"])
    ]
    check("34hr restart: ≥ 1 fully off-duty day in daily_logs",
          len(all_off_days) >= 1,
          f"off-duty days: {len(all_off_days)} / {len(r_70r['daily_logs'])}")

    total_rest_hrs = sum(
        s["end_hour"] - s["start_hour"]
        for log in r_70r["daily_logs"]
        for s in log["segments"]
        if s["status"] in ("off_duty", "sleeper")
    )
    check(f"34hr restart: total off/sleeper ≥ {RESTART_HRS} hr",
          total_rest_hrs >= RESTART_HRS - EPSILON,
          f"total = {round(total_rest_hrs, 2)} hr")


# ════════════════════════════════════════════════════════════════════════════
#  SECTION 9 — Fuel Stops  (every 1,000 miles)
# ════════════════════════════════════════════════════════════════════════════
section(f"SECTION 9: Fuel stop every {FUEL_INTERVAL_MI:.0f} miles")

r_500    = calculate_trip(make_route(500,    8.0),  0)
r_999    = calculate_trip(make_route(999,   14.0),  0)
r_1000e  = calculate_trip(make_route(1000,  15.0),  0)   # exactly 1000 — no stop
r_1001   = calculate_trip(make_route(1001,  15.0),  0)
r_2000e  = calculate_trip(make_route(2000,  30.0),  0)   # exactly 2000 — 1 stop
r_2001   = calculate_trip(make_route(2001,  30.0),  0)
r_1000p  = calculate_trip(make_route(1000.01, 15.0), 0)  # just over 1000

f_500   = stops_of_type(r_500,   "fuel")
f_999   = stops_of_type(r_999,   "fuel")
f_1000e = stops_of_type(r_1000e, "fuel")
f_1001  = stops_of_type(r_1001,  "fuel")
f_2000e = stops_of_type(r_2000e, "fuel")
f_2001  = stops_of_type(r_2001,  "fuel")
f_1000p = stops_of_type(r_1000p, "fuel")

check("500mi:     no fuel stop",          len(f_500)   == 0, f"got {len(f_500)}")
check("999mi:     no fuel stop",          len(f_999)   == 0, f"got {len(f_999)}")
check("1000mi:    no fuel stop (at limit, not over)", len(f_1000e) == 0, f"got {len(f_1000e)}")
check("1000.01mi: exactly 1 fuel stop",   len(f_1000p) == 1, f"got {len(f_1000p)}")
check("1001mi:    exactly 1 fuel stop",   len(f_1001)  == 1, f"got {len(f_1001)}")
check("2000mi:    exactly 1 fuel stop (at 2nd threshold, not over)", len(f_2000e) == 1, f"got {len(f_2000e)}")
check("2001mi:    exactly 2 fuel stops",  len(f_2001)  == 2, f"got {len(f_2001)}")

# Fuel stop positioning: must be between pickup and dropoff
if f_1001:
    types_1001  = [s["type"] for s in r_1001["stops"]]
    pi = types_1001.index("pickup")
    di = len(types_1001) - 1 - types_1001[::-1].index("dropoff")
    fi = types_1001.index("fuel")
    check("1001mi: fuel stop is between pickup and dropoff",
          pi < fi < di,
          f"order = {types_1001}")

if f_2001:
    types_2001 = [s["type"] for s in r_2001["stops"]]
    pi2 = types_2001.index("pickup")
    di2 = len(types_2001) - 1 - types_2001[::-1].index("dropoff")
    fi2_all = [i for i, s in enumerate(r_2001["stops"]) if s["type"] == "fuel"]
    check("2001mi: both fuel stops are between pickup and dropoff",
          all(pi2 < fi < di2 for fi in fi2_all),
          f"order = {types_2001}")

# Fuel stop properties
if f_1001:
    check("Fuel stop duration > 0",               f_1001[0]["duration_hours"] > 0,
          f"duration = {f_1001[0]['duration_hours']}")
    check("Fuel stop has valid US lat/lng",        valid_us_coords(f_1001[0]),
          f"lat={f_1001[0].get('lat')}, lng={f_1001[0].get('lng')}")


# ════════════════════════════════════════════════════════════════════════════
#  SECTION 10 — Daily Log Integrity
# ════════════════════════════════════════════════════════════════════════════
section("SECTION 10: Daily log integrity")

r_12i = calculate_trip(make_route(600, 12.0), 0)

for log in r_12i["daily_logs"]:
    segs = sorted(log["segments"], key=lambda s: s["start_hour"])
    day  = log["day"]

    # Contiguous
    contiguous = all(
        abs(segs[i]["end_hour"] - segs[i+1]["start_hour"]) < EPSILON
        for i in range(len(segs) - 1)
    )
    check(f"Day {day}: segments contiguous (no gaps/overlaps)", contiguous,
          f"segments = {[(s['status'], s['start_hour'], s['end_hour']) for s in segs]}")

    # Drive total consistent
    reported = log["total_drive"]
    actual   = round(segment_duration(log, "driving"), 2)
    check(f"Day {day}: reported total_drive matches driving segments",
          abs(reported - actual) < EPSILON, f"reported={reported} actual={actual}")

    # total_on_duty = driving + on_duty segments
    actual_on_duty   = segment_duration(log, "on_duty") + segment_duration(log, "driving")
    reported_on_duty = log.get("total_on_duty", -1)
    check(f"Day {day}: total_on_duty = driving + on_duty segments",
          abs(reported_on_duty - actual_on_duty) < EPSILON,
          f"reported={reported_on_duty} actual={round(actual_on_duty,4)}")

    # start < end for every segment
    check(f"Day {day}: all segment start_hour < end_hour",
          all(s["start_hour"] < s["end_hour"] for s in segs))

    # No single driving segment > 8hr (break must intervene)
    for ds in [s for s in segs if s["status"] == "driving"]:
        dur = ds["end_hour"] - ds["start_hour"]
        check(f"Day {day}: no single driving segment > {BREAK_THRESHOLD_HRS} hr",
              dur <= BREAK_THRESHOLD_HRS + EPSILON, f"found {round(dur,2)} hr driving segment")

    # No segment end exceeds 24hr
    check(f"Day {day}: no segment end_hour > 24",
          all(s["end_hour"] <= 24.0 + EPSILON for s in segs),
          f"violations: {[s for s in segs if s['end_hour'] > 24.0 + EPSILON]}")

    # First segment of day 1 must be on_duty (pickup)
    if day == 1:
        check("Day 1: first segment is on_duty (pickup)",
              segs[0]["status"] == "on_duty",
              f"got '{segs[0]['status']}'")
        check(f"Day 1: first on_duty segment = {PICKUP_DURATION_HRS} hr (pickup)",
              abs((segs[0]["end_hour"] - segs[0]["start_hour"]) - PICKUP_DURATION_HRS) < EPSILON,
              f"got {segs[0]['end_hour'] - segs[0]['start_hour']} hr")

# Last segment of last day must be on_duty (dropoff)
last_log  = r_12i["daily_logs"][-1]
last_segs = sorted(last_log["segments"], key=lambda s: s["start_hour"])
check("Last day: last segment is on_duty (dropoff)",
      last_segs[-1]["status"] == "on_duty",
      f"got '{last_segs[-1]['status']}'")


# ════════════════════════════════════════════════════════════════════════════
#  SECTION 11 — Data Quality (arrival_time, lat/lng, dates)
# ════════════════════════════════════════════════════════════════════════════
section("SECTION 11: Data quality — arrival_time, lat/lng, dates")

r_dq = calculate_trip(make_route(600, 12.0), 0)

# A1: cache parse results — avoid calling parse_arrival twice per stop
parsed = [(s, parse_arrival(s)) for s in r_dq["stops"]]
check("A1: All stop arrival_times are valid datetime strings",
      all(dt is not None for _, dt in parsed),
      f"failed: {[s['type'] for s, dt in parsed if dt is None]}")

# A2: chronologically ordered — tz-naive comparison (crash-safe)
times_dq = [dt for _, dt in parsed if dt is not None]
try:
    chrono = all(times_dq[i] <= times_dq[i+1] for i in range(len(times_dq)-1))
except TypeError:
    chrono = False  # mixed tz-aware / tz-naive — engine bug
check("A2: Stop arrival_times non-decreasing (chronological)",
      chrono, f"times = {[str(t) for t in times_dq]}")

# A3: all stop lat/lng within plausible US bounds
check("A3: All stop lat/lng within US bounds",
      all(valid_us_coords(s) for s in r_dq["stops"]),
      f"bad: {[(s['type'], s.get('lat'), s.get('lng')) for s in r_dq['stops'] if not valid_us_coords(s)]}")

# A4: date fields in daily_logs parseable
date_ok = []
for log in r_dq["daily_logs"]:
    d = log.get("date")
    try:
        datetime.strptime(str(d), "%Y-%m-%d")
        date_ok.append(True)
    except Exception:
        try:
            datetime.fromisoformat(str(d))
            date_ok.append(True)
        except Exception:
            date_ok.append(False)
check("A4: All daily_log date fields are valid date strings",
      all(date_ok), f"dates = {[log.get('date') for log in r_dq['daily_logs']]}")

# A5: day 2 date ≥ day 1 date
if len(r_dq["daily_logs"]) >= 2:
    try:
        d1 = datetime.fromisoformat(str(r_dq["daily_logs"][0]["date"]))
        d2 = datetime.fromisoformat(str(r_dq["daily_logs"][1]["date"]))
        check("A5: Day 2 date ≥ Day 1 date", d2 >= d1,
              f"day1={r_dq['daily_logs'][0]['date']} day2={r_dq['daily_logs'][1]['date']}")
    except Exception as e:
        check("A5: Day 2 date ≥ Day 1 date", False, f"parse error: {e}")

# Rest stop lat/lng valid
r_rst = calculate_trip(make_route(600, 12.0), 0)
rest_s = stops_of_type(r_rst, "rest")
if rest_s:
    check("Rest stop lat/lng within US bounds", valid_us_coords(rest_s[0]),
          f"lat={rest_s[0].get('lat')}, lng={rest_s[0].get('lng')}")


# ════════════════════════════════════════════════════════════════════════════
#  SECTION 12 — Multi-Day / Multi-Restart Correctness
# ════════════════════════════════════════════════════════════════════════════
section("SECTION 12: Multi-day / multi-restart correctness")

r_28 = calculate_trip(make_route(1500, 28.0), 0)
r_75 = calculate_trip(make_route(5000, 75.0), 0)

ten_hr_28 = [s for s in r_28["stops"] if s["type"] == "rest" and s["duration_hours"] >= MANDATORY_REST_HRS]
check("28hr drive: ≥ 2 mandatory 10hr rest stops", len(ten_hr_28) >= 2,
      f"got {len(ten_hr_28)}")
check("28hr drive: total driving = 28hr",
      abs(all_driving_hours(r_28) - 28.0) < EPSILON * 10,
      f"got {all_driving_hours(r_28)}")
check("28hr drive: total_miles = 1500",
      abs(r_28["total_miles"] - 1500) < 1)
check("28hr drive: total_drive_hours = 28",
      abs(r_28["total_drive_hours"] - 28.0) < EPSILON)

# 75hr trip
try:
    check("5000mi/75hr: no infinite loop", True, f"completed in {r_75['total_days']} days")
    restarts_75 = stops_of_type(r_75, "restart")
    check("5000mi/75hr: ≥ 1 restart (cycle limit)", len(restarts_75) >= 1, f"got {len(restarts_75)}")
    check("5000mi/75hr: total driving = 75hr",
          abs(all_driving_hours(r_75) - 75.0) < 0.5, f"got {all_driving_hours(r_75)}")

    max_day = max(segment_duration(log, "driving") for log in r_75["daily_logs"])
    check(f"5000mi/75hr: no day > {MAX_DRIVE_HRS} hr driving",
          max_day <= MAX_DRIVE_HRS + EPSILON, f"max = {round(max_day,2)}")

    all_consistent = all(
        abs(log.get("total_drive", 0) - round(segment_duration(log, "driving"), 2)) < EPSILON
        for log in r_75["daily_logs"]
    )
    check("5000mi/75hr: all daily total_drive match driving segments", all_consistent)
except Exception as e:
    check("5000mi/75hr: no infinite loop", False, str(e))


# ════════════════════════════════════════════════════════════════════════════
#  SECTION 13 — Segment Contiguity Across All Days
# ════════════════════════════════════════════════════════════════════════════
section("SECTION 13: Segment contiguity — all days, all trips")

for label, miles, hours, cycle in [
    ("12hr",  600,  12.0, 0),
    ("28hr", 1500,  28.0, 0),
    ("75hr", 5000,  75.0, 0),
]:
    r_cont = calculate_trip(make_route(miles, hours), cycle)
    all_cont = True
    all_valid_t = True
    all_within_24 = True
    for log in r_cont["daily_logs"]:
        segs = sorted(log["segments"], key=lambda s: s["start_hour"])
        for i in range(len(segs) - 1):
            if abs(segs[i]["end_hour"] - segs[i+1]["start_hour"]) > EPSILON:
                all_cont = False
        for s in segs:
            if s["start_hour"] >= s["end_hour"]:
                all_valid_t = False
            if s["end_hour"] > 24.0 + EPSILON:
                all_within_24 = False
    check(f"{label}: all segments contiguous (no gaps)", all_cont)
    check(f"{label}: all start_hour < end_hour",         all_valid_t)
    check(f"{label}: no end_hour > 24",                  all_within_24)


# ════════════════════════════════════════════════════════════════════════════
#  SECTION 14 — Stop Sequence Integrity
# ════════════════════════════════════════════════════════════════════════════
section("SECTION 14: Stop sequence integrity")

for label, miles, hours, cycle in [
    ("2hr",      100,   2.0,  0),
    ("11hr",     550,  11.0,  0),
    ("12hr",     600,  12.0,  0),
    ("28hr",    1500,  28.0,  0),
    ("cycle=70", 100,   2.0, 70),
]:
    r_seq = calculate_trip(make_route(miles, hours), cycle)
    check(f"{label}: pickup is first stop",
          r_seq["stops"][0]["type"] == "pickup",
          f"got '{r_seq['stops'][0]['type']}'")
    check(f"{label}: dropoff is last stop",
          r_seq["stops"][-1]["type"] == "dropoff",
          f"got '{r_seq['stops'][-1]['type']}'")

# Exactly 1 pickup and 1 dropoff on a long trip
r_28s = calculate_trip(make_route(1500, 28.0), 0)
check("28hr: exactly 1 pickup",  len(stops_of_type(r_28s, "pickup"))  == 1)
check("28hr: exactly 1 dropoff", len(stops_of_type(r_28s, "dropoff")) == 1)

# Restart ordering on cycle=70
r_70s = calculate_trip(make_route(100, 2.0), 70)
types_70s = [s["type"] for s in r_70s["stops"]]
if "restart" in types_70s:
    ri = types_70s.index("restart")
    pi = types_70s.index("pickup")
    di = len(types_70s) - 1 - types_70s[::-1].index("dropoff")
    check("cycle=70: restart after pickup and before dropoff",
          pi < ri < di, f"order = {types_70s}")


# ════════════════════════════════════════════════════════════════════════════
#  SECTION 15 — total_miles / total_drive_hours Field Accuracy
# ════════════════════════════════════════════════════════════════════════════
section("SECTION 15: total_miles and total_drive_hours accuracy")

for label, miles, hours, cycle in [
    ("28hr trip",      1500, 28.0,  0),
    ("cycle=70, 11hr",  550, 11.0, 70),
    ("cycle=68, 5hr",   300,  5.0, 68),
    ("short 2hr",       100,  2.0,  0),
]:
    rk = calculate_trip(make_route(miles, hours), cycle)
    check(f"K1 {label}: total_miles = {miles}",
          abs(rk["total_miles"] - miles) < 1, f"got {rk['total_miles']}")
    check(f"K2 {label}: total_drive_hours = {hours}",
          abs(rk["total_drive_hours"] - hours) < EPSILON, f"got {rk['total_drive_hours']}")
    actual_sum = sum(segment_duration(log, "driving") for log in rk["daily_logs"])
    check(f"K3 {label}: total_drive_hours matches sum of daily driving",
          abs(rk["total_drive_hours"] - actual_sum) < EPSILON,
          f"reported={rk['total_drive_hours']} sum={round(actual_sum,2)}")


# ════════════════════════════════════════════════════════════════════════════
#  SECTION 16 — Exact Boundary Conditions
# ════════════════════════════════════════════════════════════════════════════
section("SECTION 16: Exact boundary conditions")

r_8e   = calculate_trip(make_route(400,    8.0),    0)
r_11e  = calculate_trip(make_route(550,   11.0),    0)
r_11p  = calculate_trip(make_route(551,   11.01),   0)
r_1ke  = calculate_trip(make_route(1000,  15.0),    0)
r_1kp  = calculate_trip(make_route(1000.01, 15.0),  0)
r_2ke  = calculate_trip(make_route(2000,  30.0),    0)
r_70e  = calculate_trip(make_route(100,    2.0),   70)  # cycle exactly at limit

check(f"I1: {BREAK_THRESHOLD_HRS}hr drive: NO break (at threshold, not over)",
      len([s for s in r_8e["stops"] if s["type"] == "rest" and s["duration_hours"] < MANDATORY_REST_HRS]) == 0)
check(f"I2: {MAX_DRIVE_HRS}hr drive: completes in 1 day",
      r_11e["total_days"] == 1, f"got {r_11e['total_days']}")
check("I3: 11.01hr drive: splits to 2 days",
      r_11p["total_days"] >= 2, f"got {r_11p['total_days']}")
check(f"I4: {FUEL_INTERVAL_MI:.0f}mi exactly: no fuel stop",
      len(stops_of_type(r_1ke, "fuel")) == 0,
      f"got {len(stops_of_type(r_1ke, 'fuel'))}")
check("I5: 1000.01mi: exactly 1 fuel stop",
      len(stops_of_type(r_1kp, "fuel")) == 1,
      f"got {len(stops_of_type(r_1kp, 'fuel'))}")
check(f"I6: {FUEL_INTERVAL_MI*2:.0f}mi exactly: 1 fuel stop (not 2)",
      len(stops_of_type(r_2ke, "fuel")) == 1,
      f"got {len(stops_of_type(r_2ke, 'fuel'))}")
check(f"I7: cycle={CYCLE_LIMIT_HRS:.0f}: restart fires immediately",
      any(s["type"] == "restart" for s in r_70e["stops"]))


# ════════════════════════════════════════════════════════════════════════════
#  SECTION 17 — State Isolation (no cross-call pollution)
# ════════════════════════════════════════════════════════════════════════════
section("SECTION 17: State isolation — no pollution between calls")

r_m1a = calculate_trip(make_route(600, 12.0), 0)
r_m1b = calculate_trip(make_route(600, 12.0), 0)
check("M1: identical inputs → identical total_days",
      r_m1a["total_days"] == r_m1b["total_days"],
      f"a={r_m1a['total_days']} b={r_m1b['total_days']}")
check("M1b: identical inputs → identical stop count",
      len(r_m1a["stops"]) == len(r_m1b["stops"]),
      f"a={len(r_m1a['stops'])} b={len(r_m1b['stops'])}")

r_m2_hi  = calculate_trip(make_route(100, 2.0), 70)  # triggers restart
r_m2_low = calculate_trip(make_route(100, 2.0),  0)  # must NOT trigger restart
check("M2: cycle=0 call after cycle=70 call has no restart (no state leak)",
      not any(s["type"] == "restart" for s in r_m2_low["stops"]),
      f"stops = {[s['type'] for s in r_m2_low['stops']]}")

r_m3a = calculate_trip(make_route(100,  2.0),  0)
r_m3b = calculate_trip(make_route(1500, 28.0), 0)
r_m3c = calculate_trip(make_route(100,  2.0),  0)
check("M3: short trip after long trip still completes in 1 day",
      r_m3c["total_days"] == 1, f"got {r_m3c['total_days']}")

r_m4a = calculate_trip(make_route(100, 2.0), 70)  # restart call
r_m4b = calculate_trip(make_route(100, 2.0), 65)  # should NOT restart (65+4=69)
check("M4: cycle=65 call after cycle=70 call: no restart (no cycle state leak)",
      not any(s["type"] == "restart" for s in r_m4b["stops"]),
      f"stops = {[s['type'] for s in r_m4b['stops']]}")


# ════════════════════════════════════════════════════════════════════════════
#  SECTION 18 — Edge Cases / Input Robustness
# ════════════════════════════════════════════════════════════════════════════
section("SECTION 18: Edge cases & input robustness")

# Tiny trip
r_tiny = calculate_trip(make_route(10, 0.5), 0)
check("0.5hr/10mi: completes in 1 day",      r_tiny["total_days"] == 1)
check("0.5hr/10mi: no fuel stop",            len(stops_of_type(r_tiny, "fuel")) == 0)
check("0.5hr/10mi: has pickup and dropoff",
      len(stops_of_type(r_tiny, "pickup")) == 1 and len(stops_of_type(r_tiny, "dropoff")) == 1)

# High cycle but trip fits without restart
r_hi_ok = calculate_trip(make_route(10, 0.5), 66)
# pickup(1)+drive(0.5)+dropoff(1) = 2.5hr on-duty → 66+2.5=68.5 ≤ 70
check("cycle=66, 0.5hr drive: no restart (68.5 ≤ 70)",
      not any(s["type"] == "restart" for s in r_hi_ok["stops"]),
      f"stops: {[s['type'] for s in r_hi_ok['stops']]}")

# cycle > 70 (corrupt / stale value from caller)
try:
    r_over = calculate_trip(make_route(100, 2.0), 80)
    check("cycle=80 (over limit): restart fires immediately",
          any(s["type"] == "restart" for s in r_over["stops"]),
          f"stops: {[s['type'] for s in r_over['stops']]}")
    check("cycle=80: trip completes (pickup+restart+dropoff present)",
          len(r_over["stops"]) >= 3)
except Exception as e:
    check("cycle=80 (over limit): engine handles without crash", False, str(e))

# cycle as a float with fractional part
try:
    r_float_cycle = calculate_trip(make_route(100, 2.0), 68.5)
    # 68.5 + pickup(1) = 69.5, + drive(2) = 71.5 → restart
    check("cycle=68.5 (float): restart fires",
          any(s["type"] == "restart" for s in r_float_cycle["stops"]),
          f"stops: {[s['type'] for s in r_float_cycle['stops']]}")
except Exception as e:
    check("cycle=68.5 (float): engine handles without crash", False, str(e))

# Zero-distance / zero-time trip
try:
    r_zero = calculate_trip(make_route(0, 0.0), 0)
    check("0mi/0hr trip: engine returns without crash", True)
    check("0mi/0hr trip: has pickup and dropoff",
          len(stops_of_type(r_zero, "pickup")) == 1 and len(stops_of_type(r_zero, "dropoff")) == 1)
except Exception as e:
    check("0mi/0hr trip: engine handles gracefully", False, str(e))

# Cycle limit triggered mid-drive across days: cycle=68, long drive
try:
    r_c68_long = calculate_trip(make_route(600, 12.0), 68)
    check("cycle=68, 12hr drive: restart fires and trip completes",
          any(s["type"] == "restart" for s in r_c68_long["stops"])
          and r_c68_long["stops"][-1]["type"] == "dropoff",
          f"stops: {[s['type'] for s in r_c68_long['stops']]}")
    total_dr = all_driving_hours(r_c68_long)
    check("cycle=68, 12hr drive: total driving = 12hr",
          abs(total_dr - 12.0) < EPSILON, f"got {total_dr}")
except Exception as e:
    check("cycle=68, 12hr drive: completes without crash", False, str(e))


# ════════════════════════════════════════════════════════════════════════════
#  SECTION 19 — Comprehensive HOS Compliance Cross-Check
# ════════════════════════════════════════════════════════════════════════════
section("SECTION 19: Cross-check — all HOS rules hold on every trip in one pass")

TRIPS = [
    ("2hr",       100,  2.0,  0),
    ("7hr",       350,  7.0,  0),
    ("9hr",       450,  9.0,  0),
    ("11hr",      550, 11.0,  0),
    ("12hr",      600, 12.0,  0),
    ("28hr",     1500, 28.0,  0),
    ("11hr,c70",  550, 11.0, 70),
    ("5hr,c68",   300,  5.0, 68),
]

for label, miles, hours, cycle in TRIPS:
    r_x = calculate_trip(make_route(miles, hours), cycle)

    # 11-hr limit: no day exceeds MAX_DRIVE_HRS
    max_day_x = max(segment_duration(log, "driving") for log in r_x["daily_logs"])
    check(f"[{label}] no day > {MAX_DRIVE_HRS} hr driving",
          max_day_x <= MAX_DRIVE_HRS + EPSILON, f"max={round(max_day_x,2)}")

    # 14-hr window: last driving end ≤ 14 hr per shift
    for log in r_x["daily_logs"]:
        lde = last_driving_end(log)
        if lde > 0:
            check(f"[{label}] day {log['day']}: last driving ends ≤ {DRIVE_WINDOW_HRS} hr",
                  lde <= DRIVE_WINDOW_HRS + EPSILON, f"last_driving_end={round(lde,2)}")

    # total_drive_hours matches sum of logs
    actual_sum_x = sum(segment_duration(log, "driving") for log in r_x["daily_logs"])
    check(f"[{label}] total_drive_hours matches sum of daily logs",
          abs(r_x["total_drive_hours"] - actual_sum_x) < EPSILON,
          f"reported={r_x['total_drive_hours']} sum={round(actual_sum_x,2)}")

    # Pickup first, dropoff last
    check(f"[{label}] pickup first, dropoff last",
          r_x["stops"][0]["type"] == "pickup" and r_x["stops"][-1]["type"] == "dropoff")


# ════════════════════════════════════════════════════════════════════════════
#  SUMMARY
# ════════════════════════════════════════════════════════════════════════════
print(f"\n{'═'*50}")
print("  SUMMARY")
print(f"{'═'*50}")

passed = sum(1 for _, ok in results if ok)
failed = sum(1 for _, ok in results if not ok)
total  = len(results)

print(f"\n  Total:  {total}")
print(f"  {PASS}:  {passed}")
print(f"  {FAIL}:  {failed}")

if failed:
    print("\nFailed tests:")
    for name, ok in results:
        if not ok:
            print(f"  ❌ {name}")
    sys.exit(1)
else:
    print("\nAll tests passed! Backend is HOS-compliant. ✅")