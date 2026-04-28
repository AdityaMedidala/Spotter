'use client';

import { useRef, useEffect } from 'react';
import type { DailyLog, LogSegment, Stop } from './types';
import { ELD_COLORS, ELD_LABELS } from './types';

// ── EXACT PIXEL COORDINATES ──────────────────────────────────────────────────
// Coordinates are expressed in a fixed "logical" space of 513×518 — the
// dimensions of the original FMCSA blank log form. Higher-res source PNGs
// are scaled down into this space, so all measured constants stay valid.
//
// Grid horizontal:
//   GRID_LEFT  = 64    (first hour tick — midnight)
//   GRID_RIGHT = 454   (last hour tick — midnight end)
//   GRID_WIDTH = 390px for 24 hours → 16.25px per hour
// ────────────────────────────────────────────────────────────────────────────
const LOGICAL_W = 513;
const LOGICAL_H = 518;

const GRID_LEFT  = 64;
const GRID_RIGHT = 454;
const GRID_W     = GRID_RIGHT - GRID_LEFT; // 390
const HOUR_W     = GRID_W / 24;            // 16.25

const ROW_Y: Record<LogSegment['status'], number> = {
  off_duty: 192,
  sleeper:  209,
  driving:  226,
  on_duty:  244,
};

// FIX: thin sharp lines, not thick rounded bars. Real FMCSA paper logs are
// drawn with a pen stroke maybe 1-2px relative to the row height. We use 3
// here — visible at screen size without dominating the form. Combined with
// butt caps and miter joins, this produces clean L-shapes at each transition
// instead of pill-shaped blobs.
const LINE_W = 3;

const REMARKS_TICK_TOP = 252;
const REMARKS_TICK_BOT = 268;
const REMARKS_LABEL_Y  = 272;

const RENDER_SCALE = 3; // 513×518 → 1539×1554 internal buffer for crispness

const TEXT_FIELDS = {
  date:        { x: 55,  y: 25,  font: '10px JetBrains Mono, monospace' },
  totalMiles:  { x: 165, y: 25,  font: '10px JetBrains Mono, monospace' },
  carrier:     { x: 55,  y: 60,  font: '9px JetBrains Mono, monospace' },
  from:        { x: 55,  y: 80,  font: '9px JetBrains Mono, monospace' },
  to:          { x: 280, y: 80,  font: '9px JetBrains Mono, monospace' },
};

interface Props {
  log: DailyLog;
  totalMiles: number;
  totalDriveHours: number;
  fromLocation: string;
  toLocation: string;
  stops?: Stop[];
}

interface RemarkLabel {
  hour: number;
  label: string;
  color: string;
}

