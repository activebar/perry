'use client'

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui'
import QrShareModal from '@/components/qr/QrShareModal'

export default function BlessingsShareHeader({ settings }: { settings: any }) {
  const [open, setOpen] = useState(false)

  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const targetPath = (settings?.qr_target_path || '/blessings') as string
  const url = useMemo(() => (origin ? `${origin}${targetPath}` : targetPath), [origin, targetPath])

  const enabled = settings?.qr_enabled_blessings !== false
  if (!enabled) return null

  const label = String(settings?.qr_blessings_cta_label || 'סרקו / שתפו את עמוד הברכות')

  return (
    <div className="mt-3 flex justify-end" dir="rtl">
      <Button variant="secondary" className="gap-2" onClick={() => setOpen(true)}>
        <span aria-hidden>📱</span>
        <span>{label}</span>
      </Button>

      <QrShareModal
        open={open}
        onClose={() => setOpen(false)}
        url={url}
        title={settings?.qr_title || 'סרקו והוסיפו ברכה'}
        subtitle={settings?.qr_subtitle || 'פותח את עמוד הברכות'}
        btnDownloadLabel={settings?.qr_btn_download_label || 'הורד כתמונה'}
        btnCopyLabel={settings?.qr_btn_copy_label || 'העתק קישור'}
        btnWhatsappLabel={settings?.qr_btn_whatsapp_label || 'שלח בוואטסאפ'}
      />
    </div>
  )
}
