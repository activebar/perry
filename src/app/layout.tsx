import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Event Gift Site',
  description: 'Event gift website powered by Active Bar'
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he">
      <body>
        <div className="min-h-screen">
          {children}
        </div>
      </body>
    </html>
  )
}
