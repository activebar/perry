'use client'

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui'

export default function ShareModal({
  open,
  onClose,
  title = 'שיתוף',
  message,
  link,
  whatsappEnabled = true,
  whatsappLabel = 'שתף בוואטסאפ',
  copyLabel = 'העתק קישור'
}: {
  open: boolean
  onClose: () => void
  title?: string
  message: string
  link: string
  whatsappEnabled?: boolean
  whatsappLabel?: string
  copyLabel?: string
}) {
  const [copied, setCopied] = useState(false)

  const waLink = useMemo(() => {
    return `https://wa.me/?text=${encodeURIComponent(message)}`
  }, [message])

  if (!open) return null

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch {}
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onMouseDown={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl"
        onMouseDown={e => e.stopPropagation()}
        dir="rtl"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="text-right">
            <div className="text-lg font-semibold">{title}</div>
          </div>
          <button className="rounded-lg px-3 py-1 text-sm bg-zinc-100" onClick={onClose}>
            סגור
          </button>
        </div>

        <div className="mt-3 rounded-xl bg-zinc-50 p-3 text-xs whitespace-pre-wrap text-zinc-700">{message}</div>

        <div className="mt-4 grid grid-cols-1 gap-2">
          {whatsappEnabled ? (
            <a className="block" href={waLink} target="_blank" rel="noreferrer">
              <Button className="w-full">{whatsappLabel}</Button>
            </a>
          ) : null}

          <Button variant="ghost" onClick={onCopy}>
            {copied ? 'הועתק ✅' : copyLabel}
          </Button>
        </div>

        <div className="mt-3 rounded-xl bg-zinc-50 p-3 text-xs break-all text-zinc-700">{link}</div>
      </div>
    </div>
  )
}
