// ─────────────────────────────────────────────────────────────
//  Atlas Island Auth — GET /api/health
//  Simple health check for the auth service
// ─────────────────────────────────────────────────────────────

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { isRedisConfigured } from '../_lib/redis.js'
import { isEmailConfigured } from '../_lib/email.js'

export default function handler(req: VercelRequest, res: VercelResponse): void {
  res.status(200).json({
    success: true,
    service: 'auth.atlasisland.co',
    redis: isRedisConfigured(),
    email: isEmailConfigured(),
    timestamp: new Date().toISOString(),
  })
}
