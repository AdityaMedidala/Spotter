// ── API request ──────────────────────────────────────────────────────────────
export interface TripRequest {
  current_location: string;
  pickup_location: string;
  dropoff_location: string;
  cycle_used_hours: number;
}

// ── API response ─────────────────────────────────────────────────────────────
// 'start' is a frontend-synthesized stop type representing the moment the
// driver begins their trip at the current_location. The backend never emits
// this type — it's added by buildDisplayStops in page.tsx so the timeline
// and ELD log labels reflect when events actually happen geographically.
export interface Stop {
  type: 'start' | 'pickup' | 'dropoff' | 'rest' | 'fuel' | 'restart';
  location: string;
  arrival_time: string;
  duration_hours: number;
  lat: number;
  lng: number;
}

export interface LogSegment {
  status: 'off_duty' | 'sleeper' | 'driving' | 'on_duty';
  start_hour: number;
  end_hour: number;
}

export interface DailyLog {
  day: number;
  date: string;
  start_time: string;
  segments: LogSegment[];
  total_drive: number;
  total_on_duty: number;
}

export interface TripResult {
  stops: Stop[];
  daily_logs: DailyLog[];
  polyline: [number, number][];
  total_miles: number;
  total_days: number;
  total_drive_hours: number;
}

// ── Stop colour map ───────────────────────────────────────────────────────────
export const STOP_COLORS: Record<Stop['type'], string> = {
  start:   '#eab308',  // amber, matches the current-location pin on the map
  pickup:  '#22c55e',
  dropoff: '#ef4444',
  rest:    '#f97316',
  fuel:    '#3b82f6',
  restart: '#a855f7',
};

export const STOP_LABELS: Record<Stop['type'], string> = {
  start:   '🚛 Trip Start',
  pickup:  '📦 Pickup',
  dropoff: '🏁 Dropoff',
  rest:    '💤 Rest',
  fuel:    '⛽ Fuel',
  restart: '🔄 34-hr Restart',
};

// ── ELD status colours ────────────────────────────────────────────────────────
export const ELD_COLORS: Record<LogSegment['status'], string> = {
  off_duty: '#475569',
  sleeper:  '#7c3aed',
  driving:  '#16a34a',
  on_duty:  '#1d4ed8',
};

export const ELD_LABELS: Record<LogSegment['status'], string> = {
  off_duty: 'Off Duty',
  sleeper:  'Sleeper Berth',
  driving:  'Driving',
  on_duty:  'On Duty (Not Driving)',
};