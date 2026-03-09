import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(req: Request) {
  const url = new URL(req.url)
  const target = `${url.origin}/api/blessings/feed${url.search}`

  const res = await fetch(target, { cache: 'no-store' })
  const json = await res.json().catch(() => null)

  // אם הפיד לא החזיר JSON תקין
  if (!res.ok || !json) {
    return NextResponse.json(
      { ok: false, error: json?.error || 'Request failed' },
      { status: res.status || 500 }
    )
  }

  const items = Array.isArray(json.items) ? json.items : []

  // מחזירים גם posts וגם items כדי להתאים לכל מסך
  return NextResponse.json({
    ok: true,
    posts: items,
    items
  })
}
