'use client';

import { useEffect } from 'react';
import {
  MapContainer, TileLayer, Polyline, CircleMarker, Popup, useMap
} from 'react-leaflet';
import type { TripResult, Stop } from './types';
import { STOP_COLORS, STOP_LABELS } from './types';
import 'leaflet/dist/leaflet.css';

// ── Auto-fit bounds to route ─────────────────────────────────────────────────
function FitBounds({ polyline }: { polyline: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (polyline.length > 0) {
      map.fitBounds(polyline, { padding: [40, 40] });
    }
  }, [map, polyline]);
  return null;
}

// ── Stop marker radius and label ─────────────────────────────────────────────
// 'start' is a frontend-only type used by the timeline & ELD remarks; it never
// reaches the map (the map renders raw result.stops, not transformed display
// stops). The 0 here is just to satisfy TypeScript's exhaustive Record check.
const STOP_RADIUS: Record<Stop['type'], number> = {
  start: 0, pickup: 10, dropoff: 10, rest: 7, fuel: 7, restart: 9,
};

interface Props { result: TripResult; currentLocation?: string;}

export default function RouteMap({ result }: Props) {
  const { polyline, stops } = result;

  // Map centre defaults to midpoint of polyline
  const midIdx = Math.floor(polyline.length / 2);
  const center: [number, number] = polyline.length > 0
    ? [polyline[midIdx][0], polyline[midIdx][1]]
    : [39.5, -98.35]; // geographic center of US

  return (
    <MapContainer
      center={center}
      zoom={5}
      style={{ height: '420px', width: '100%' }}
      zoomControl
    >
      {/* Dark tile layer from CartoDB */}
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://carto.com/">CARTO</a>'
        subdomains="abcd"
        maxZoom={19}
      />

      {/* Auto-fit */}
      <FitBounds polyline={polyline} />

      {/* Route polyline */}
      <Polyline
        positions={polyline}
        pathOptions={{ color: '#3b82f6', weight: 3, opacity: 0.85 }}
      />

      {/* Glowing route outline */}
      <Polyline
        positions={polyline}
        pathOptions={{ color: '#60a5fa', weight: 6, opacity: 0.15 }}
      />

      {/* Stop markers */}
      {stops.map((stop, idx) => (
        <CircleMarker
          key={idx}
          center={[stop.lat, stop.lng]}
          radius={STOP_RADIUS[stop.type]}
          pathOptions={{
            color: STOP_COLORS[stop.type],
            fillColor: STOP_COLORS[stop.type],
            fillOpacity: 0.9,
            weight: 2,
          }}
        >
          <Popup>
            <div style={{ minWidth: '160px', lineHeight: '1.6' }}>
              <div style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 700,
                fontSize: '1rem',
                color: STOP_COLORS[stop.type],
                marginBottom: '0.4rem',
                letterSpacing: '0.03em',
              }}>
                {STOP_LABELS[stop.type]}
              </div>
              <div style={{ color: '#cbd5e1', fontSize: '0.78rem' }}>
                <div>📍 {stop.location}</div>
                <div>🕐 {stop.arrival_time}</div>
                <div>⏱ {stop.duration_hours.toFixed(1)} hr stop</div>
              </div>
            </div>
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}