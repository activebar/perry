// src/app/gift/page.tsx
import Link from 'next/link'
import { Container, Card, Button } from '@/components/ui'
import { fetchBlocks, fetchSettings, getBlockTitle } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const revalidate = 0

function isLikelyImageUrl(u?: string | null) {
  const val = String(u || '')
  if (!val) return false
  const base = val.split('?')[0] || ''
  return /\.(png|jpe?g|webp|gif|svg)$/i.test(base)
}

function CircleImage({ src, size, alt }: { src: string; size: number; alt: string }) {
  return (
    <div
      style={{ width: size, height: size }}
      className="overflow-hidden rounded-full ring-1 ring-zinc-200 bg-white flex items-center justify-center"
    >
      <img src={src} alt={alt} className="h-full w-full object-contain p-6" />
    </div>
  )
}

export default async function GiftPage() {
  const [s, blocks] = await Promise.all([fetchSettings(), fetchBlocks()])
  const blessingsTitle = getBlockTitle(blocks as any, 'blessings', (String((s as any)?.blessings_title || '').trim() || 'ברכות'))
  const galleryTitle = getBlockTitle(blocks as any, 'gallery', 'גלריה')
  const giftTitle = getBlockTitle(blocks as any, 'gift', 'מתנה')

  const diameter = Math.max(80, Math.min(320, Number(s.gift_image_diameter || 160)))

  return (
    <main>
      <Container>
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Link href="/"><Button variant="ghost">← חזרה לדף הבית</Button></Link>
            <div className="flex flex-wrap gap-2">
              <Link href="/"><Button variant="ghost">בית</Button></Link>
              <Link href="/gallery"><Button variant="ghost">{galleryTitle}</Button></Link>
              <Link href="/blessings"><Button variant="ghost">{blessingsTitle}</Button></Link>
              <Link href="/gift"><Button>{giftTitle}</Button></Link>
            </div>
          </div>
        </Card>

        {!s.gift_enabled ? (
          <div className="mt-4">
            <Card>
              <h2 className="text-xl font-bold">{giftTitle} לא זמינה כרגע</h2>
              <p className="text-sm text-zinc-600">אפשר לחזור לעמוד הראשי ולהמשיך לגלריה/ברכות.</p>
              <div className="mt-3">
                <Link href="/"><Button>חזרה לדף הבית</Button></Link>
              </div>
            </Card>
          </div>
        ) : (
          <div className="mt-4">
            <Card>
              <h2 className="text-xl font-bold">{giftTitle}</h2>
              <p className="text-sm text-zinc-600">תודה! בחרו דרך תשלום:</p>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {/* BIT */}
                <div className="rounded-2xl border border-zinc-200 p-3">
                  <p className="font-semibold">Bit</p>

                  {isLikelyImageUrl(s.gift_bit_image_url) && (
                    <div className="mt-3 flex justify-center">
                      <CircleImage src={s.gift_bit_image_url!} size={diameter} alt="Bit" />
                    </div>
                  )}

                  <div className="mt-4">
                    {s.gift_bit_url ? (
                      <a href={s.gift_bit_url} target="_blank" rel="noreferrer">
                        <Button className="w-full">לתשלום בביט</Button>
                      </a>
                    ) : (
                      <p className="text-sm text-zinc-500">קישור Bit עדיין לא הוגדר.</p>
                    )}
                  </div>
                </div>

                {/* PAYBOX */}
                <div className="rounded-2xl border border-zinc-200 p-3">
                  <p className="font-semibold">PayBox</p>

                  {isLikelyImageUrl(s.gift_paybox_image_url) && (
                    <div className="mt-3 flex justify-center">
                      <CircleImage src={s.gift_paybox_image_url!} size={diameter} alt="PayBox" />
                    </div>
                  )}

                  <div className="mt-4">
                    {s.gift_paybox_url ? (
                      <a href={s.gift_paybox_url} target="_blank" rel="noreferrer">
                        <Button variant="ghost" className="w-full">לתשלום בפייבוקס</Button>
                      </a>
                    ) : (
                      <p className="text-sm text-zinc-500">קישור PayBox עדיין לא הוגדר.</p>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          </div>
        )}
      </Container>
    </main>
  )
}
