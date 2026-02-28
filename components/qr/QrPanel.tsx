'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { Button } from '@/components/ui'

export default function QrPanel({
  url,
  title = 'סרקו והוסיפו ברכה',
  subtitle = 'פותח את עמוד הברכות',
  btnDownloadLabel = 'הורד כתמונה',
  btnCopyLabel = 'העתק קישור',
  btnWhatsappLabel = 'שלח בוואטסאפ'
}: {
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
  }, [url])

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
    <div dir="rtl">
      <div className="text-right">
        <div className="text-lg font-semibold">{title}</div>
        <div className="text-sm text-zinc-600">{subtitle}</div>
      </div>

      <div className="mt-3 flex justify-center">
        <div className="rounded-2xl bg-white p-3 ring-1 ring-zinc-200">
          <canvas ref={canvasRef} />
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2">
        <Button onClick={onDownload}>{btnDownloadLabel}</Button>
        <Button variant="ghost" onClick={onCopy}>
          {copied ? 'הועתק ✅' : btnCopyLabel}
        </Button>
        <a className="block" href={waLink} target="_blank" rel="noreferrer">
          <Button variant="ghost" className="w-full">
            {btnWhatsappLabel}
          </Button>
        </a>
      </div>

      <div className="mt-3 rounded-xl bg-zinc-50 p-3 text-xs break-all text-zinc-700">{url}</div>
    </div>
  )
}
