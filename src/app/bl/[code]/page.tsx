import { redirect, notFound } from 'next/navigation'
import { supabaseServiceRole } from '@/lib/supabase'

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

  // Prefer schemas that include kind, but fallback to legacy schema without kind.
  const first = await srv.from('short_links').select('target_path, kind').eq('code', code).maybeSingle()
  if (first.data?.target_path) {
    const k = String((first.data as any).kind || '').trim()
    if (!k || k === 'bl') return String((first.data as any).target_path)
  }

  // Legacy fallback: some schemas may not have `kind` column at all.
  const second = await srv.from('short_links').select('target_path').eq('code', code).maybeSingle()
  return (second.data as any)?.target_path ? String((second.data as any).target_path) : null
}

export default async function ShortBLLinkPage({ params }: { params: { code: string } }) {
  const code = cleanCode(params.code)
  if (!code) notFound()

  const target = await resolve(code)
  if (!target) notFound()

  redirect(target)
}
