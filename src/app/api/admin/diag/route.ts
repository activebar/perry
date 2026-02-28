import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  const token = process.env.META_OEMBED_ACCESS_TOKEN || ''
  return NextResponse.json({
    ok: true,
    has_meta_token: !!token,
    meta_token_prefix: token ? token.slice(0, 10) + '...' : '',
    node_env: process.env.NODE_ENV
  })
}
