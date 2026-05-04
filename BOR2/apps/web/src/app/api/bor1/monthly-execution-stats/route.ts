import { type NextRequest, NextResponse } from "next/server"

const BOR1_URL = process.env.BOR1_SUPABASE_URL!
const BOR1_KEY = process.env.BOR1_SUPABASE_KEY!

async function bor1Get(table: string, params: Record<string, string>) {
  const qs = new URLSearchParams({ ...params, limit: "2000" }).toString()
  const res = await fetch(`${BOR1_URL}/rest/v1/${table}?${qs}`, {
    headers: { apikey: BOR1_KEY, Authorization: `Bearer ${BOR1_KEY}` },
    cache: "no-store",
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json() as Promise<Record<string, unknown>[]>
}

export async function GET(req: NextRequest) {
  const year = req.nextUrl.searchParams.get("year")
  if (!year) return NextResponse.json({ error: "year required" }, { status: 400 })

  try {
    const [ofiRows, histRows] = await Promise.all([
      bor1Get("operational_forecast_index", {
        reference_year: `eq.${year}`,
        select: "reference_month",
      }),
      bor1Get("monthly_execution_history", {
        reference_year: `eq.${year}`,
        select: "reference_month,actual_status",
      }),
    ])

    const planned = Array<number>(12).fill(0)
    const started = Array<number>(12).fill(0)

    for (const r of ofiRows) {
      const m = Number(r.reference_month)
      if (m >= 1 && m <= 12) planned[m - 1]++
    }

    for (const r of histRows) {
      const m      = Number(r.reference_month)
      const status = String(r.actual_status ?? "").toLowerCase().trim()
      if (m >= 1 && m <= 12 && status !== "not started" && status !== "not_started" && status !== "cancelled") {
        started[m - 1]++
      }
    }

    return NextResponse.json({ planned, started })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
