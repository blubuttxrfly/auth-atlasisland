// ─────────────────────────────────────────────────────────────
//  Atlas Island Auth — Email Delivery via Resend
//  Used for magic links, sign-in confirmations, and newsletters
// ─────────────────────────────────────────────────────────────

import { Resend } from 'resend'

const resendApiKey = process.env.RESEND_API_KEY || ''
const fromEmail = process.env.AUTH_EMAIL_FROM || 'Atlas Island <noreply@atlasisland.co>'

let resend: Resend | null = null
if (resendApiKey) {
  resend = new Resend(resendApiKey)
}

export function isEmailConfigured(): boolean {
  return Boolean(resendApiKey)
}

export interface SendMagicLinkOptions {
  to: string
  magicUrl: string
  returnTo?: string
}

export async function sendMagicLinkEmail(options: SendMagicLinkOptions): Promise<{ success: boolean; error?: string }> {
  if (!resend) {
    return { success: false, error: 'Email service not configured' }
  }

  const { to, magicUrl } = options

  try {
    const { data, error } = await resend.emails.send({
      from: fromEmail,
      to,
      subject: 'Sign in to Atlas Island 🔐🌈',
      html: `
        <div style="font-family: Inter, system-ui, sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a2e;">
          <h2 style="color: #7dd3fc;">Atlas Island 🔐🌈</h2>
          <p>A sacred doorway has been opened for you.</p>
          <p>Click the link below to sign in to Heartlight Collective, AUT Time & Tools, and IRIS.</p>
          <a href="${magicUrl}" style="display:inline-block; padding: 14px 24px; background:#7dd3fc; color:#0a0a0f; text-decoration:none; border-radius:999px; font-weight:600;">Sign In with Magic Link</a>
          <p style="font-size:0.85em; color:#666; margin-top:24px;">This link expires in 15 minutes and can only be used once. If you did not request it, you may safely ignore this email.</p>
          <p style="font-size:0.75em; color:#999; word-break:break-all;">${magicUrl}</p>
        </div>
      `,
      text: `Sign in to Atlas Island\n\n${magicUrl}\n\nThis link expires in 15 minutes and can only be used once.`,
    })

    if (error) {
      console.error('[Resend] magic link error:', error)
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[Resend] magic link exception:', message)
    return { success: false, error: message }
  }
}
