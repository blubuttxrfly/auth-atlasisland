// ─────────────────────────────────────────────────────────────
//  Atlas Island Auth — PATCH /api/user/bind-ces
//  Link or update a C.E.S. profile on the current authenticated user
// ─────────────────────────────────────────────────────────────

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { redis, Keys, isRedisConfigured, type AtlasSession, type AtlasUser } from '../../_lib/redis.js'
import { parseCookies, verifySessionToken } from '../../_lib/cookies.js'

const CES_ID_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const origin = (req.headers as any).origin || ''

  if (req.method === 'OPTIONS') {
    res.status(204)
    res.setHeader('Access-Control-Allow-Origin', origin || '*')
    res.setHeader('Access-Control-Allow-Methods', 'PATCH, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    res.setHeader('Access-Control-Allow-Credentials', 'true')
    res.end()
    return
  }

  if (req.method !== 'PATCH') {
    res.status(405).json({ success: false, error: 'Method not allowed' })
    return
  }

  res.setHeader('Access-Control-Allow-Origin', origin || '*')
  res.setHeader('Access-Control-Allow-Methods', 'PATCH, OPTIONS')
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
    await redis.del(Keys.session(verified.id))
    res.status(401).json({ success: false, error: 'Session expired' })
    return
  }

  const { cesProfileId } = req.body || {}
  if (!cesProfileId || typeof cesProfileId !== 'string' || !CES_ID_PATTERN.test(cesProfileId)) {
    res.status(400).json({ success: false, error: 'A valid cesProfileId is required' })
    return
  }

  const userByIdKey = Keys.userById(session.userId)
  const userByEmailKey = Keys.userByEmail(session.email)

  const [userById, userByEmail] = await Promise.all([
    redis.get<AtlasUser>(userByIdKey),
    redis.get<AtlasUser>(userByEmailKey),
  ])

  const user = userById || userByEmail
  if (!user) {
    res.status(404).json({ success: false, error: 'User not found' })
    return
  }

  const now = new Date().toISOString()
  const updated: AtlasUser = {
    ...user,
    cesProfileId,
    updatedAt: now,
  }

  // Update both user keys atomically-ish (Redis pipelining via multi/exec if needed, but parallel is fine here)
  await Promise.all([
    redis.set(userByIdKey, updated),
    redis.set(userByEmailKey, updated),
    redis.set(Keys.cesBinding(cesProfileId), { userId: user.id, email: user.email, boundAt: now }),
  ])

  // Also update the active session so it reflects immediately
  const updatedSession: AtlasSession = {
    ...session,
    cesProfileId,
  }
  const ttlRemaining = Math.max(1, Math.floor((new Date(session.expiresAt).getTime() - Date.now()) / 1000))
  await redis.setex(Keys.session(verified.id), ttlRemaining, updatedSession)

  res.status(200).json({
    success: true,
    message: 'C.E.S. profile bound to your Atlas Island identity',
    user: {
      id: updated.id,
      email: updated.email,
      name: updated.name,
      cesProfileId: updated.cesProfileId,
    },
    session: {
      id: updatedSession.id,
      createdAt: updatedSession.createdAt,
      expiresAt: updatedSession.expiresAt,
    },
  })
}
