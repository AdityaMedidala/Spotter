'use client';

import { useRef, useEffect } from 'react';
import type { DailyLog, LogSegment, Stop } from './types';
import { ELD_COLORS, ELD_LABELS } from './types';

// ── BASE COORDINATES (calibrated for the 513×518 blank-paper-log) ────────────
// If a higher-res version is loaded (e.g. 1024×1034 Gemini upscale) the code
// computes IMG_SCALE = img.naturalWidth / BASE_W and multiplies every pixel
// value so the overlay lands in exactly the right spot regardless of resolution.
// ─────────────────────────────────────────────────────────────────────────────
const BASE_W = 513;

const BASE_GRID_LEFT  = 64;
const BASE_GRID_RIGHT = 454;
const BASE_GRID_W     = BASE_GRID_RIGHT - BASE_GRID_LEFT; // 390
const BASE_HOUR_W     = BASE_GRID_W / 24;                 // 16.25

const BASE_ROW_Y: Record<LogSegment['status'], number> = {
  off_duty: 192,
  sleeper:  209,
  driving:  226,
  on_duty:  244,
};

const BASE_LINE_H      = 8;
const BASE_CONNECTOR_W = 2;

const BASE_REMARKS_TICK_TOP = 252;
const BASE_REMARKS_TICK_BOT = 268;
const BASE_REMARKS_LABEL_Y  = 272;

const BASE_TOTAL_X = 462;

const BASE_TEXT_FIELDS = {
  date:       { x:  55, y:  25, size: 10 },
  totalMiles: { x: 165, y:  25, size: 10 },
  carrier:    { x:  55, y:  60, size:  9 },
  from:       { x:  55, y:  80, size:  9 },
  to:         { x: 280, y:  80, size:  9 },
  day:        { x: 440, y:  20, size:  9 },
};

