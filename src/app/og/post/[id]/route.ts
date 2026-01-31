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

  const res = await ogGet(forward)
  const headers = new Headers(res.headers)
  if (!headers.get('content-type')) headers.set('content-type', 'image/png')
  headers.set('cache-control', 'public, max-age=0, s-maxage=86400, stale-while-revalidate=86400')
  return new Response(res.body, { status: res.status, headers })
}
