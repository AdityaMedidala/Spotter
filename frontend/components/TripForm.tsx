'use client';
import { useCallback } from 'react';
import { useForm } from '@mantine/form';
import { NumberInput, Stack } from '@mantine/core';
import type { TripRequest } from './types';
import Locationautocomplete from './Locationautocomplete';

interface Props {
  onSubmit: (values: TripRequest) => void;
  loading: boolean;
}

export default function TripForm({ onSubmit, loading }: Props) {
  const form = useForm<TripRequest>({
    initialValues: {
      current_location: '',
      pickup_location: '',
      dropoff_location: '',
      cycle_used_hours: 0,
    },
    validate: {
      current_location: (v) => v.trim().length < 2 ? 'Enter a valid location' : null,
      pickup_location:  (v) => v.trim().length < 2 ? 'Enter a valid location' : null,
      dropoff_location: (v) => v.trim().length < 2 ? 'Enter a valid location' : null,
      cycle_used_hours: (v) =>
        v < 0 ? 'Cannot be negative' :
        v > 70 ? 'Cannot exceed 70 hrs (cycle limit)' :
        null,
    },
  });

  // FIX: Stabilize callbacks so Locationautocomplete's effect doesn't refire
  // on every parent render (which triggers duplicate ORS autocomplete calls).
  const handleCurrentChange = useCallback(
    (v: string) => form.setFieldValue('current_location', v),
    [form],
  );
  const handlePickupChange = useCallback(
    (v: string) => form.setFieldValue('pickup_location', v),
    [form],
  );
  const handleDropoffChange = useCallback(
    (v: string) => form.setFieldValue('dropoff_location', v),
    [form],
  );

  const handleCurrentError = useCallback((msg: string | null) => {
    if (msg) form.setFieldError('current_location', msg);
    else form.clearFieldError('current_location');
  }, [form]);

  const handlePickupError = useCallback((msg: string | null) => {
    if (msg) form.setFieldError('pickup_location', msg);
    else form.clearFieldError('pickup_location');
  }, [form]);

  const handleDropoffError = useCallback((msg: string | null) => {
    if (msg) form.setFieldError('dropoff_location', msg);
    else form.clearFieldError('dropoff_location');
  }, [form]);

  return (
    <form onSubmit={form.onSubmit(onSubmit)}>
      <Stack gap="md">
        {/* ── Current Location ── */}
        <div>
          <p className="section-label" style={{ marginBottom: '0.75rem' }}>
            ── Trip Details
          </p>
          <Stack gap="sm">
            <Locationautocomplete
              label="Current Location"
              placeholder="e.g. Chicago, IL"
              value={form.values.current_location}
              onChange={handleCurrentChange}
              onError={handleCurrentError}
              error={form.errors.current_location as string}
              icon={<span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>📍</span>}
            />

            <Locationautocomplete
              label="Pickup Location"
              placeholder="e.g. St. Louis, MO"
              value={form.values.pickup_location}
              onChange={handlePickupChange}
              onError={handlePickupError}
              error={form.errors.pickup_location as string}
              icon={<span style={{ color: 'var(--stop-pickup)', fontSize: '0.8rem' }}>▲</span>}
            />

            <Locationautocomplete
              label="Dropoff Location"
              placeholder="e.g. Dallas, TX"
              value={form.values.dropoff_location}
              onChange={handleDropoffChange}
              onError={handleDropoffError}
              error={form.errors.dropoff_location as string}
              icon={<span style={{ color: 'var(--stop-dropoff)', fontSize: '0.8rem' }}>■</span>}
            />
          </Stack>
        </div>

        {/* ── Cycle Hours ── */}
        <div>
          <p className="section-label" style={{ marginBottom: '0.75rem' }}>
            ── 70-hr / 8-day Cycle
          </p>
          <NumberInput
            label="Current Cycle Used (hrs)"
            placeholder="0"
            min={0}
            max={70}
            step={0.5}
            decimalScale={1}
            leftSection={
              <span style={{ color: 'var(--amber)', fontSize: '0.8rem' }}>⏱</span>
            }
            description={
              <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.7rem' }}>
                Hours logged in the last 8 days (0–70)
              </span>
            }
            {...form.getInputProps('cycle_used_hours')}
            styles={{
              input: { background: 'var(--bg-raised)', borderColor: 'var(--border)', color: 'var(--text-primary)' },
              label: { color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em' },
            }}
          />

          {/* Visual cycle meter */}
          <div style={{ marginTop: '0.75rem' }}>
            <div style={{
              height: '4px',
              background: 'var(--border)',
              borderRadius: '2px',
              overflow: 'hidden',
            }}>
              <div style={{
                height: '100%',
                width: `${Math.min((Number(form.values.cycle_used_hours || 0) / 70) * 100, 100)}%`,
                background: Number(form.values.cycle_used_hours || 0) >= 60
                  ? 'var(--red)'
                  : Number(form.values.cycle_used_hours || 0) >= 40
                    ? 'var(--amber)'
                    : 'var(--green)',
                borderRadius: '2px',
                transition: 'width 0.2s, background 0.2s',
              }} />
            </div>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginTop: '0.25rem',
              fontSize: '0.65rem',
              color: 'var(--text-muted)',
              fontFamily: 'var(--font-mono)',
            }}>
              <span>0 hr</span>
              <span style={{ color: 'var(--amber)' }}>
                {Number(form.values.cycle_used_hours || 0).toFixed(1)} / 70 hrs used
              </span>
              <span>70 hr</span>
            </div>
          </div>
        </div>

        {/* ── Submit ── */}
        <button
          type="submit"
          className="btn-primary"
          disabled={loading}
          style={{ marginTop: '0.5rem' }}
        >
          {loading ? (
            <>
              <span className="pulse">●</span>
              <span className="pulse" style={{ animationDelay: '0.2s' }}>●</span>
              <span className="pulse" style={{ animationDelay: '0.4s' }}>●</span>
              &nbsp; COMPUTING ROUTE
            </>
          ) : (
            '▶ PLAN TRIP'
          )}
        </button>

        {/* FMCSA rules footnote */}
        <div style={{
          borderTop: '1px solid var(--border)',
          paddingTop: '0.75rem',
          fontSize: '0.65rem',
          color: 'var(--text-muted)',
          fontFamily: 'var(--font-mono)',
          lineHeight: 1.6,
        }}>
          <span style={{ color: 'var(--amber)' }}>§</span> Property carrier · 70hr/8day ·
          11hr drive limit · 14hr window · 30-min break @8hr ·
          Fuel every 1,000mi · Pickup &amp; dropoff = 1hr each
        </div>
      </Stack>
    </form>
  );
}