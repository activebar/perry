'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import QRCode from 'qrcode'

export default function QrShareModal({
  open,
  onClose,
  url,
  title = 'סרקו והוסיפו ברכה',
  subtitle = 'פותח את עמוד הברכות',
  btnDownloadLabel = 'הורד כתמונה',
  btnCopyLabel = 'העתק קישור',
  btnWhatsappLabel = 'שלח בוואטסאפ'
}: {
  open: boolean
  onClose: () => void
  url: string
  title?: string
  subtitle?: string
  btnDownloadLabel?: string
  btnCopyLabel?: string
  btnWhatsappLabel?: string
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [copied, setCopied] = useState(false)

  const waLink = useMemo(() => {
    const text = `${title}\n${subtitle ? subtitle + '\n' : ''}${url}`
    return `https://wa.me/?text=${encodeURIComponent(text)}`
  }, [url, title, subtitle])

  useEffect(() => {
    if (!open) return
    ;(async () => {
      try {
        if (!canvasRef.current) return
        await QRCode.toCanvas(canvasRef.current, url, {
          width: 320,
          margin: 2,
          errorCorrectionLevel: 'M'
        })
      } catch {}
    })()
  }, [open, url])

  if (!open) return null

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch {}
  }

  function onDownload() {
    const canvas = canvasRef.current
    if (!canvas) return
    const pngUrl = canvas.toDataURL('image/png')
    const a = document.createElement('a')
    a.href = pngUrl
    a.download = 'qr.png'
    a.click()
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
            <div className="text-sm text-zinc-600">{subtitle}</div>
          </div>
          <button className="rounded-lg px-3 py-1 text-sm bg-zinc-100" onClick={onClose}>
            סגור
          </button>
        </div>

        <div className="mt-4 flex justify-center">
          <div className="rounded-2xl bg-white p-3 ring-1 ring-zinc-200">
            <canvas ref={canvasRef} />
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-2">
          <button className="rounded-xl bg-black px-4 py-3 text-white" onClick={onDownload}>
            {btnDownloadLabel}
          </button>

          <button className="rounded-xl bg-zinc-100 px-4 py-3" onClick={onCopy}>
            {copied ? 'הועתק ✅' : btnCopyLabel}
          </button>

          <a
            className="rounded-xl bg-emerald-600 px-4 py-3 text-center text-white"
            href={waLink}
            target="_blank"
            rel="noreferrer"
          >
            {btnWhatsappLabel}
          </a>
        </div>

        <div className="mt-3 rounded-xl bg-zinc-50 p-3 text-xs break-all text-zinc-700">{url}</div>
      </div>
    </div>
  )
}
