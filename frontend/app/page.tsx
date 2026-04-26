'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import TripForm from '@/components/TripForm';
import TripSummary from '@/components/TripSummary';
import LogPaginator from '@/components/Logpaginator';
import type { TripRequest, TripResult } from '@/components/types';

function formatArrival(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true
    });
  } catch { return iso; }
}

// Leaflet is SSR-incompatible — dynamic import with ssr:false is required
const RouteMap = dynamic(() => import('@/components/RouteMap'), {
  ssr: false,
  loading: () => (
    <div style={{
      height: '420px',
      background: 'var(--bg-raised)',
      border: '1px solid var(--border)',
      borderRadius: '8px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'var(--font-mono)',
      fontSize: '0.8rem',
      color: 'var(--text-muted)',
    }}>
      <span className="pulse">Loading map…</span>
    </div>
  ),
});

// ── API call ─────────────────────────────────────────────────────────────────
async function planTrip(payload: TripRequest): Promise<TripResult> {
  const res = await fetch('/api/plan-trip', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.detail ?? `API error ${res.status}`);
  }
  return res.json();
}

// ════════════════════════════════════════════════════════════════════════════
export default function Home() {
  const [result, setResult]     = useState<TripResult | null>(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [formVals, setFormVals] = useState<TripRequest | null>(null);

  const handleSubmit = async (values: TripRequest) => {
    setLoading(true);
    setError(null);
    setResult(null);
    setFormVals(values);
    try {
      const data = await planTrip(values);
      setResult(data);
      // Scroll results into view on mobile
      setTimeout(() => {
        document.getElementById('results')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)' }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header style={{
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-surface)',
        padding: '0 1.5rem',
        position: 'sticky',
        top: 0,
        zIndex: 50,
      }}>
        <div className="container" style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: '56px',
        }}>
          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{
              width: '32px', height: '32px',
              background: 'var(--amber)',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1rem',
            }}>
              🚛
            </div>
            <div>
              <div style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 800,
                fontSize: '1.1rem',
                letterSpacing: '0.05em',
                color: 'var(--text-primary)',
                lineHeight: 1,
              }}>
                ELD TRIP PLANNER
              </div>
              <div style={{
                fontSize: '0.6rem',
                color: 'var(--text-muted)',
                fontFamily: 'var(--font-mono)',
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
              }}>
                FMCSA · 70hr/8day · Property Carrier
              </div>
            </div>
          </div>

          {/* Status badge */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            fontSize: '0.65rem',
            fontFamily: 'var(--font-mono)',
            color: 'var(--text-muted)',
            background: 'var(--bg-raised)',
            border: '1px solid var(--border)',
            borderRadius: '20px',
            padding: '0.3rem 0.75rem',
          }}>
            <span style={{
              width: '6px', height: '6px',
              borderRadius: '50%',
              background: loading ? 'var(--amber)' : result ? 'var(--green)' : 'var(--text-muted)',
              boxShadow: loading ? '0 0 8px var(--amber)' : result ? '0 0 8px var(--green)' : 'none',
            }} />
            {loading ? 'COMPUTING' : result ? 'ROUTE READY' : 'STANDBY'}
          </div>
        </div>
      </header>

      {/* ── Main layout ────────────────────────────────────────────────────── */}
      <main className="container" style={{
        paddingTop: '2rem',
        paddingBottom: '4rem',
        display: 'grid',
        gridTemplateColumns: result ? '360px 1fr' : '1fr',
        gap: '2rem',
        alignItems: 'start',
        transition: 'grid-template-columns 0.3s',
        maxWidth: result ? '1280px' : '480px',
        margin: '0 auto',
      }}>

        {/* ── LEFT: Form ─────────────────────────────────────────────────── */}
        <aside style={{ position: 'sticky', top: '72px' }}>
          <div className="card fade-up">
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem',
              marginBottom: '1.25rem',
              paddingBottom: '1rem',
              borderBottom: '1px solid var(--border)',
            }}>
              <span style={{ fontSize: '1.1rem' }}>🗺️</span>
              <div>
                <div style={{
                  fontFamily: 'var(--font-display)',
                  fontWeight: 700,
                  fontSize: '1rem',
                  color: 'var(--text-primary)',
                  lineHeight: 1.2,
                }}>
                  Plan Your Trip
                </div>
                <div style={{
                  fontSize: '0.65rem',
                  color: 'var(--text-muted)',
                  fontFamily: 'var(--font-mono)',
                  marginTop: '0.1rem',
                }}>
                  Enter 3 locations + cycle hours
                </div>
              </div>
            </div>

            <TripForm onSubmit={handleSubmit} loading={loading} />

            {/* Error */}
            {error && (
              <div style={{
                marginTop: '1rem',
                padding: '0.75rem 1rem',
                background: 'rgba(239,68,68,0.1)',
                border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: '6px',
                color: '#fca5a5',
                fontSize: '0.8rem',
                fontFamily: 'var(--font-mono)',
              }}>
                ⚠ {error}
              </div>
            )}
          </div>

          {/* FMCSA rules reference card */}
          {!result && (
            <div className="card fade-up fade-up-2" style={{ marginTop: '1rem' }}>
              <p className="section-label" style={{ marginBottom: '0.75rem' }}>── HOS Rules Applied</p>
              {[
                ['11 hr', 'Max driving per shift'],
                ['14 hr', 'Consecutive duty window'],
                ['10 hr', 'Required rest between shifts'],
                ['30 min', 'Break after 8 cumulative drive hrs'],
                ['70 hr', '8-day cycle limit'],
                ['34 hr', 'Restart resets cycle'],
                ['1,000 mi', 'Fuel stop interval'],
                ['1 hr', 'Pickup + dropoff each'],
              ].map(([val, desc]) => (
                <div key={val} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0.35rem 0',
                  borderBottom: '1px solid var(--border)',
                  fontSize: '0.72rem',
                  fontFamily: 'var(--font-mono)',
                }}>
                  <span style={{ color: 'var(--amber)', fontWeight: 600 }}>{val}</span>
                  <span style={{ color: 'var(--text-secondary)' }}>{desc}</span>
                </div>
              ))}
            </div>
          )}
        </aside>

        {/* ── RIGHT: Results ─────────────────────────────────────────────── */}
        {result && (
          <div id="results" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

            {/* Summary */}
            <div className="card fade-up">
              <TripSummary result={result} cycleUsedHours={formVals?.cycle_used_hours ?? 0} />
            </div>

            {/* Map */}
            <div className="card fade-up fade-up-1">
              <p className="section-label" style={{ marginBottom: '1rem' }}>── Route Map</p>

              {/* Stop legend row */}
              <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '0.5rem',
                marginBottom: '0.75rem',
                fontSize: '0.65rem',
                fontFamily: 'var(--font-mono)',
              }}>
                {[
                  ['#22c55e', 'Pickup'],
                  ['#ef4444', 'Dropoff'],
                  ['#f97316', 'Rest'],
                  ['#3b82f6', 'Fuel'],
                  ['#a855f7', '34-hr Restart'],
                ].map(([color, label]) => (
                  <div key={label} style={{
                    display: 'flex', alignItems: 'center', gap: '0.3rem',
                  }}>
                    <span style={{
                      width: '8px', height: '8px', borderRadius: '50%',
                      background: color, display: 'inline-block',
                    }} />
                    <span style={{ color: 'var(--text-muted)' }}>{label}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <span style={{
                    width: '20px', height: '3px',
                    background: '#3b82f6', display: 'inline-block', borderRadius: '2px',
                  }} />
                  <span style={{ color: 'var(--text-muted)' }}>Route</span>
                </div>
              </div>

              <RouteMap result={result} />
            </div>

            {/* Stops timeline */}
            <div className="card fade-up fade-up-2">
              <p className="section-label" style={{ marginBottom: '1rem' }}>── Stop Timeline</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {result.stops.map((stop, i) => {
                  const colors: Record<string, string> = {
                    pickup: 'var(--stop-pickup)', dropoff: 'var(--stop-dropoff)',
                    rest: 'var(--stop-rest)', fuel: 'var(--stop-fuel)', restart: 'var(--stop-restart)',
                  };
                  const icons: Record<string, string> = {
                    pickup: '📦', dropoff: '🏁', rest: '💤', fuel: '⛽', restart: '🔄',
                  };
                  const color = colors[stop.type] ?? 'var(--text-muted)';
                  return (
                    <div key={i} style={{
                      display: 'flex',
                      gap: '0.75rem',
                      padding: '0.6rem 0',
                      borderBottom: i < result.stops.length - 1 ? '1px solid var(--border)' : 'none',
                    }}>
                      {/* Timeline dot + line */}
                      <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        flexShrink: 0,
                        width: '18px',
                      }}>
                        <div style={{
                          width: '18px', height: '18px',
                          borderRadius: '50%',
                          background: color,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '0.6rem',
                          flexShrink: 0,
                        }}>
                          {icons[stop.type]}
                        </div>
                        {i < result.stops.length - 1 && (
                          <div style={{
                            width: '1px',
                            flex: 1,
                            minHeight: '16px',
                            background: 'var(--border-light)',
                            marginTop: '2px',
                          }} />
                        )}
                      </div>

                      {/* Stop info */}
                      <div style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
                        <div style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'baseline',
                        }}>
                          <span style={{ color, fontWeight: 600, textTransform: 'uppercase', fontSize: '0.7rem' }}>
                            {stop.type.replace('_', ' ')}
                          </span>
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.65rem' }}>
                            {formatArrival(stop.arrival_time)}
                          </span>
                        </div>
                        <div style={{ color: 'var(--text-secondary)', marginTop: '0.1rem' }}>
                          {stop.location}
                        </div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.65rem' }}>
                          {stop.duration_hours.toFixed(1)} hr stop
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ELD Logs */}
            <div className="card fade-up fade-up-3">
              <LogPaginator
                result={result}
                fromLocation={formVals?.current_location ?? ''}
                toLocation={formVals?.dropoff_location ?? ''}
              />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
