import Head from 'next/head'
import type { GetServerSideProps } from 'next'
import { supabaseServiceRole } from '@/lib/supabase'

type Props = {
  title: string
  description: string
  imageUrl: string
  canonicalUrl: string
  redirectTo: string
}

function buildAbsolute(req: any, path: string) {
  const host = (req?.headers?.['x-forwarded-host'] || req?.headers?.host || '').toString()
  const proto = (req?.headers?.['x-forwarded-proto'] || 'https').toString()
  const base = host ? `${proto}://${host}` : 'https://localhost'
  const clean = path.startsWith('/') ? path : `/${path}`
  return `${base}${clean}`
}

export default function SharePage(props: Props) {
  const { title, description, imageUrl, canonicalUrl, redirectTo } = props

  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="description" content={description} />

        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:image" content={imageUrl} />
        <meta property="og:image:width" content="800" />
        <meta property="og:image:height" content="800" />
        <meta property="og:image:alt" content={title} />
        <meta property="og:type" content="website" />

        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={title} />
        <meta name="twitter:description" content={description} />
        <meta name="twitter:image" content={imageUrl} />

        <link rel="canonical" href={canonicalUrl} />
      </Head>

      <main style={{ fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial', padding: 24, textAlign: 'center' }} dir="rtl">
        <h1 style={{ fontSize: 22, margin: 0 }}>{title}</h1>
        <p style={{ opacity: 0.8, marginTop: 8 }}>{description}</p>
        <p style={{ marginTop: 18 }}>
          <a href={redirectTo} style={{ color: '#111', textDecoration: 'underline' }}>כניסה לאתר</a>
        </p>

        <script
          dangerouslySetInnerHTML={{
            __html: `try{setTimeout(function(){window.location.replace(${JSON.stringify(redirectTo)});}, 80);}catch(e){}`,
          }}
        />
      </main>
    </>
  )
}

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const req = ctx.req as any

  const sb = supabaseServiceRole()
  const { data } = await sb
    .from('event_settings')
    .select('event_name, meta_description, og_default_image_url, updated_at, created_at')
    .order('updated_at', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const title = String((data as any)?.event_name || 'Event Gift Site')
  const description = String((data as any)?.meta_description || 'Event gift website powered by Active Bar')

  const canonicalUrl = buildAbsolute(req, '/')
  const redirectTo = canonicalUrl

  // Use a clean OG endpoint (no query string) – better compatibility with WhatsApp/Facebook.
  const imageUrl = buildAbsolute(req, '/og/default')

  return {
    props: {
      title,
      description,
      imageUrl,
      canonicalUrl,
      redirectTo,
    },
  }
}
