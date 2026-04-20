import { NextResponse } from "next/server"

const BOR1_URL = process.env.BOR1_SUPABASE_URL!
const BOR1_KEY = process.env.BOR1_SUPABASE_KEY!

export async function GET() {
  try {
    const res = await fetch(`${BOR1_URL}/rest/v1/`, {
      headers: {
        apikey: BOR1_KEY,
        Authorization: `Bearer ${BOR1_KEY}`,
      },
      cache: "no-store",
    })

    if (!res.ok) throw new Error(`Supabase responded with ${res.status}`)

    const spec = await res.json()
    const tables = Object.keys(spec.definitions ?? {}).sort()

    return NextResponse.json({ tables })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
