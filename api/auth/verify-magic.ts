// ─────────────────────────────────────────────────────────────
//  Atlas Island Auth — GET /api/auth/verify-magic
//  Verify magic token, create shared session, set cookie, redirect
// ─────────────────────────────────────────────────────────────

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { randomUUID } from 'crypto'
import { redis, Keys, isRedisConfigured, type AtlasUser, type AtlasSession } from '../../_lib/redis.js'
import { createSessionToken, buildSessionCookie, buildClearCookie } from '../../_lib/cookies.js'

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7 // 7 days

function isValidReturnTo(url: string): boolean {
  try {
    const parsed = new URL(url)
    const allowedHosts = [
      'heartlight.atlasisland.co',
      'aut.atlasisland.co',
      'iris.atlasisland.co',
      'auth.atlasisland.co',
      'localhost',
    ]
    return allowedHosts.includes(parsed.hostname)
  } catch {
    return false
  }
}

function safeRedirect(returnTo?: string): string {
  if (returnTo && isValidReturnTo(returnTo)) return returnTo
  return 'https://heartlight.atlasisland.co/'
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'GET') {
    res.status(405).json({ success: false, error: 'Method not allowed' })
    return
  }

  if (!isRedisConfigured()) {
    res.status(503).json({ success: false, error: 'Auth service storage not configured' })
    return
  }

  const token = req.query?.token as string | undefined
  const returnTo = req.query?.returnTo as string | undefined

  if (!token || typeof token !== 'string') {
    res.status(400).json({ success: false, error: 'Magic token is required' })
    return
  }

  // Fetch and immediately delete the token (single use)
  const tokenKey = Keys.magicToken(token)
  const payload = await redis.get<{ email: string; returnTo?: string; createdAt: string }>(tokenKey)
  await redis.del(tokenKey)

  if (!payload || typeof payload !== 'object') {
    res.status(400).json({ success: false, error: 'Magic link is invalid or has already been used' })
    return
  }

  const email = payload.email.toLowerCase().trim()

  // Find or create user
  const userKey = Keys.userByEmail(email)
  let user = await redis.get<AtlasUser>(userKey)

  const now = new Date().toISOString()
  if (!user) {
    const newUser: AtlasUser = {
      id: randomUUID(),
      email,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    }
    await redis.set(userKey, newUser)
    await redis.set(Keys.userById(newUser.id), newUser)
    user = newUser
  } else {
    // Mark email verified and update timestamp
    user.emailVerified = true
    user.updatedAt = now
    await redis.set(userKey, user)
    await redis.set(Keys.userById(user.id), user)
  }

  // Create session
  const sessionToken = createSessionToken()
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString()
  const session: AtlasSession = {
    id: sessionToken.id,
    userId: user.id,
    email: user.email,
    name: user.name,
    cesProfileId: user.cesProfileId,
    createdAt: now,
    expiresAt,
  }

  await redis.setex(Keys.session(session.id), SESSION_TTL_SECONDS, session)
  await redis.sadd(Keys.sessionsByUser(user.id), session.id)

  // Set shared cookie and redirect
  const cookieValue = `${sessionToken.id}.${sessionToken.signature}`
  const setCookie = buildSessionCookie(cookieValue, SESSION_TTL_SECONDS)

  const destination = safeRedirect(returnTo || payload.returnTo)

  res.status(302)
  res.setHeader('Location', destination)
  res.setHeader('Set-Cookie', setCookie)
  res.end()
}
