// ─────────────────────────────────────────────────────────────
//  Atlas Island Auth — GET /api/user/me
//  Return the current authenticated user + C.E.S. binding
// ─────────────────────────────────────────────────────────────

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { redis, Keys, isRedisConfigured, type AtlasSession, type AtlasUser } from '../../_lib/redis.js'
import { parseCookies, verifySessionToken } from '../../_lib/cookies.js'

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const origin = (req.headers as any).origin || ''

  if (req.method === 'OPTIONS') {
    res.status(204)
    res.setHeader('Access-Control-Allow-Origin', origin || '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    res.setHeader('Access-Control-Allow-Credentials', 'true')
    res.end()
    return
  }

  if (req.method !== 'GET') {
    res.status(405).json({ success: false, error: 'Method not allowed' })
    return
  }

  res.setHeader('Access-Control-Allow-Origin', origin || '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.setHeader('Access-Control-Allow-Credentials', 'true')
  res.setHeader('Vary', 'Origin')

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
  if (!session || new Date(session.expiresAt) < new Date()) {
    if (session) await redis.del(Keys.session(verified.id))
    res.status(401).json({ success: false, error: 'Session expired' })
    return
  }

  // Fetch the freshest user record in case C.E.S. binding was updated
  const user = await redis.get<AtlasUser>(Keys.userById(session.userId))

  res.status(200).json({
    success: true,
    user: {
      id: session.userId,
      email: session.email,
      name: session.name,
      cesProfileId: user?.cesProfileId || session.cesProfileId || undefined,
    },
    session: {
      id: session.id,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
    },
  })
}
