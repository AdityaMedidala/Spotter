'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

interface Suggestion {
  label: string;
  lat: number;
  lng: number;
}

interface Props {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  onError?: (msg: string | null) => void;
  icon?: React.ReactNode;
  error?: string | null;
}

const AUTOCOMPLETE_URL = '/api/autocomplete';

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default function Locationautocomplete({
  label, placeholder, value, onChange, onError, icon, error
}: Props) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const debouncedValue = useDebounce(value, 280);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!debouncedValue || debouncedValue.length < 2) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    void fetch(`${AUTOCOMPLETE_URL}?q=${encodeURIComponent(debouncedValue)}`)
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) {
          throw new Error(
            typeof data?.detail === 'string'
              ? data.detail
              : `Autocomplete failed (${r.status})`,
          );
        }
        return data;
      })
      .then(data => {
        if (cancelled) return;
        setSuggestions(data.suggestions ?? []);
        setOpen((data.suggestions ?? []).length > 0);
        setHighlighted(-1);
        onError?.(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setSuggestions([]);
          setOpen(false);
          onError?.(
            err instanceof Error ? err.message : 'Autocomplete failed',
          );
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [debouncedValue, onError]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const select = useCallback((s: Suggestion) => {
    onChange(s.label);
    setSuggestions([]);
    setOpen(false);
    setHighlighted(-1);
    inputRef.current?.blur();
  }, [onChange]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlighted(h => Math.min(h + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlighted(h => Math.max(h - 1, 0));
    } else if (e.key === 'Enter' && highlighted >= 0) {
      e.preventDefault();
      select(suggestions[highlighted]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      <div style={{
        fontFamily: 'var(--font-mono)',
        fontSize: '0.72rem',
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        color: 'var(--text-secondary)',
        marginBottom: '6px',
        fontWeight: 600,
      }}>
        {label}
      </div>

      <div style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        background: 'var(--bg-raised)',
        border: `1px solid ${error ? 'rgba(239,68,68,0.6)' : open ? 'var(--amber)' : 'var(--border)'}`,
        borderRadius: '6px',
        transition: 'border-color 0.15s',
      }}>
        {icon && (
          <div style={{
            paddingLeft: '10px',
            display: 'flex',
            alignItems: 'center',
            color: 'var(--text-muted)',
            fontSize: '0.8rem',
            flexShrink: 0,
          }}>
            {icon}
          </div>
        )}

        <input
          ref={inputRef}
          type="text"
          value={value}
          placeholder={placeholder}
          onChange={e => {
            onChange(e.target.value);
            if (e.target.value.length < 2) {
              setSuggestions([]);
              setOpen(false);
              onError?.(null);
            }
          }}
          onKeyDown={handleKeyDown}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          autoComplete="off"
          spellCheck={false}
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.85rem',
            padding: icon ? '9px 10px 9px 8px' : '9px 10px',
            width: '100%',
          }}
        />

        {loading && (
          <div style={{
            paddingRight: '10px',
            display: 'flex',
            alignItems: 'center',
          }}>
            <div style={{
              width: '12px', height: '12px',
              border: '1.5px solid var(--border)',
              borderTopColor: 'var(--amber)',
              borderRadius: '50%',
              animation: 'loc-spin 0.6s linear infinite',
            }} />
          </div>
        )}
      </div>

      {error && (
        <div style={{
          fontSize: '0.68rem',
          color: '#fca5a5',
          fontFamily: 'var(--font-mono)',
          marginTop: '4px',
        }}>
          {error}
        </div>
      )}

      {open && suggestions.length > 0 && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 4px)',
          left: 0,
          right: 0,
          zIndex: 999,
          background: 'var(--bg-raised)',
          border: '1px solid var(--border-light)',
          borderRadius: '8px',
          overflow: 'hidden',
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        }}>
          {suggestions.map((s, i) => (
            <div
              key={s.label + i}
              onMouseDown={() => select(s)}
              onMouseEnter={() => setHighlighted(i)}
              style={{
                padding: '9px 12px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                cursor: 'pointer',
                background: i === highlighted ? 'var(--bg-hover)' : 'transparent',
                borderBottom: i < suggestions.length - 1 ? '1px solid var(--border)' : 'none',
                transition: 'background 0.1s',
              }}
            >
              <svg width="10" height="13" viewBox="0 0 10 13" fill="none" style={{ flexShrink: 0, opacity: 0.5 }}>
                <path d="M5 0C2.24 0 0 2.24 0 5c0 3.75 5 8 5 8s5-4.25 5-8c0-2.76-2.24-5-5-5zm0 6.5A1.5 1.5 0 1 1 5 3.5a1.5 1.5 0 0 1 0 3z"
                  fill="var(--amber)" />
              </svg>
              <span style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.78rem',
                color: i === highlighted ? 'var(--text-primary)' : 'var(--text-secondary)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {s.label}
              </span>
            </div>
          ))}

          <div style={{
            padding: '5px 12px',
            fontSize: '0.62rem',
            color: 'var(--text-muted)',
            fontFamily: 'var(--font-mono)',
            borderTop: '1px solid var(--border)',
            background: 'var(--bg-surface)',
          }}>
            ↑↓ navigate · Enter select · Esc close
          </div>
        </div>
      )}

      <style>{`@keyframes loc-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}