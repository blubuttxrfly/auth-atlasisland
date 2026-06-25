// ─────────────────────────────────────────────────────────────
//  Atlas Island Auth — POST /api/auth/sign-out
//  Invalidate session and clear shared cookie across all realms
// ─────────────────────────────────────────────────────────────

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { redis, Keys, isRedisConfigured } from '../../_lib/redis.js'
import { parseCookies, verifySessionToken, buildClearCookie } from '../../_lib/cookies.js'

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

  const cookies = parseCookies(req.headers.cookie)
  const rawToken = cookies.atl_session_v2

  if (rawToken) {
    const verified = verifySessionToken(rawToken)
    if (verified && isRedisConfigured()) {
      await redis.del(Keys.session(verified.id))
    }
  }

  res.status(200)
  res.setHeader('Set-Cookie', buildClearCookie())
  res.json({ success: true, message: 'Signed out across all Atlas Island realms' })
}
