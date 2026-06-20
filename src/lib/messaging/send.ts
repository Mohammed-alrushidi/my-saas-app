import { getProvider } from "./provider"
import type { SendResult } from "./types"

const BATCH_SIZE = 5
const BATCH_DELAY_MS = 500

function normalizeMobile(mobile: string): string {
  let num = mobile.trim()
  if (num.startsWith("+")) return num
  if (num.startsWith("00")) num = `+${num.slice(2)}`
  if (num.startsWith("+")) return num
  if (num.startsWith("968")) return `+${num}`
  return `+968${num}`
}

export async function sendMessages(
  recipients: { mobile: string; body: string }[],
): Promise<(SendResult & { mobile: string })[]> {
  const provider = getProvider()
  const allResults: (SendResult & { mobile: string })[] = []

  for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
    const batch = recipients.slice(i, i + BATCH_SIZE)
    const normalized = batch.map((r) => ({ ...r, mobile: normalizeMobile(r.mobile) }))

    const batchResults = await Promise.allSettled(
      normalized.map((r) => provider.send(r.mobile, r.body)),
    )

    for (let j = 0; j < normalized.length; j++) {
      const res = batchResults[j]
      const r = normalized[j]
      if (res.status === "fulfilled") {
        allResults.push({ ...res.value, mobile: r.mobile })
      } else {
        allResults.push({ success: false, error: res.reason?.message ?? "Unknown error", mobile: r.mobile })
      }
    }

    if (i + BATCH_SIZE < recipients.length) {
      await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS))
    }
  }

  return allResults
}
