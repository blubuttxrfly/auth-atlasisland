// ─────────────────────────────────────────────────────────────
//  Atlas Island Auth — POST /api/receive/inbound-email
//  Resend webhook: receive emails sent to *@atlasisland.co and
//  forward them to the configured receiving address.
// ─────────────────────────────────────────────────────────────

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { Resend } from 'resend'

export const config = {
  api: {
    bodyParser: false,
  },
}

const resendApiKey = process.env.RESEND_API_KEY || ''
const forwardTo = process.env.RESEND_INBOUND_FORWARD_TO || ''
const webhookSecret = process.env.RESEND_WEBHOOK_SECRET || ''
const fromEmail = process.env.AUTH_EMAIL_FROM || 'Atlas Island <noreply@atlasisland.co>'

interface ResendInboundEvent {
  type: 'email.received'
  created_at: string
  data: {
    email_id: string
    from: string
    to: string[]
    subject?: string
  }
}

function readRawBody(req: VercelRequest): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
    req.on('error', reject)
  })
}

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
    res.status(503).json({ success: false, error: 'Resend not configured' })
    return
  }

  if (!forwardTo) {
    res.status(503).json({ success: false, error: 'Inbound forwarding target not configured' })
    return
  }

  let rawBody = ''
  try {
    rawBody = await readRawBody(req)
  } catch (err) {
    console.error('[inbound-email] Failed to read body:', err)
    res.status(400).json({ success: false, error: 'Could not read request body' })
    return
  }

  const resend = new Resend(resendApiKey)

  // ── Verify webhook signature (if configured) ──
  if (webhookSecret) {
    try {
      const svixId = req.headers['svix-id'] as string | undefined
      const svixTimestamp = req.headers['svix-timestamp'] as string | undefined
      const svixSignature = req.headers['svix-signature'] as string | undefined
      if (!svixId || !svixTimestamp || !svixSignature) {
        throw new Error('Missing Svix headers')
      }
      resend.webhooks.verify({
        payload: rawBody,
        headers: {
          id: svixId,
          timestamp: svixTimestamp,
          signature: svixSignature,
        },
        webhookSecret,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('[inbound-email] Webhook verification failed:', message)
      res.status(401).json({ success: false, error: 'Invalid webhook signature' })
      return
    }
  }

  let event: ResendInboundEvent
  try {
    event = JSON.parse(rawBody)
  } catch {
    res.status(400).json({ success: false, error: 'Invalid JSON body' })
    return
  }

  if (event.type !== 'email.received' || !event.data?.email_id) {
    res.status(200).json({ success: true, message: 'Ignored non-inbound event' })
    return
  }

  const { email_id: emailId, to, from: originalFrom, subject } = event.data
  const intendedRecipient = to[0]

  console.log('[inbound-email] Received email', { emailId, to, from: originalFrom, subject })

  try {
    const { data, error } = await resend.emails.receiving.forward({
      emailId,
      to: forwardTo,
      from: fromEmail,
      passthrough: false,
      text: `Forwarded message from ${intendedRecipient}\n\n---`,
      html: `<p><em>Forwarded message originally sent to <strong>${intendedRecipient}</strong> on Atlas Island.</em></p><hr/>`,
    })

    if (error) {
      console.error('[inbound-email] Forward error:', error)
      res.status(500).json({ success: false, error: error.message })
      return
    }

    console.log('[inbound-email] Forwarded successfully:', data)
    res.status(200).json({ success: true, forwardedTo: forwardTo, emailId })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[inbound-email] Exception:', message)
    res.status(500).json({ success: false, error: message })
  }
}
