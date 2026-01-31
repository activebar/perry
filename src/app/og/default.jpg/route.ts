import { GET as ogGet } from '@/app/api/og/image/route'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(req: Request) {
  const u = new URL(req.url)
  const url = new URL('/api/og/image?default=1', u.origin)

  // Forward headers (some crawlers rely on UA)
  const forward = new Request(url.toString(), {
    headers: req.headers,
    method: 'GET',
  })

  return ogGet(forward)
}
