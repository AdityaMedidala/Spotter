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
const STOP_RADIUS: Record<Stop['type'], number> = {
  pickup: 10, dropoff: 10, rest: 7, fuel: 7, restart: 9,
};

const CURRENT_COLOR = '#fbbf24'; // amber, distinct from pickup green

function formatArrivalTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

interface Props {
  result: TripResult;
  // Optional — pass from page.tsx so the popup shows the actual address.
  // Falls back to a generic label if not provided.
  currentLocation?: string;
}

export default function RouteMap({ result, currentLocation }: Props) {
  const { polyline, stops } = result;

  const midIdx = Math.floor(polyline.length / 2);
  const center: [number, number] = polyline.length > 0
    ? [polyline[midIdx][0], polyline[midIdx][1]]
    : [39.5, -98.35];

  // First polyline coord is the driver's current position before the trip starts.
  const currentPos: [number, number] | null = polyline.length > 0
    ? [polyline[0][0], polyline[0][1]]
    : null;

  return (
    <MapContainer
      center={center}
      zoom={5}
      style={{ height: '420px', width: '100%' }}
      zoomControl
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://carto.com/">CARTO</a>'
        subdomains="abcd"
        maxZoom={19}
      />

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

      {/* Current location — outer dashed ring + inner filled dot reads as
          "you are here" instead of a scheduled stop. */}
      {currentPos && (
        <>
          <CircleMarker
            center={currentPos}
            radius={14}
            pathOptions={{
              color: CURRENT_COLOR,
              fillColor: CURRENT_COLOR,
              fillOpacity: 0,
              weight: 2,
              dashArray: '4 3',
            }}
          />
          <CircleMarker
            center={currentPos}
            radius={6}
            pathOptions={{
              color: CURRENT_COLOR,
              fillColor: CURRENT_COLOR,
              fillOpacity: 1,
              weight: 2,
            }}
          >
            <Popup>
              <div style={{ minWidth: '160px', lineHeight: '1.6' }}>
                <div style={{
                  fontFamily: 'var(--font-display)',
                  fontWeight: 700,
                  fontSize: '1rem',
                  color: CURRENT_COLOR,
                  marginBottom: '0.4rem',
                  letterSpacing: '0.03em',
                }}>
                  🚚 Current Location
                </div>
                <div style={{ color: '#cbd5e1', fontSize: '0.78rem' }}>
                  <div>📍 {currentLocation ?? 'Trip start point'}</div>
                  <div style={{ marginTop: '0.25rem', opacity: 0.7 }}>
                    Driver position before pickup
                  </div>
                </div>
              </div>
            </Popup>
          </CircleMarker>
        </>
      )}

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
                <div>🕐 {formatArrivalTime(stop.arrival_time)}</div>
                <div>⏱ {stop.duration_hours.toFixed(1)} hr stop</div>
              </div>
            </div>
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}