// ─────────────────────────────────────────────────────────────
//  Atlas Island Auth — GET /api/session
//  Validate shared session cookie and return current user
// ─────────────────────────────────────────────────────────────

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { redis, Keys, isRedisConfigured, type AtlasSession } from '../_lib/redis.js'
import { parseCookies, verifySessionToken } from '../_lib/cookies.js'
import { corsHeaders } from '../_lib/response.js'

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const origin = (req.headers as any).origin || ''

  if (req.method === 'OPTIONS') {
    res.status(204)
    res.setHeader('Access-Control-Allow-Origin', origin || '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
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
  if (!session) {
    res.status(401).json({ success: false, error: 'Session expired' })
    return
  }

  // Check expiry
  if (new Date(session.expiresAt) < new Date()) {
    await redis.del(Keys.session(verified.id))
    res.status(401).json({ success: false, error: 'Session expired' })
    return
  }

  res.status(200).json({
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
      expiresAt: session.expiresAt,
    },
  })
}
