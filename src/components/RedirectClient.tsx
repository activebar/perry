'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function RedirectClient({ to, delayMs = 300 }: { to: string; delayMs?: number }) {
  const router = useRouter()
  useEffect(() => {
    const t = setTimeout(() => router.replace(to), delayMs)
    return () => clearTimeout(t)
  }, [to, delayMs, router])
  return null
}
