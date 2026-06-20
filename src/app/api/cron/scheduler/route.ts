import { NextResponse } from "next/server"
import { runScheduler } from "@/lib/scheduler/run"

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET

  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 })
  }

  const authHeader = request.headers.get("authorization")
  const cronHeader = request.headers.get("x-cron-secret")

  const provided = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : cronHeader

  if (!provided || provided !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const result = await runScheduler()
    return NextResponse.json({ success: true, ...result })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
