import { NextResponse, type NextRequest } from 'next/server';
import { getAccessToken } from '@/lib/session';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/**
 * Document proxy.
 *
 * The API requires a bearer token to release a document, and that token must
 * never be readable by the browser — so the document cannot simply be an <img>
 * or <iframe> src pointing at the API.
 *
 * This handler attaches the token server-side and streams the response through.
 * Two consequences worth stating:
 *
 *  - The API still performs the authorisation check and still writes a
 *    DocumentAccessLog row. This proxy adds no permission of its own; it only
 *    carries the credential.
 *  - Every response is marked no-store and sandboxed. A cached identity document
 *    sitting in a shared browser profile is exactly the leak this platform exists
 *    to avoid.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // Reject anything that is not a UUID before it reaches the API.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return new NextResponse('Not found', { status: 404 });
  }

  const token = await getAccessToken();
  if (!token) {
    return new NextResponse('Not authorised', { status: 401 });
  }

  const upstream = await fetch(`${API_BASE}/api/verification/documents/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });

  if (!upstream.ok) {
    // Pass the status through without the body — upstream error payloads carry a
    // reference id and internal wording that staff tooling does not need to render.
    return new NextResponse(upstream.status === 403 ? 'Not permitted' : 'Not found', {
      status: upstream.status === 403 ? 403 : 404,
    });
  }

  const body = await upstream.arrayBuffer();

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': upstream.headers.get('content-type') ?? 'application/octet-stream',
      'Content-Disposition':
        upstream.headers.get('content-disposition') ?? 'inline',
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      'X-Content-Type-Options': 'nosniff',
      // Even if a hostile payload survived upload validation, it cannot execute
      // script or navigate from inside the viewer.
      'Content-Security-Policy': "default-src 'none'; sandbox",
    },
  });
}
