import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'ActiveBar',
  description: 'Event sites platform',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he">
      <body>{children}</body>
    </html>
  )
}
