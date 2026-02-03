// src/app/layout.tsx
import type { Metadata } from 'next'

const SITE_URL = 'https://perry-b.vercel.app'

export async function generateMetadata(): Promise<Metadata> {
  const title = 'עידו חוגג בר מצווה'
  const description = 'ואנחנו נרגשים ושמחים להזמין אתכם לחגוג איתנו 🎉'

  const ogImage = `${SITE_URL}/api/og/image?default=1&v=1`

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: [
        {
          url: ogImage,
          width: 800,
          height: 800,
          type: 'image/jpeg',
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImage],
    },
  }
}