const RENDER_SCALE = 3; // physical buffer multiplier for crispness

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

      // ── Scale factor: 1.0 for 513-wide original, ~2.0 for 1024-wide upscale
      const imgScale = img.naturalWidth / BASE_W;

      const s = (v: number) => v * imgScale;   // scale a coordinate
      const f = (px: number) => `${Math.round(px * imgScale)}px`; // scale a font size

      const dpr        = window.devicePixelRatio || 1;
      const totalScale = RENDER_SCALE * dpr;
      const logicalW   = img.naturalWidth;
      const logicalH   = img.naturalHeight;

      canvas.width  = logicalW * totalScale;
      canvas.height = logicalH * totalScale;
      canvas.style.width  = `${logicalW}px`;
      canvas.style.height = `${logicalH}px`;
      ctx.scale(totalScale, totalScale);

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      const GRID_LEFT    = s(BASE_GRID_LEFT);
      const HOUR_W       = s(BASE_HOUR_W);
      const LINE_H       = s(BASE_LINE_H);
      const CONNECTOR_W  = s(BASE_CONNECTOR_W);
      const TOTAL_X      = s(BASE_TOTAL_X);

      const ROW_Y = Object.fromEntries(
        Object.entries(BASE_ROW_Y).map(([k, v]) => [k, s(v)])
      ) as Record<LogSegment['status'], number>;

      const REMARKS_TICK_TOP = s(BASE_REMARKS_TICK_TOP);
      const REMARKS_TICK_BOT = s(BASE_REMARKS_TICK_BOT);
      const REMARKS_LABEL_Y  = s(BASE_REMARKS_LABEL_Y);

      // ── 1. Background ──────────────────────────────────────────────────────
      ctx.drawImage(img, 0, 0, logicalW, logicalH);

      // ── 2. Metadata text ───────────────────────────────────────────────────
      const mono = 'JetBrains Mono, monospace';
      ctx.fillStyle = '#111827';

      ctx.font = `${f(BASE_TEXT_FIELDS.date.size)} ${mono}`;
      ctx.fillText(formatDate(log.date), s(BASE_TEXT_FIELDS.date.x), s(BASE_TEXT_FIELDS.date.y));

      const driveMiles = totalDriveHours > 0
        ? Math.round((log.total_drive / totalDriveHours) * totalMiles)
        : 0;
      ctx.font = `${f(BASE_TEXT_FIELDS.totalMiles.size)} ${mono}`;
      ctx.fillText(`${driveMiles} mi`, s(BASE_TEXT_FIELDS.totalMiles.x), s(BASE_TEXT_FIELDS.totalMiles.y));

      ctx.fillStyle = '#374151';
      ctx.font = `${f(BASE_TEXT_FIELDS.carrier.size)} ${mono}`;
      ctx.fillText('ELD Trip Planner', s(BASE_TEXT_FIELDS.carrier.x), s(BASE_TEXT_FIELDS.carrier.y));

      ctx.font = `${f(BASE_TEXT_FIELDS.from.size)} ${mono}`;
      ctx.fillText(fromLocation, s(BASE_TEXT_FIELDS.from.x), s(BASE_TEXT_FIELDS.from.y));

      ctx.font = `${f(BASE_TEXT_FIELDS.to.size)} ${mono}`;
      ctx.fillText(toLocation, s(BASE_TEXT_FIELDS.to.x), s(BASE_TEXT_FIELDS.to.y));

      ctx.font = `bold ${f(BASE_TEXT_FIELDS.day.size)} ${mono}`;
      ctx.fillStyle = '#374151';
      ctx.fillText(`Day ${log.day}`, s(BASE_TEXT_FIELDS.day.x), s(BASE_TEXT_FIELDS.day.y));

      // ── 3. Duty-status bars ────────────────────────────────────────────────
      log.segments.forEach((seg) => {
        const rowY = ROW_Y[seg.status];
        if (rowY === undefined) return;

        const start = Math.max(0, Math.min(24, seg.start_hour));
        const end   = Math.max(0, Math.min(24, seg.end_hour));
        if (end <= start) return;

        const x = GRID_LEFT + start * HOUR_W;
        const w = (end - start) * HOUR_W;

        ctx.shadowColor = ELD_COLORS[seg.status];
        ctx.shadowBlur  = s(4);
        ctx.fillStyle   = ELD_COLORS[seg.status];
        ctx.fillRect(x, rowY - LINE_H / 2, w, LINE_H);
        ctx.shadowBlur  = 0;
      });

      // ── 4. Vertical connectors ─────────────────────────────────────────────
      for (let i = 0; i < log.segments.length - 1; i++) {
        const cur  = log.segments[i];
        const next = log.segments[i + 1];

        const yCur  = ROW_Y[cur.status];
        const yNext = ROW_Y[next.status];
        if (yCur === undefined || yNext === undefined || yCur === yNext) continue;

        const boundaryHour = Math.max(0, Math.min(24, cur.end_hour));
        const x = GRID_LEFT + boundaryHour * HOUR_W;

        const yTop = Math.min(yCur, yNext) + LINE_H / 2;
        const yBot = Math.max(yCur, yNext) - LINE_H / 2;
        if (yBot <= yTop) continue;

        ctx.fillStyle   = ELD_COLORS[next.status];
        ctx.shadowColor = ELD_COLORS[next.status];
        ctx.shadowBlur  = s(3);
        ctx.fillRect(x - CONNECTOR_W / 2, yTop, CONNECTOR_W, yBot - yTop);
        ctx.shadowBlur  = 0;
      }

      // ── 5. Total hours column ──────────────────────────────────────────────
      const totals: Record<LogSegment['status'], number> = {
        off_duty: 0, sleeper: 0, driving: 0, on_duty: 0,
      };
      log.segments.forEach((seg) => {
        totals[seg.status] = (totals[seg.status] || 0) + (seg.end_hour - seg.start_hour);
      });

      (Object.keys(BASE_ROW_Y) as Array<keyof typeof BASE_ROW_Y>).forEach((status) => {
        const y = ROW_Y[status];
        ctx.font      = `bold ${f(8)} ${mono}`;
        ctx.fillStyle = ELD_COLORS[status];
        ctx.fillText(totals[status].toFixed(1), TOTAL_X, y + s(3));
      });

      const total24 = Object.values(totals).reduce((a, b) => a + b, 0);
      ctx.font      = `${f(8)} ${mono}`;
      ctx.fillStyle = '#374151';
      ctx.fillText(`${total24.toFixed(1)}h`, TOTAL_X, s(260));

      // ── 6. Remarks — rotated location labels ───────────────────────────────
      const remarks = buildRemarksForShift(log, stops ?? []);
      remarks.forEach((r) => {
        const x = GRID_LEFT + Math.max(0, Math.min(24, r.hour)) * HOUR_W;

        ctx.fillStyle = r.color;
        ctx.fillRect(x - s(0.5), REMARKS_TICK_TOP, s(1), REMARKS_TICK_BOT - REMARKS_TICK_TOP);

        ctx.save();
        ctx.translate(x, REMARKS_LABEL_Y);
        ctx.rotate((60 * Math.PI) / 180);
        ctx.font      = `${f(7.5)} ${mono}`;
        ctx.fillStyle = '#1e293b';
        ctx.fillText(r.label, 0, 0);
        ctx.restore();
      });
    };

    img.onerror = () => {
      if (cancelled) return;
      canvas.width  = 513;
      canvas.height = 518;
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(0, 0, 513, 518);
      ctx.fillStyle = '#374151';
      ctx.font      = '14px JetBrains Mono, monospace';
      ctx.fillText('Place blank-paper-log.png in /public/', 20, 260);
    };

    return () => {
      cancelled    = true;
      img.onload   = null;
      img.onerror  = null;
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
        display: 'flex', flexWrap: 'wrap', gap: '0.75rem',
        marginTop: '0.75rem', padding: '0.75rem',
        background: 'var(--bg-raised)',
        border: '1px solid var(--border)', borderRadius: '8px',
      }}>
        {(Object.keys(BASE_ROW_Y) as Array<LogSegment['status']>).map((status) => {
          const dur = log.segments
            .filter(s => s.status === status)
            .reduce((acc, s) => acc + (s.end_hour - s.start_hour), 0);
          return (
            <div key={status} style={{
              display: 'flex', alignItems: 'center', gap: '0.4rem',
              fontFamily: 'var(--font-mono)', fontSize: '0.72rem',
            }}>
              <div style={{
                width: '28px', height: '6px',
                background: ELD_COLORS[status], borderRadius: '3px',
                boxShadow: `0 0 6px ${ELD_COLORS[status]}80`,
              }} />
              <span style={{ color: 'var(--text-secondary)' }}>{ELD_LABELS[status]}</span>
              <span style={{ color: ELD_COLORS[status], fontWeight: 600 }}>{dur.toFixed(1)}h</span>
            </div>
          );
        })}
      </div>

      {/* ── Segment table ── */}
      <div style={{
        marginTop: '0.75rem', background: 'var(--bg-raised)',
        border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden',
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.72rem', fontFamily: 'var(--font-mono)' }}>
          <thead>
            <tr style={{ background: 'var(--bg-hover)' }}>
              {['Status', 'From', 'To', 'Duration'].map(h => (
                <th key={h} style={{
                  padding: '0.5rem 0.75rem', textAlign: 'left',
                  color: 'var(--text-muted)', fontWeight: 600,
                  fontSize: '0.65rem', textTransform: 'uppercase',
                  letterSpacing: '0.08em', borderBottom: '1px solid var(--border)',
                }}>{h}</th>
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
                      <span style={{ color: 'var(--text-secondary)' }}>{ELD_LABELS[seg.status]}</span>
                    </div>
                  </td>
                  <td style={{ padding: '0.4rem 0.75rem', color: 'var(--text-primary)' }}>{formatHour(seg.start_hour)}</td>
                  <td style={{ padding: '0.4rem 0.75rem', color: 'var(--text-primary)' }}>{formatHour(seg.end_hour)}</td>
                  <td style={{ padding: '0.4rem 0.75rem', color: ELD_COLORS[seg.status], fontWeight: 600 }}>{dur.toFixed(2)}h</td>
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
  const hh     = Math.floor(h) % 24;
  const mm     = Math.round((h % 1) * 60);
  const period = hh < 12 ? 'AM' : 'PM';
  const displayH = hh === 0 ? 12 : hh > 12 ? hh - 12 : hh;
  return `${displayH}:${mm.toString().padStart(2, '0')} ${period}`;
}

function buildRemarksForShift(log: DailyLog, stops: Stop[]): RemarkLabel[] {
  if (!stops || stops.length === 0) return [];

  const shiftStart      = log.start_time ? new Date(log.start_time) : null;
  const shiftStartValid = shiftStart && !isNaN(shiftStart.getTime());
  const shiftSpan       = log.segments.reduce((max, s) => Math.max(max, s.end_hour), 0);
  const TOL             = 0.02;

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
        pickup: '#16a34a', dropoff: '#dc2626', rest: '#ea580c',
        fuel: '#2563eb', restart: '#7c3aed',
      };
      const TYPE_PREFIX: Record<Stop['type'], string> = {
        pickup: 'PU', dropoff: 'DO', rest: 'Rest', fuel: 'Fuel', restart: '34hr',
      };

      const loc = stop.location.length > 28
        ? stop.location.slice(0, 27) + '…'
        : stop.location;

      return { hour, label: `${TYPE_PREFIX[stop.type]} — ${loc}`, color: TYPE_COLORS[stop.type] };
    })
    .filter((r): r is RemarkLabel => r !== null);
}