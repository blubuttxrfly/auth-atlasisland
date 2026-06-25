// ─────────────────────────────────────────────────────────────
//  Atlas Island Auth — POST /api/session/refresh
//  Extend an active session's expiry
// ─────────────────────────────────────────────────────────────

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { redis, Keys, isRedisConfigured, type AtlasSession } from '../../_lib/redis.js'
import { parseCookies, verifySessionToken, buildSessionCookie } from '../../_lib/cookies.js'

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST' && req.method !== 'OPTIONS') {
    res.status(405).json({ success: false, error: 'Method not allowed' })
    return
  }

  const origin = req.headers.origin || ''
  res.setHeader('Access-Control-Allow-Origin', origin || '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.setHeader('Access-Control-Allow-Credentials', 'true')
  res.setHeader('Vary', 'Origin')

  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }

  if (!isRedisConfigured()) {
    res.status(503).json({ success: false, error: 'Auth service storage not configured' })
    return
  }

  const cookies = parseCookies(req.headers.cookie)
  const rawToken = cookies.atl_session_v2

  if (!rawToken) {
    res.status(401).json({ success: false, error: 'No active session' })
    return
  }

  const verified = verifySessionToken(rawToken)
  if (!verified) {
    res.status(401).json({ success: false, error: 'Invalid session token' })
    return
  }

  const session = await redis.get<AtlasSession>(Keys.session(verified.id))
  if (!session) {
    res.status(401).json({ success: false, error: 'Session not found' })
    return
  }

  // Update expiry
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString()
  session.expiresAt = expiresAt
  await redis.setex(Keys.session(verified.id), SESSION_TTL_SECONDS, session)

  const cookieValue = `${verified.id}.${verified.signature}`

  res.status(200)
  res.setHeader('Set-Cookie', buildSessionCookie(cookieValue, SESSION_TTL_SECONDS))
  res.json({
    success: true,
    user: {
      id: session.userId,
      email: session.email,
      name: session.name,
      cesProfileId: session.cesProfileId,
    },
    session: {
      id: session.id,
      createdAt: session.createdAt,
      expiresAt,
    },
  })
}
