import { fetchSettings } from '@/lib/db'
import { getSiteUrl } from '@/lib/site-url'

export default async function Head() {
  let title = 'Event Gift Site'
  let description = 'Event gift website powered by Active Bar'

  try {
    const settings = await fetchSettings()
    title = String((settings as any)?.event_name || title)
    description = String((settings as any)?.meta_description || description)
  } catch {}

  const base = getSiteUrl()
  // Use the API OG endpoint because you already verified it returns an image.
  // WhatsApp is picky, so we keep it simple and absolute.
  const ogImage = `${base}/api/og/image?default=1`

  return (
    <>
      <title>{title}</title>
      <meta name="description" content={description} />

      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:type" content="website" />
      <meta property="og:url" content={base} />
      <meta property="og:image" content={ogImage} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={ogImage} />
    </>
  )
}
