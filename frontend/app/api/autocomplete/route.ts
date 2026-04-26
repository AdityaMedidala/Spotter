import { NextRequest, NextResponse } from 'next/server';

const DJANGO =
  process.env.DJANGO_API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  'http://localhost:8000';

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q') ?? '';

  if (q.trim().length < 2) {
    return NextResponse.json({ suggestions: [] });
  }

  try {
    const upstreamUrl = `${DJANGO}/api/autocomplete?q=${encodeURIComponent(q)}`;
    const upstream = await fetch(upstreamUrl, { cache: 'no-store' });
    const data = await upstream.json().catch(() => ({}));

    if (!upstream.ok) {
      const detail =
        typeof data?.detail === 'string'
          ? `Backend ${upstream.status}: ${data.detail} (${upstreamUrl})`
          : `Backend returned ${upstream.status} for ${upstreamUrl}`;

      return NextResponse.json(
        { suggestions: [], detail },
        { status: upstream.status },
      );
    }

    return NextResponse.json(data, { status: upstream.status });
  } catch (err) {
    console.error('[autocomplete proxy]', err);
    return NextResponse.json(
      {
        suggestions: [],
        detail: `Failed to reach backend at ${DJANGO}`,
      },
      { status: 502 },
    );
  }
}
