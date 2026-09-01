import { NextResponse } from "next/server"

// Railway's healthcheck pointed at "/", which only answers 307 on its way to
// /monthly-execution. That worked until it didn't, and every deploy started
// failing on Network > Healthcheck with a container that was up and serving.
// This route always answers 200 and depends on nothing.
export const dynamic = "force-dynamic"

export function GET() {
  return NextResponse.json({ status: "ok" })
}
