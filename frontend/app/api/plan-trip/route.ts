import { NextRequest, NextResponse } from 'next/server';

const DJANGO =
  process.env.DJANGO_API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  'http://localhost:8000';

const TIMEOUT_MS = 30_000;

export async function POST(request: NextRequest) {
  const upstreamUrl = `${DJANGO}/api/plan-trip`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const body = await request.json();

    const upstream = await fetch(upstreamUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
      signal: controller.signal,
    });

    const data = await upstream.json().catch(() => ({}));

    if (!upstream.ok) {
      const detail =
        typeof data?.detail === 'string'
          ? `Backend ${upstream.status}: ${data.detail} (${upstreamUrl})`
          : `Backend returned ${upstream.status} for ${upstreamUrl}`;

      return NextResponse.json({ detail }, { status: upstream.status });
    }

    return NextResponse.json(data, { status: upstream.status });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      console.error('[plan-trip proxy] timeout after', TIMEOUT_MS, 'ms');
      return NextResponse.json(
        { detail: `Request timed out after ${TIMEOUT_MS / 1000}s — routing service may be slow` },
        { status: 504 },
      );
    }
    console.error('[plan-trip proxy]', err);
    return NextResponse.json(
      { detail: `Failed to reach backend at ${DJANGO}` },
      { status: 502 },
    );
  } finally {
    clearTimeout(timeout);
  }
}