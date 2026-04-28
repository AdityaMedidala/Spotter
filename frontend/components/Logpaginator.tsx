'use client';

import { useState } from 'react';
import type { TripResult, Stop } from './types';
import EldLogSheet from './EldLogSheet';

interface Props {
  result: TripResult;
  fromLocation: string;
  toLocation: string;
  displayStops?: Stop[];
}

export default function LogPaginator({ result, fromLocation, toLocation, displayStops }: Props) {
  const [currentDay, setCurrentDay] = useState(0);
  const { daily_logs, total_miles } = result;
  const totalDays = daily_logs.length;
  const log = daily_logs[currentDay];

  if (!log) return null;

  return (
    <div>
      <p className="section-label" style={{ marginBottom: '1rem' }}>── Daily ELD Logs</p>

      {/* ── Day navigator header ── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '1rem',
        background: 'var(--bg-raised)',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        padding: '0.75rem 1rem',
      }}>
        {/* Prev */}
        <button
          onClick={() => setCurrentDay(d => Math.max(0, d - 1))}
          disabled={currentDay === 0}
          style={{
            background: currentDay === 0 ? 'var(--bg-hover)' : 'var(--amber)',
            color: currentDay === 0 ? 'var(--text-muted)' : '#000',
            border: 'none',
            borderRadius: '6px',
            padding: '0.4rem 0.85rem',
            fontFamily: 'var(--font-display)',
            fontWeight: 700,
            fontSize: '0.9rem',
            cursor: currentDay === 0 ? 'not-allowed' : 'pointer',
            transition: 'background 0.15s',
            letterSpacing: '0.04em',
          }}
        >
          ◀ PREV
        </button>

        {/* Centre info */}
        <div style={{ textAlign: 'center', fontFamily: 'var(--font-mono)' }}>
          <div style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 800,
            fontSize: '1.3rem',
            color: 'var(--amber)',
            lineHeight: 1,
          }}>
            DAY {log.day} / {totalDays}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
            {log.date} · Drive {log.total_drive.toFixed(1)}h · On-duty {log.total_on_duty.toFixed(1)}h
          </div>

          {/* Day dots */}
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            gap: '5px',
            marginTop: '0.5rem',
          }}>
            {daily_logs.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrentDay(i)}
                title={`Day ${i + 1}`}
                style={{
                  width: i === currentDay ? '20px' : '8px',
                  height: '8px',
                  borderRadius: '4px',
                  background: i === currentDay ? 'var(--amber)' : 'var(--border-light)',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                  transition: 'width 0.2s, background 0.2s',
                }}
              />
            ))}
          </div>
        </div>

        {/* Next */}
        <button
          onClick={() => setCurrentDay(d => Math.min(totalDays - 1, d + 1))}
          disabled={currentDay === totalDays - 1}
          style={{
            background: currentDay === totalDays - 1 ? 'var(--bg-hover)' : 'var(--amber)',
            color: currentDay === totalDays - 1 ? 'var(--text-muted)' : '#000',
            border: 'none',
            borderRadius: '6px',
            padding: '0.4rem 0.85rem',
            fontFamily: 'var(--font-display)',
            fontWeight: 700,
            fontSize: '0.9rem',
            cursor: currentDay === totalDays - 1 ? 'not-allowed' : 'pointer',
            transition: 'background 0.15s',
            letterSpacing: '0.04em',
          }}
        >
          NEXT ▶
        </button>
      </div>

      {/* ── Drive progress bar for this day ── */}
      <div style={{ marginBottom: '1rem' }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: '0.65rem',
          color: 'var(--text-muted)',
          fontFamily: 'var(--font-mono)',
          marginBottom: '0.3rem',
        }}>
          <span>Driving hours</span>
          <span style={{ color: 'var(--green)' }}>
            {log.total_drive.toFixed(1)} / 11 hrs max
          </span>
        </div>
        <div style={{ height: '4px', background: 'var(--border)', borderRadius: '2px', overflow: 'hidden' }}>
          <div style={{
            height: '100%',
            width: `${Math.min((log.total_drive / 11) * 100, 100)}%`,
            background: log.total_drive >= 11
              ? 'var(--red)'
              : log.total_drive >= 8
                ? 'var(--amber)'
                : 'var(--green)',
            borderRadius: '2px',
            transition: 'width 0.3s',
          }} />
        </div>
      </div>

      {/* ── ELD log sheet ── */}
      <EldLogSheet
        key={`log-${currentDay}`}
        log={log}
        totalMiles={total_miles}
        totalDriveHours={result.total_drive_hours}
        fromLocation={fromLocation}
        toLocation={toLocation}
        stops={displayStops ?? result.stops}
      />
    </div>
  );
}