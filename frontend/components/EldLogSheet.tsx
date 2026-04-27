'use client';

import { useRef, useEffect } from 'react';
import type { DailyLog, LogSegment } from './types';
import { ELD_COLORS, ELD_LABELS } from './types';

// ── EXACT PIXEL COORDINATES ──────────────────────────────────────────────────
// Measured directly from blank-paper-log.png (513×518px)
// by scanning pixel darkness/lightness values programmatically.
//
// Grid horizontal:
//   GRID_LEFT  = 64    (first hour tick — midnight)
//   GRID_RIGHT = 454   (last hour tick — midnight end)
//   GRID_WIDTH = 390px for 24 hours → 16.25px per hour
//
// Row Y centres (midpoint of each duty-status band):
//   Off Duty          y = 192
//   Sleeper Berth     y = 209
//   Driving           y = 226
//   On Duty (ND)      y = 244
// ────────────────────────────────────────────────────────────────────────────
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

const LINE_H = 8;   // thickness of the duty-status bar

// ── Text field positions (approx, visually tuned) ────────────────────────────
const TEXT_FIELDS = {
  date:        { x: 55,  y: 25,  font: '10px JetBrains Mono, monospace' },
  totalMiles:  { x: 165, y: 25,  font: '10px JetBrains Mono, monospace' },
  totalMilesLabel: { x: 155, y: 36, font: '7px JetBrains Mono, monospace' },
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
}

export default function EldLogSheet({ log, totalMiles, totalDriveHours, fromLocation, toLocation }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // FIX: Cleanup guard — prevents stale draws when the effect re-runs
    // (React 18 strict mode runs effects twice; img.onload from the first
    // run could otherwise fire after a second run has already started).
    let cancelled = false;

    const img = new Image();
    img.src = '/blank-paper-log.png';

    img.onload = () => {
      if (cancelled) return;

      // FIX: Retina-aware sizing. Internal pixel buffer scales with DPR so
      // the canvas stays sharp on 2x+ displays; CSS size stays at the
      // image's natural dimensions.
      const dpr = window.devicePixelRatio || 1;
      canvas.width  = img.naturalWidth  * dpr;
      canvas.height = img.naturalHeight * dpr;
      canvas.style.width  = `${img.naturalWidth}px`;
      canvas.style.height = `${img.naturalHeight}px`;
      ctx.scale(dpr, dpr);

      // ── 1. Draw background image ──────────────────────────────────────────
      ctx.drawImage(img, 0, 0);

      // ── 2. Fill metadata text ─────────────────────────────────────────────
      ctx.fillStyle = '#111827';

      // Date
      ctx.font = TEXT_FIELDS.date.font;
      ctx.fillText(formatDate(log.date), TEXT_FIELDS.date.x, TEXT_FIELDS.date.y);

      // Miles driven today (driving segments total)
      const driveMiles = totalDriveHours > 0
        ? Math.round((log.total_drive / totalDriveHours) * totalMiles)
        : 0;
      ctx.font = TEXT_FIELDS.totalMiles.font;
      ctx.fillText(`${driveMiles} mi`, TEXT_FIELDS.totalMiles.x, TEXT_FIELDS.totalMiles.y);

      // Carrier placeholder
      ctx.font = TEXT_FIELDS.carrier.font;
      ctx.fillStyle = '#374151';
      ctx.fillText('ELD Trip Planner', TEXT_FIELDS.carrier.x, TEXT_FIELDS.carrier.y);

      // From / To
      ctx.font = TEXT_FIELDS.from.font;
      ctx.fillText(fromLocation, TEXT_FIELDS.from.x, TEXT_FIELDS.from.y);
      ctx.font = TEXT_FIELDS.to.font;
      ctx.fillText(toLocation, TEXT_FIELDS.to.x, TEXT_FIELDS.to.y);

      // Day label (top right area)
      ctx.font = 'bold 9px JetBrains Mono, monospace';
      ctx.fillStyle = '#374151';
      ctx.fillText(`Day ${log.day}`, 440, 20);

      // ── 3. Draw duty-status bars ──────────────────────────────────────────
      log.segments.forEach((seg) => {
        const rowY = ROW_Y[seg.status];
        if (rowY === undefined) return;

        // Clamp hours to [0, 24]
        const start = Math.max(0, Math.min(24, seg.start_hour));
        const end   = Math.max(0, Math.min(24, seg.end_hour));
        if (end <= start) return;

        const x = GRID_LEFT + start * HOUR_W;
        const w = (end - start) * HOUR_W;

        // Shadow / glow
        ctx.shadowColor = ELD_COLORS[seg.status];
        ctx.shadowBlur  = 4;

        // Bar
        ctx.fillStyle = ELD_COLORS[seg.status];
        ctx.fillRect(x, rowY - LINE_H / 2, w, LINE_H);

        // Reset shadow
        ctx.shadowBlur = 0;
      });

      // ── 4. Total hours column (right side) ───────────────────────────────
      const TOTAL_X = 462;

      const totals: Record<LogSegment['status'], number> = { off_duty: 0, sleeper: 0, driving: 0, on_duty: 0 };
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

      // Running total should equal 24
      const total24 = Object.values(totals).reduce((a, b) => a + b, 0);
      ctx.font = '8px JetBrains Mono, monospace';
      ctx.fillStyle = '#374151';
      ctx.fillText(`${total24.toFixed(1)}h`, TOTAL_X, 260);
    };

    img.onerror = () => {
      if (cancelled) return;
      // Fallback: draw a placeholder grid if image fails to load
      canvas.width  = 513;
      canvas.height = 518;
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(0, 0, 513, 518);
      ctx.fillStyle = '#374151';
      ctx.font = '14px JetBrains Mono, monospace';
      ctx.fillText('Place blank-paper-log.png in /public/', 20, 260);
    };

    return () => {
      cancelled = true;
      img.onload = null;
      img.onerror = null;
    };
  }, [log, totalMiles, totalDriveHours, fromLocation, toLocation]);

  const totalSegmentHours = log.segments.reduce((acc, seg) => acc + (seg.end_hour - seg.start_hour), 0);

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

// ── Helpers ──────────────────────────────────────────────────────────────────
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