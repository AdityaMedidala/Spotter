'use client';

import type { TripResult } from './types';
import { STOP_LABELS, STOP_COLORS } from './types';

interface Props {
  result: TripResult;
  cycleUsedHours: number;
}

const Stat = ({
  label, value, unit, color = 'var(--amber)'
}: { label: string; value: string | number; unit: string; color?: string }) => (
  <div style={{
    background: 'var(--bg-raised)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    padding: '1rem 1.25rem',
    position: 'relative',
    overflow: 'hidden',
  }}>
    {/* Accent bar */}
    <div style={{
      position: 'absolute',
      top: 0, left: 0,
      width: '3px', height: '100%',
      background: color,
      borderRadius: '8px 0 0 8px',
    }} />
    <div className="section-label" style={{ color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
      {label}
    </div>
    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem' }}>
      <span className="stat-value" style={{ color }}>{value}</span>
      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
        {unit}
      </span>
    </div>
  </div>
);

export default function TripSummary({ result, cycleUsedHours }: Props) {
  const { stops, total_miles, total_days, total_drive_hours } = result;

  const stopCounts = stops.reduce<Record<string, number>>((acc, s) => {
    acc[s.type] = (acc[s.type] || 0) + 1;
    return acc;
  }, {});

  const avgSpeed = total_drive_hours > 0
    ? (total_miles / total_drive_hours).toFixed(0)
    : '—';

  const totalOnDuty = result.daily_logs.reduce((acc, d) => acc + d.total_on_duty, 0);
  const remainingCycle = Math.max(0, 70 - cycleUsedHours - totalOnDuty).toFixed(1);

  return (
    <div className="fade-up">
      <p className="section-label" style={{ marginBottom: '1rem' }}>── Trip Summary</p>

      {/* ── Primary stats grid ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '0.75rem',
        marginBottom: '1rem',
      }}>
        <Stat
          label="Total Distance"
          value={total_miles.toLocaleString()}
          unit="mi"
          color="var(--amber)"
        />
        <Stat
          label="Calendar Days"
          value={total_days}
          unit={total_days === 1 ? 'day' : 'days'}
          color="var(--blue)"
        />
        <Stat
          label="Drive Hours"
          value={total_drive_hours.toFixed(1)}
          unit="hrs"
          color="var(--green)"
        />
      </div>

      {/* ── Secondary stats ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '0.75rem',
        marginBottom: '1rem',
      }}>
        <div style={{
          background: 'var(--bg-raised)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          padding: '0.875rem 1rem',
          fontFamily: 'var(--font-mono)',
        }}>
          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.3rem' }}>
            Avg Speed
          </div>
          <span style={{ fontSize: '1.4rem', fontFamily: 'var(--font-display)', fontWeight: 800, color: 'var(--text-primary)' }}>
            {avgSpeed}
          </span>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginLeft: '0.25rem' }}>mph</span>
        </div>

        <div style={{
          background: 'var(--bg-raised)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          padding: '0.875rem 1rem',
          fontFamily: 'var(--font-mono)',
        }}>
          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.3rem' }}>
            Cycle Remaining
          </div>
          <span style={{
            fontSize: '1.4rem',
            fontFamily: 'var(--font-display)',
            fontWeight: 800,
            color: parseFloat(remainingCycle) < 10 ? 'var(--red)' : 'var(--text-primary)',
          }}>
            {remainingCycle}
          </span>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginLeft: '0.25rem' }}>hrs left</span>
        </div>
      </div>

      {/* ── Stop breakdown ── */}
      <div style={{
        background: 'var(--bg-raised)',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        padding: '1rem',
      }}>
        <p className="section-label" style={{ color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
          Stop Breakdown
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          {Object.entries(stopCounts).map(([type, count]) => (
            <div key={type} style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              background: 'var(--bg-base)',
              border: `1px solid ${STOP_COLORS[type as keyof typeof STOP_COLORS]}40`,
              borderRadius: '4px',
              padding: '0.3rem 0.6rem',
              fontSize: '0.72rem',
              fontFamily: 'var(--font-mono)',
            }}>
              <span style={{
                width: '8px', height: '8px',
                borderRadius: '50%',
                background: STOP_COLORS[type as keyof typeof STOP_COLORS],
                flexShrink: 0,
              }} />
              <span style={{ color: 'var(--text-secondary)' }}>
                {STOP_LABELS[type as keyof typeof STOP_LABELS]}
              </span>
              <span style={{
                color: STOP_COLORS[type as keyof typeof STOP_COLORS],
                fontWeight: 600,
              }}>
                ×{count}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}