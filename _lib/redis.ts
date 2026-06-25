// ─────────────────────────────────────────────────────────────
//  Atlas Island Auth — Redis Client + Key Namespace
//  Shared session storage for Heartlight, AUT, and IRIS
// ─────────────────────────────────────────────────────────────

import { Redis } from '@upstash/redis'

const redisUrl = process.env.UPSTASH_REDIS_REST_URL || ''
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || ''

export const redis = new Redis({
  url: redisUrl,
  token: redisToken,
})

export function isRedisConfigured(): boolean {
  return Boolean(redisUrl && redisToken)
}

// ── Key namespace helpers ──
export const Keys = {
  // User identity: email → user record
  userByEmail: (email: string) => `atlas:user:email:${email.toLowerCase().trim()}`,
  userById: (id: string) => `atlas:user:${id}`,

  // Magic link tokens
  magicToken: (token: string) => `atlas:magic:${token}`,

  // Active sessions
  session: (id: string) => `atlas:session:${id}`,
  sessionsByUser: (userId: string) => `atlas:sessions:user:${userId}`,

  // CES profile binding
  cesBinding: (ces: string) => `atlas:ces:${ces}`,

  // Rate limiting
  magicLinkRate: (email: string) => `atlas:rate:magic:${email.toLowerCase().trim()}`,
}

export interface AtlasUser {
  id: string
  email: string
  emailVerified: boolean
  name?: string
  cesProfileId?: string
  createdAt: string
  updatedAt: string
}

export interface AtlasSession {
  id: string
  userId: string
  email: string
  name?: string
  cesProfileId?: string
  createdAt: string
  expiresAt: string
}

export interface MagicTokenPayload {
  email: string
  returnTo?: string
  createdAt: string
}
