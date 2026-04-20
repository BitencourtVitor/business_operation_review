import { type NextRequest, NextResponse } from "next/server"

const BOR1_URL = process.env.BOR1_SUPABASE_URL!
const BOR1_KEY = process.env.BOR1_SUPABASE_KEY!

export async function GET(req: NextRequest) {
  const table  = req.nextUrl.searchParams.get("table")
  const limit  = Number(req.nextUrl.searchParams.get("limit")  ?? 50)
  const offset = Number(req.nextUrl.searchParams.get("offset") ?? 0)

  if (!table) return NextResponse.json({ error: "table param required" }, { status: 400 })

  try {
    const res = await fetch(
      `${BOR1_URL}/rest/v1/${encodeURIComponent(table)}?select=*&limit=${limit}&offset=${offset}`,
      {
        headers: {
          apikey:          BOR1_KEY,
          Authorization:   `Bearer ${BOR1_KEY}`,
          Prefer:          "count=exact",
        },
        cache: "no-store",
      }
    )

    if (!res.ok) {
      const body = await res.text()
      return NextResponse.json({ error: body }, { status: res.status })
    }

    const rows  = await res.json()
    const range = res.headers.get("content-range") ?? ""
    // content-range format: "0-49/1234"
    const total = Number(range.split("/")[1]) || (Array.isArray(rows) ? rows.length : 0)

    return NextResponse.json({ rows, total })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
