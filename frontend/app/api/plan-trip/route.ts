import { NextRequest, NextResponse } from 'next/server';

const DJANGO =
  process.env.DJANGO_API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  'http://localhost:8000';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const upstreamUrl = `${DJANGO}/api/plan-trip`;

    const upstream = await fetch(upstreamUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
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
    console.error('[plan-trip proxy]', err);
    return NextResponse.json(
      { detail: `Failed to reach backend at ${DJANGO}` },
      { status: 502 },
    );
  }
}