export default function EldLogSheet({
  log, totalMiles, totalDriveHours, fromLocation, toLocation, stops,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let cancelled = false;

    const img = new Image();
    img.src = '/blank-paper-log.png';

    img.onload = () => {
      if (cancelled) return;

      const dpr = window.devicePixelRatio || 1;
      const totalScale = RENDER_SCALE * dpr;

      canvas.width  = LOGICAL_W * totalScale;
      canvas.height = LOGICAL_H * totalScale;
      canvas.style.width  = `${LOGICAL_W}px`;
      canvas.style.height = `${LOGICAL_H}px`;
      ctx.scale(totalScale, totalScale);

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      // ── 1. Background ────────────────────────────────────────────────────
      ctx.drawImage(img, 0, 0, LOGICAL_W, LOGICAL_H);

      // ── 2. Metadata text ─────────────────────────────────────────────────
      ctx.fillStyle = '#111827';
      ctx.font = TEXT_FIELDS.date.font;
      ctx.fillText(formatDate(log.date), TEXT_FIELDS.date.x, TEXT_FIELDS.date.y);

      const driveMiles = totalDriveHours > 0
        ? Math.round((log.total_drive / totalDriveHours) * totalMiles)
        : 0;
      ctx.font = TEXT_FIELDS.totalMiles.font;
      ctx.fillText(`${driveMiles} mi`, TEXT_FIELDS.totalMiles.x, TEXT_FIELDS.totalMiles.y);

      ctx.font = TEXT_FIELDS.carrier.font;
      ctx.fillStyle = '#374151';
      ctx.fillText('ELD Trip Planner', TEXT_FIELDS.carrier.x, TEXT_FIELDS.carrier.y);

      ctx.font = TEXT_FIELDS.from.font;
      ctx.fillText(fromLocation, TEXT_FIELDS.from.x, TEXT_FIELDS.from.y);
      ctx.font = TEXT_FIELDS.to.font;
      ctx.fillText(toLocation, TEXT_FIELDS.to.x, TEXT_FIELDS.to.y);

      ctx.font = 'bold 9px JetBrains Mono, monospace';
      ctx.fillStyle = '#374151';
      ctx.fillText(`Day ${log.day}`, 440, 20);

      // ── 3. Duty-status path: each segment draws its own bar + the connector
      //       to the next segment as ONE continuous L-path. With miter joins,
      //       the corner is a clean sharp 90° angle instead of two separate
      //       rectangles colliding awkwardly.
      // ─────────────────────────────────────────────────────────────────────
      ctx.lineWidth = LINE_W;
      ctx.lineCap   = 'butt';
      ctx.lineJoin  = 'miter';
      ctx.miterLimit = 2;

      log.segments.forEach((seg, i) => {
        const rowY = ROW_Y[seg.status];
        if (rowY === undefined) return;

        const start = Math.max(0, Math.min(24, seg.start_hour));
        const end   = Math.max(0, Math.min(24, seg.end_hour));
        if (end <= start) return;

        const x1 = GRID_LEFT + start * HOUR_W;
        const x2 = GRID_LEFT + end * HOUR_W;

        ctx.beginPath();
        ctx.strokeStyle = ELD_COLORS[seg.status];

        // Horizontal bar
        ctx.moveTo(x1, rowY);
        ctx.lineTo(x2, rowY);

        // Connector to next segment (same path, so the bend is mitered)
        const next = log.segments[i + 1];
        if (next) {
          const nextRowY = ROW_Y[next.status];
          if (nextRowY !== undefined && nextRowY !== rowY) {
            ctx.lineTo(x2, nextRowY);
          }
        }

        ctx.stroke();
      });

      // ── 4. Total hours column ───────────────────────────────────────────
      const TOTAL_X = 462;
      const totals: Record<LogSegment['status'], number> = {
        off_duty: 0, sleeper: 0, driving: 0, on_duty: 0,
      };
      log.segments.forEach((s) => {
        totals[s.status] = (totals[s.status] || 0) + (s.end_hour - s.start_hour);
      });

      const rowOrder: Array<keyof typeof ROW_Y> = ['off_duty', 'sleeper', 'driving', 'on_duty'];
      rowOrder.forEach((status) => {
        const y = ROW_Y[status];
        ctx.font = 'bold 8px JetBrains Mono, monospace';
        ctx.fillStyle = ELD_COLORS[status];
        ctx.fillText(totals[status].toFixed(1), TOTAL_X, y + 3);
      });

      const total24 = Object.values(totals).reduce((a, b) => a + b, 0);
      ctx.font = '8px JetBrains Mono, monospace';
      ctx.fillStyle = '#374151';
      ctx.fillText(`${total24.toFixed(1)}h`, TOTAL_X, 260);

      // ── 5. Remarks — rotated location labels ────────────────────────────
      const remarks = buildRemarksForShift(log, stops ?? []);

      remarks.forEach((r) => {
        const x = GRID_LEFT + Math.max(0, Math.min(24, r.hour)) * HOUR_W;

        // Thin tick line dropping into remarks zone (pointer, not part of path)
        ctx.fillStyle = r.color;
        ctx.fillRect(x - 0.5, REMARKS_TICK_TOP, 1, REMARKS_TICK_BOT - REMARKS_TICK_TOP);

        ctx.save();
        ctx.translate(x, REMARKS_LABEL_Y);
        ctx.rotate((60 * Math.PI) / 180);
        ctx.font = '7.5px JetBrains Mono, monospace';
        ctx.fillStyle = '#1e293b';
        ctx.fillText(r.label, 0, 0);
        ctx.restore();
      });
    };

    img.onerror = () => {
      if (cancelled) return;
      canvas.width  = LOGICAL_W;
      canvas.height = LOGICAL_H;
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
      ctx.fillStyle = '#374151';
      ctx.font = '14px JetBrains Mono, monospace';
      ctx.fillText('Place blank-paper-log.png in /public/', 20, 260);
    };

    return () => {
      cancelled = true;
      img.onload = null;
      img.onerror = null;
    };
  }, [log, totalMiles, totalDriveHours, fromLocation, toLocation, stops]);

  const totalSegmentHours = log.segments.reduce(
    (acc, seg) => acc + (seg.end_hour - seg.start_hour), 0,
  );

  return (
    <div>
      {/* ── Canvas ── */}
      <div style={{
        border: '1px solid var(--border)',
        borderRadius: '8px',
        overflow: 'hidden',
        background: '#f8fafc',
        lineHeight: 0,
      }}>
        <canvas
          ref={canvasRef}
          style={{ width: '100%', height: 'auto', display: 'block' }}
        />
      </div>

      {/* ── Legend ── */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '0.75rem',
        marginTop: '0.75rem',
        padding: '0.75rem',
        background: 'var(--bg-raised)',
        border: '1px solid var(--border)',
        borderRadius: '8px',
      }}>
        {(Object.keys(ROW_Y) as Array<LogSegment['status']>).map((status) => {
          const dur = log.segments
            .filter(s => s.status === status)
            .reduce((acc, s) => acc + (s.end_hour - s.start_hour), 0);
          return (
            <div key={status} style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.72rem',
            }}>
              <div style={{
                width: '28px', height: '6px',
                background: ELD_COLORS[status],
                borderRadius: '3px',
                boxShadow: `0 0 6px ${ELD_COLORS[status]}80`,
              }} />
              <span style={{ color: 'var(--text-secondary)' }}>
                {ELD_LABELS[status]}
              </span>
              <span style={{ color: ELD_COLORS[status], fontWeight: 600 }}>
                {dur.toFixed(1)}h
              </span>
            </div>
          );
        })}
      </div>

      {/* ── Segment table ── */}
      <div style={{
        marginTop: '0.75rem',
        background: 'var(--bg-raised)',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        overflow: 'hidden',
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.72rem', fontFamily: 'var(--font-mono)' }}>
          <thead>
            <tr style={{ background: 'var(--bg-hover)' }}>
              {['Status', 'From', 'To', 'Duration'].map(h => (
                <th key={h} style={{
                  padding: '0.5rem 0.75rem',
                  textAlign: 'left',
                  color: 'var(--text-muted)',
                  fontWeight: 600,
                  fontSize: '0.65rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  borderBottom: '1px solid var(--border)',
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {log.segments.map((seg, i) => {
              const dur = seg.end_hour - seg.start_hour;
              return (
                <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '0.4rem 0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span style={{
                        width: '8px', height: '8px', borderRadius: '2px',
                        background: ELD_COLORS[seg.status], flexShrink: 0,
                      }} />
                      <span style={{ color: 'var(--text-secondary)' }}>
                        {ELD_LABELS[seg.status]}
                      </span>
                    </div>
                  </td>
                  <td style={{ padding: '0.4rem 0.75rem', color: 'var(--text-primary)' }}>
                    {formatHour(seg.start_hour)}
                  </td>
                  <td style={{ padding: '0.4rem 0.75rem', color: 'var(--text-primary)' }}>
                    {formatHour(seg.end_hour)}
                  </td>
                  <td style={{ padding: '0.4rem 0.75rem', color: ELD_COLORS[seg.status], fontWeight: 600 }}>
                    {dur.toFixed(2)}h
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr style={{ background: 'var(--bg-hover)' }}>
              <td colSpan={3} style={{ padding: '0.4rem 0.75rem', color: 'var(--text-muted)', fontSize: '0.65rem' }}>
                Drive: {log.total_drive.toFixed(1)}h · On-Duty: {log.total_on_duty.toFixed(1)}h
              </td>
              <td style={{ padding: '0.4rem 0.75rem', color: 'var(--amber)', fontWeight: 700 }}>
                {totalSegmentHours.toFixed(2)}h
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

function formatHour(h: number): string {
  const hh = Math.floor(h) % 24;
  const mm = Math.round((h % 1) * 60);
  const period = hh < 12 ? 'AM' : 'PM';
  const displayH = hh === 0 ? 12 : hh > 12 ? hh - 12 : hh;
  return `${displayH}:${mm.toString().padStart(2, '0')} ${period}`;
}

function buildRemarksForShift(log: DailyLog, stops: Stop[]): RemarkLabel[] {
  if (!stops || stops.length === 0) return [];

  const shiftStart = log.start_time ? new Date(log.start_time) : null;
  const shiftStartValid = shiftStart && !isNaN(shiftStart.getTime());

  const shiftSpan = log.segments.reduce(
    (max, s) => Math.max(max, s.end_hour), 0,
  );
  const TOL = 0.02;

  return stops
    .map<RemarkLabel | null>((stop) => {
      const arr = new Date(stop.arrival_time);
      if (isNaN(arr.getTime())) return null;

      let hour: number;
      if (shiftStartValid) {
        const ms = arr.getTime() - shiftStart!.getTime();
        hour = ms / (1000 * 60 * 60);
        if (hour < -TOL || hour > shiftSpan + TOL) return null;
      } else {
        const yyyy = arr.getFullYear();
        const mm   = String(arr.getMonth() + 1).padStart(2, '0');
        const dd   = String(arr.getDate()).padStart(2, '0');
        if (`${yyyy}-${mm}-${dd}` !== log.date) return null;
        hour = arr.getHours() + arr.getMinutes() / 60;
      }

      const TYPE_COLORS: Record<Stop['type'], string> = {
        pickup:  '#16a34a',
        dropoff: '#dc2626',
        rest:    '#ea580c',
        fuel:    '#2563eb',
        restart: '#7c3aed',
      };

      const TYPE_PREFIX: Record<Stop['type'], string> = {
        pickup:  'PU',
        dropoff: 'DO',
        rest:    'Rest',
        fuel:    'Fuel',
        restart: '34hr',
      };

      const loc = stop.location.length > 28
        ? stop.location.slice(0, 27) + '…'
        : stop.location;

      return {
        hour,
        label: `${TYPE_PREFIX[stop.type]} — ${loc}`,
        color: TYPE_COLORS[stop.type],
      };
    })
    .filter((r): r is RemarkLabel => r !== null);
}