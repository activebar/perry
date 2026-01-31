import { GET as ogGet } from '@/app/api/og/image/route'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const u = new URL(req.url)
  const id = String(params?.id || '').trim()
  const url = new URL(`/api/og/image?post=${encodeURIComponent(id)}`, u.origin)

  const forward = new Request(url.toString(), {
    headers: req.headers,
    method: 'GET'
  })

  return ogGet(forward)
}
