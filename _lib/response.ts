// ─────────────────────────────────────────────────────────────
//  Atlas Island Auth — Shared Response Helpers
//  Standard JSON responses with CORS headers for subdomains
// ─────────────────────────────────────────────────────────────

const ALLOWED_ORIGINS = new Set([
  'https://heartlight.atlasisland.co',
  'https://aut.atlasisland.co',
  'https://iris.atlasisland.co',
  'https://auth.atlasisland.co',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:3000',
])

export function getOrigin(request: Request): string {
  const origin = request.headers.get('origin') || ''
  if (ALLOWED_ORIGINS.has(origin)) return origin
  if (origin.endsWith('.atlasisland.co')) return origin
  return 'https://auth.atlasisland.co'
}

export interface JsonResponseOptions {
  status?: number
  headers?: Record<string, string>
  cookies?: string[]
}

export function jsonResponse(body: unknown, options: JsonResponseOptions = {}): Response {
  const { status = 200, headers = {}, cookies = [] } = options

  const responseHeaders = new Headers({
    'Content-Type': 'application/json',
    ...headers,
  })

  for (const cookie of cookies) {
    responseHeaders.append('Set-Cookie', cookie)
  }

  return new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders,
  })
}

export function corsHeaders(request: Request): Record<string, string> {
  const origin = getOrigin(request)
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true',
    'Vary': 'Origin',
  }
}

export function handleOptions(request: Request): Response {
  return new Response(null, {
    status: 204,
    headers: {
      ...corsHeaders(request),
      'Access-Control-Max-Age': '86400',
    },
  })
}

export function errorResponse(message: string, status = 400, request?: Request): Response {
  return jsonResponse(
    { success: false, error: message },
    {
      status,
      headers: request ? corsHeaders(request) : {},
    }
  )
}
