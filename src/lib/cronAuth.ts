import { NextRequest } from 'next/server'
import { getServerEnv } from './env'

export function assertCronAuth(req: NextRequest) {
  // Vercel Cron sends x-vercel-cron: 1
  const vercelCron = req.headers.get('x-vercel-cron')
  if (vercelCron === '1') return

  const srv = getServerEnv()
  const secret = srv.CRON_SECRET
  if (!secret) throw new Error('CRON_SECRET not configured')

  const header = req.headers.get('x-cron-secret')
  const auth = req.headers.get('authorization')
  const q = req.nextUrl.searchParams.get('secret')

  const candidate = header || q || (auth?.startsWith('Bearer ') ? auth.slice(7) : null)
  if (!candidate || candidate !== secret) {
    const e = new Error('Unauthorized')
    ;(e as any).status = 401
    throw e
  }
}
