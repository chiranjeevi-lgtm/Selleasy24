import { NextResponse, type NextRequest } from 'next/server';
import { getAccessToken } from '@/lib/session';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/**
 * Project document proxy.
 *
 * Identical in purpose and guarantees to the listing document proxy next door:
 * the API requires a bearer token to release a document, and that token must
 * never be readable by the browser, so the file cannot simply be an <iframe>
 * src pointing at the API.
 *
 * Separate handler rather than a shared one with a query parameter — project
 * documents live in their own table behind their own API route, and a single
 * handler that guessed which of the two an id belonged to would either probe
 * both endpoints or get it wrong.
 *
 *  - The API still performs the authorisation check and still writes a
 *    DocumentAccessLog row. This proxy adds no permission of its own.
 *  - Every response is no-store and sandboxed.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return new NextResponse('Not found', { status: 404 });
  }

  const token = await getAccessToken();
  if (!token) {
    return new NextResponse('Not authorised', { status: 401 });
  }

  const upstream = await fetch(`${API_BASE}/api/verification/project-documents/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });

  if (!upstream.ok) {
    return new NextResponse(upstream.status === 403 ? 'Not permitted' : 'Not found', {
      status: upstream.status === 403 ? 403 : 404,
    });
  }

  const body = await upstream.arrayBuffer();

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': upstream.headers.get('content-type') ?? 'application/octet-stream',
      'Content-Disposition': upstream.headers.get('content-disposition') ?? 'inline',
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    },
  });
}
