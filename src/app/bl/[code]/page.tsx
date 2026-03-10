import type { Metadata } from 'next'
import { redirect, notFound } from 'next/navigation'
import { supabaseServiceRole } from '@/lib/supabase'
import { toAbsoluteUrl } from '@/lib/site-url'

export const dynamic = 'force-dynamic'
export const revalidate = 0

function cleanCode(input: string) {
  return String(input || '')
    .trim()
    .toLowerCase()
    .replace(/[^0-9a-z]/g, '')
}

async function resolve(code: string) {
  const srv = supabaseServiceRole()

  const first = await srv
    .from('short_links')
    .select('target_path, kind, post_id')
    .eq('code', code)
    .maybeSingle()

  if (first.data?.target_path) {
    const k = String((first.data as any).kind || '').trim()
    if (!k || k === 'bl') {
      return {
        target: String((first.data as any).target_path),
        postId: String((first.data as any).post_id || '').trim() || null
      }
    }
  }

  return { target: null, postId: null }
}

export async function generateMetadata({
  params
}: {
  params: { code: string }
}): Promise<Metadata> {

  const ogImage = `${process.env.NEXT_PUBLIC_SITE_URL}/api/og/bl/${params.code}`

  return {
    openGraph: {
      images: [
        {
          url: ogImage,
          width: 630,
          height: 630
        }
      ]
    },
    twitter: {
      images: [ogImage]
    }
  }
}

export default async function ShortBLLinkPage({
  params
}: {
  params: { code: string }
}) {

  const code = cleanCode(params.code)
  if (!code) notFound()

  const { target } = await resolve(code)

  if (!target) notFound()

  redirect(target)
}
