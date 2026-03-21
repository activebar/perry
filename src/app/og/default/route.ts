// Path: src/app/og/default/route.ts
// Version: V26.8
// Updated: 2026-03-21 21:05
// Note: stable default OG route that always returns a real image and falls back to local /og/default.jpg

import { NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import { supabaseServiceRole } from '@/lib/supabase'
import { fetchSettings } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const revalidate = 0

function guessContentType(urlOrPath?: string | null) {
  const s = String(urlOrPath || '').toLowerCase()
  if (s.endsWith('.png')) return 'image/png'
  if (s.endsWith('.webp')) return 'image/webp'
  if (s.endsWith('.gif')) return 'image/gif'
  if (s.endsWith('.jpg') || s.endsWith('.jpeg')) return 'image/jpeg'
  return 'image/jpeg'
}

function extractUploadsPathFromPublicUrl(u: string) {
  const m = String(u || '').match(/\/storage\/v1\/object\/(public|sign)\/uploads\/(.+)$/i)
  return m?.[2] ? decodeURIComponent(m[2]) : null
}

async function downloadFromUploads(pathValue: string) {
  const sb = supabaseServiceRole()
  const clean = pathValue.replace(/^\/+/, '')
  const { data, error } = await sb.storage.from('uploads').download(clean)
  if (error || !data) throw new Error(error?.message || 'download failed')
  return Buffer.from(await data.arrayBuffer())
}

async function fetchRemote(url: string) {
  const res = await fetch(url, { redirect: 'follow', cache: 'no-store' })
  if (!res.ok) throw new Error(`fetch failed: ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  const ct = res.headers.get('content-type') || undefined
  return { buf, ct }
}

async function readLocalDefaultJpg() {
  const localPath = path.join(process.cwd(), 'src', 'app', 'og', 'default.jpg')
  return fs.readFile(localPath)
}

export async function GET() {
  try {
    const settings = await fetchSettings().catch(() => null)
    const ogUrl = String((settings as any)?.og_default_image_url || '').trim()

    const uploadsPath = ogUrl ? extractUploadsPathFromPublicUrl(ogUrl) : null
    if (uploadsPath) {
      const buf = await downloadFromUploads(uploadsPath)
      return new NextResponse(buf, {
        headers: {
          'content-type': guessContentType(uploadsPath),
          'cache-control': 'public, max-age=300, s-maxage=300, stale-while-revalidate=3600',
        },
      })
    }

    if (ogUrl && /^https?:\/\//i.test(ogUrl)) {
      const { buf, ct } = await fetchRemote(ogUrl)
      return new NextResponse(buf, {
        headers: {
          'content-type': ct || guessContentType(ogUrl),
          'cache-control': 'public, max-age=300, s-maxage=300, stale-while-revalidate=3600',
        },
      })
    }
  } catch {
    // continue to local fallback
  }

  try {
    const buf = await readLocalDefaultJpg()
    return new NextResponse(buf, {
      headers: {
        'content-type': 'image/jpeg',
        'cache-control': 'public, max-age=300, s-maxage=300, stale-while-revalidate=3600',
      },
    })
  } catch {
    return new NextResponse('missing default og image', { status: 404 })
  }
}
