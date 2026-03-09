type SendEmailArgs = {
  to: string
  subject: string
  html: string
  replyTo?: string
}

export async function sendEmail({ to, subject, html, replyTo }: SendEmailArgs) {
  const key = (process.env.RESEND_API_KEY || '').trim()
  const from = (process.env.MAIL_FROM || '').trim()
  const rt = (replyTo || process.env.MAIL_REPLY_TO || '').trim() || undefined

  if (!key) throw new Error('missing RESEND_API_KEY')
  if (!from) throw new Error('missing MAIL_FROM')

  const payload: any = { from, to, subject, html }
  if (rt) payload.reply_to = rt

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  })

  const j = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(j?.message || j?.error || 'failed to send email')
  }
  return j
}

export function appUrl() {
  return (process.env.APP_URL || '').trim() || 'http://localhost:3000'
}
