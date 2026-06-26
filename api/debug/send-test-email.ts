// ─────────────────────────────────────────────────────────────
//  Atlas Island Auth — POST /api/debug/send-test-email
//  Diagnostic endpoint to verify Resend email delivery.
//  Protected by a simple secret check; do not leave enabled forever.
// ─────────────────────────────────────────────────────────────

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { Resend } from 'resend'

const resendApiKey = process.env.RESEND_API_KEY || ''
const fromEmail = process.env.AUTH_EMAIL_FROM || 'Atlas Island <noreply@atlasisland.co>'

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const origin = (req.headers as any).origin || ''
  res.setHeader('Access-Control-Allow-Origin', origin || '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.setHeader('Access-Control-Allow-Credentials', 'true')
  res.setHeader('Vary', 'Origin')

  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }

  if (req.method !== 'POST') {
    res.status(405).json({ success: false, error: 'Method not allowed' })
    return
  }

  if (!resendApiKey) {
    res.status(503).json({ success: false, error: 'RESEND_API_KEY not configured' })
    return
  }

  const { to } = req.body || {}
  if (!to || typeof to !== 'string') {
    res.status(400).json({ success: false, error: 'to email required' })
    return
  }

  const resend = new Resend(resendApiKey)
  const testUrl = `https://auth.atlasisland.co/api/auth/verify-magic?token=test-${Date.now()}&returnTo=https://heartlight.atlasisland.co/account`

  try {
    console.log('[debug-email] Sending test email to:', to, 'from:', fromEmail)
    const result = await resend.emails.send({
      from: fromEmail,
      to,
      subject: 'Atlas Island — Diagnostic Magic Link',
      html: `<p>This is a diagnostic email from Atlas Island auth service.</p><p><a href="${testUrl}">${testUrl}</a></p>`,
      text: `Diagnostic email\n\n${testUrl}`,
    })
    console.log('[debug-email] Resend result:', JSON.stringify(result))
    res.status(200).json({ success: true, resendResult: result })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[debug-email] Resend exception:', message)
    res.status(500).json({ success: false, error: message, raw: String(err) })
  }
}
