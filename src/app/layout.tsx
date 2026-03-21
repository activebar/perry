// Path: src/app/layout.tsx
// Version: V26.7
// Updated: 2026-03-21 20:55
// Note: root layout required for Next.js App Router

import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'ActiveBar',
  description: 'ActiveBar Event Platform',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="he" dir="rtl">
      <body>{children}</body>
    </html>
  )
}
