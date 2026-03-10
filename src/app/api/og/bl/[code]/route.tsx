import { ImageResponse } from "next/og"

export const runtime = "edge"

export async function GET(
  req: Request,
  { params }: { params: { code: string } }
) {

  const img = `${process.env.NEXT_PUBLIC_SITE_URL}/og-placeholder.jpg`

  return new ImageResponse(
    (
      <div
        style={{
          width: "630px",
          height: "630px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          alignItems: "center",
          background: "#f5f5f5",
          padding: 40
        }}
      >

        {/* כותרת */}
        <div
          style={{
            fontSize: 46,
            fontWeight: 700,
            textAlign: "center"
          }}
        >
          🎉 שי ואני מתחתנים 🎉
        </div>

        {/* תמונה */}
        <img
          src={img}
          style={{
            width: 520,
            height: 360,
            objectFit: "cover",
            borderRadius: 24
          }}
        />

        {/* טקסט */}
        <div
          style={{
            fontSize: 34,
            fontWeight: 600
          }}
        >
          ❤️ ברכה מהאירוע
        </div>

        {/* לוגו */}
        <img
          src={`${process.env.NEXT_PUBLIC_SITE_URL}/og-logo-activebar.png`}
          width={260}
        />

      </div>
    ),
    {
      width: 630,
      height: 630
    }
  )
}
