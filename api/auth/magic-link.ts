// ─────────────────────────────────────────────────────────────
//  Atlas Island Auth — POST /api/auth/magic-link
//  Request a magic link email for cross-subdomain sign-in
// ─────────────────────────────────────────────────────────────

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { randomBytes } from 'crypto'
import { redis, Keys, isRedisConfigured } from '../../_lib/redis.js'
import { sendMagicLinkEmail } from '../../_lib/email.js'
import { jsonResponse, corsHeaders, errorResponse } from '../../_lib/response.js'

const MAGIC_LINK_TTL_SECONDS = 60 * 15 // 15 minutes
const RATE_LIMIT_TTL_SECONDS = 60 * 5 // 5 minutes
const MAX_MAGIC_LINKS_PER_WINDOW = 3

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

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

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const request = req as unknown as Request

  if (req.method === 'OPTIONS') {
    res.status(204).setHeader('Access-Control-Allow-Origin', (req.headers as any).origin || '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    res.setHeader('Access-Control-Allow-Credentials', 'true')
    res.end()
    return
  }

  if (req.method !== 'POST') {
    res.status(405).json({ success: false, error: 'Method not allowed' })
    return
  }

  if (!isRedisConfigured()) {
    res.status(503).json({ success: false, error: 'Auth service storage not configured' })
    return
  }

  const { email, returnTo } = req.body || {}

  if (!email || typeof email !== 'string' || !isValidEmail(email)) {
    res.status(400).json({ success: false, error: 'A valid email is required' })
    return
  }

  const normalizedEmail = email.toLowerCase().trim()

  // Rate limiting
  const rateKey = Keys.magicLinkRate(normalizedEmail)
  const currentCount = (await redis.get<number>(rateKey)) || 0
  if (currentCount >= MAX_MAGIC_LINKS_PER_WINDOW) {
    res.status(429).json({ success: false, error: 'Too many magic link requests. Please wait a few minutes.' })
    return
  }

  // Generate token
  const token = randomBytes(32).toString('hex')
  const magicUrl = `https://auth.atlasisland.co/api/auth/verify-magic?token=${token}${returnTo && isValidReturnTo(returnTo) ? `&returnTo=${encodeURIComponent(returnTo)}` : ''}`

  // Store token payload
  await redis.setex(Keys.magicToken(token), MAGIC_LINK_TTL_SECONDS, {
    email: normalizedEmail,
    returnTo: isValidReturnTo(returnTo) ? returnTo : undefined,
    createdAt: new Date().toISOString(),
  })

  // Increment rate limit counter
  await redis.setex(rateKey, RATE_LIMIT_TTL_SECONDS, currentCount + 1)

  // Send email
  const emailResult = await sendMagicLinkEmail({
    to: normalizedEmail,
    magicUrl,
    returnTo: isValidReturnTo(returnTo) ? returnTo : undefined,
  })

  if (!emailResult.success) {
    // Don't leak whether the email failed; just say it was sent
    console.error('[magic-link] email failed:', emailResult.error)
  }

  res.status(200).json({
    success: true,
    message: 'If this email is connected to Atlas Island, a sacred doorway has been sent.',
  })
}
