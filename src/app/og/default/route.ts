// Path: src/app/og/default/route.ts
// Version: V26.9
// Updated: 2026-03-21 21:20
// Note: rebuilt from scratch - always returns a real 630x630 JPEG without depending on DB, storage, or other routes

import { NextResponse } from 'next/server'
import sharp from 'sharp'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const SIZE = 630

function defaultSvg() {
  return Buffer.from(`
    <svg width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#111827"/>
          <stop offset="100%" stop-color="#000000"/>
        </linearGradient>
      </defs>
      <rect width="${SIZE}" height="${SIZE}" fill="url(#bg)"/>
      <circle cx="315" cy="190" r="86" fill="#ffffff" fill-opacity="0.08"/>
      <text x="50%" y="54%" text-anchor="middle" font-size="54" font-family="Arial, sans-serif" fill="#ffffff" font-weight="700">ActiveBar</text>
      <text x="50%" y="63%" text-anchor="middle" font-size="24" font-family="Arial, sans-serif" fill="#d4d4d8">Event Platform</text>
    </svg>
  `)
}

export async function GET() {
  const out = await sharp({
    create: {
      width: SIZE,
      height: SIZE,
      channels: 3,
      background: { r: 10, g: 10, b: 10 },
    },
  })
    .composite([{ input: defaultSvg(), top: 0, left: 0 }])
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer()

  return new NextResponse(new Uint8Array(out), {
    status: 200,
    headers: {
      'content-type': 'image/jpeg',
      'cache-control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400',
      'content-disposition': 'inline; filename=og-default.jpg',
      'x-content-type-options': 'nosniff',
    },
  })
}
