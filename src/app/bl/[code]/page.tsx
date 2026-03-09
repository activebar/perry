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

  const first = await srv.from('short_links').select('target_path, kind, post_id').eq('code', code).maybeSingle()
  if (first.data?.target_path) {
    const k = String((first.data as any).kind || '').trim()
    if (!k || k === 'bl') return {
      target: String((first.data as any).target_path),
      postId: String((first.data as any).post_id || '').trim() || null,
    }
  }

  const second = await srv.from('short_links').select('target_path, post_id').eq('code', code).maybeSingle()
  if ((second.data as any)?.target_path) return {
    target: String((second.data as any).target_path),
    postId: String((second.data as any).post_id || '').trim() || null,
  }

  return { target: null, postId: null }
}

async function resolvePost(postId: string | null, target: string | null) {
  const idFromTarget = target ? (String(target).match(/\/blessings\/p\/([0-9a-f-]{36})/i)?.[1] || null) : null
  const id = postId || idFromTarget
  if (!id) return null

  const srv = supabaseServiceRole()
  const { data } = await srv
    .from('posts')
    .select('id, author_name, text, media_url')
    .eq('id', id)
    .eq('kind', 'blessing')
    .maybeSingle()
  return (data as any) || null
}

export async function generateMetadata({ params }: { params: { code: string } }): Promise<Metadata> {
  const code = cleanCode(params.code)
  if (!code) return {}

  const { target, postId } = await resolve(code)
  const post = await resolvePost(postId, target)
  const title = post?.author_name ? `ברכה מאת ${post.author_name}` : 'ברכה מהאירוע'
  const description = String(post?.text || 'לחצו לראות את הברכה').trim() || 'לחצו לראות את הברכה'
  const image = post?.id ? toAbsoluteUrl(`/api/og/image?post=${post.id}`) : toAbsoluteUrl('/api/og/image?default=1')
  const url = toAbsoluteUrl(`/bl/${code}`)

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url,
      images: image ? [{ url: image, width: 630, height: 630 }] : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: image ? [image] : undefined,
    },
  }
}

export default async function ShortBLLinkPage({ params }: { params: { code: string } }) {
  const code = cleanCode(params.code)
  if (!code) notFound()

  const { target } = await resolve(code)
  if (!target) notFound()

  redirect(target)
}
