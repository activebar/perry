// src/app/gift/ui.tsx
import Link from 'next/link'
import { Container, Card, Button } from '@/components/ui'
import { getBlockTitle } from '@/lib/db'

function isLikelyImageUrl(u?: string | null): u is string {
  if (!u) return false
  const base = (String(u).split('?')[0] || '').trim()
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

export default function GiftClient({
  settings,
  blocks,
  basePath
}: {
  settings: any
  blocks: any[]
  basePath?: string
}) {
  const s = settings || {}
  const giftTitle = getBlockTitle(blocks as any, 'gift', 'מתנה')

  const diameter = Math.max(80, Math.min(320, Number(s.gift_image_diameter || 160)))
  const homeHref = (basePath || '').trim() ? String(basePath) : '/'

  return (
    <main>
      <Container>
        {!s.gift_enabled ? (
          <div className="mt-4">
            <Card>
              <h2 className="text-xl font-bold">{giftTitle} לא זמינה כרגע</h2>
              <p className="text-sm text-zinc-600">אפשר לחזור לעמוד הראשי ולהמשיך לגלריה או ברכות.</p>
              <div className="mt-3">
                <Link href={homeHref}>
                  <Button>חזרה לדף הבית</Button>
                </Link>
              </div>
            </Card>
          </div>
        ) : (
          <div className="mt-4">
            <Card>
              <h2 className="text-xl font-bold">{giftTitle}</h2>
              <p className="text-sm text-zinc-600">תודה. בחרו דרך תשלום.</p>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-zinc-200 p-3">
                  <p className="font-semibold">Bit</p>

                  {isLikelyImageUrl(s.gift_bit_image_url) ? (
                    <div className="mt-3 flex justify-center">
                      <CircleImage src={s.gift_bit_image_url} size={diameter} alt="Bit" />
                    </div>
                  ) : null}

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

                <div className="rounded-2xl border border-zinc-200 p-3">
                  <p className="font-semibold">PayBox</p>

                  {isLikelyImageUrl(s.gift_paybox_image_url) ? (
                    <div className="mt-3 flex justify-center">
                      <CircleImage src={s.gift_paybox_image_url} size={diameter} alt="PayBox" />
                    </div>
                  ) : null}

                  <div className="mt-4">
                    {s.gift_paybox_url ? (
                      <a href={s.gift_paybox_url} target="_blank" rel="noreferrer">
                        <Button className="w-full" variant="ghost">
                          לתשלום בפייבוקס
                        </Button>
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
