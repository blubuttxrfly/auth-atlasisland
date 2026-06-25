// ─────────────────────────────────────────────────────────────
//  Atlas Island Auth — Shared Cookie Helpers
//  HMAC-signed session cookie for *.atlasisland.co
// ─────────────────────────────────────────────────────────────

import { createHmac, randomBytes, timingSafeEqual } from 'crypto'

const SESSION_SECRET = process.env.AUTH_SESSION_SECRET || ''
const COOKIE_NAME = 'atl_session_v2'
const DOMAIN = '.atlasisland.co'

export interface CookieSession {
  id: string
  signature: string
}

/**
 * Sign a random session id with HMAC-SHA256.
 */
export function signSessionId(id: string): string {
  if (!SESSION_SECRET) throw new Error('AUTH_SESSION_SECRET not configured')
  return createHmac('sha256', SESSION_SECRET).update(id).digest('hex')
}

/**
 * Create a new session id + signature pair.
 */
export function createSessionToken(): CookieSession {
  const id = randomBytes(32).toString('hex')
  return { id, signature: signSessionId(id) }
}

/**
 * Verify a cookie value like "id.signature".
 */
export function verifySessionToken(value: string): CookieSession | null {
  if (!value) return null
  const [id, signature] = value.split('.')
  if (!id || !signature) return null

  const expected = signSessionId(id)
  const sigBuf = Buffer.from(signature, 'hex')
  const expBuf = Buffer.from(expected, 'hex')

  if (sigBuf.length !== expBuf.length) return null
  if (!timingSafeEqual(sigBuf, expBuf)) return null

  return { id, signature }
}

/**
 * Build the Set-Cookie header for a fresh session.
 */
export function buildSessionCookie(value: string, maxAgeSeconds = 60 * 60 * 24 * 7): string {
  const secure = process.env.NODE_ENV === 'production' ? 'Secure;' : ''
  return `${COOKIE_NAME}=${value}; Domain=${DOMAIN}; Path=/; HttpOnly; ${secure} SameSite=Lax; Max-Age=${maxAgeSeconds}; Priority=High`
}

/**
 * Build a cookie that clears the session everywhere.
 */
export function buildClearCookie(): string {
  const secure = process.env.NODE_ENV === 'production' ? 'Secure;' : ''
  return `${COOKIE_NAME}=; Domain=${DOMAIN}; Path=/; HttpOnly; ${secure} SameSite=Lax; Max-Age=0; Priority=High`
}

export function parseCookies(cookieHeader?: string): Record<string, string> {
  if (!cookieHeader) return {}
  return Object.fromEntries(
    cookieHeader.split(';').map((c) => {
      const [k, ...v] = c.trim().split('=')
      return [k, v.join('=')]
    })
  )
}

export { COOKIE_NAME }
