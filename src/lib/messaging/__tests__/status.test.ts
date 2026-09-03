import { describe, it, expect } from "vitest"
import {
  applyDeliveryStatusUpdate,
  mapTwilioStatus,
  type DeliveryStatus,
  type StatusUpdateDb,
} from "../status"

type FakeRow = {
  id: string
  company_id: string
  provider_message_id: string | null
  delivery_status: DeliveryStatus | null
}

type CapturedUpdate = {
  values: Record<string, unknown>
  sid: string
  orExpression: string
}

function matchesOr(expression: string, value: string | null): boolean {
  const allowsNull = /(?:^|,)delivery_status\.is\.null(?:,|$)/.test(expression)
  const inList = expression.match(/delivery_status\.in\.\(([^)]*)\)/)
  if (allowsNull && value === null) return true
  if (inList && value !== null && inList[1].split(",").includes(value)) return true
  return false
}

function createFakeDb(initialRows: FakeRow[]) {
  const rows = initialRows.map((row) => ({ ...row }))
  const updateCalls: CapturedUpdate[] = []
  let failOnUpdate = false
  let failOnExistenceCheck = false

  const db = {
    from(table: string) {
      if (table !== "messages") throw new Error(`unexpected table: ${table}`)
      return {
        update(values: Record<string, unknown>) {
          return {
            eq(_column: string, sid: string) {
              return {
                or(expression: string) {
                  return {
                    async select() {
                      if (failOnUpdate) {
                        return { data: null, error: { message: "simulated update failure" } }
                      }
                      updateCalls.push({ values, sid, orExpression: expression })
                      const matched = rows.filter(
                        (row) =>
                          row.provider_message_id === sid &&
                          matchesOr(expression, row.delivery_status),
                      )
                      for (const row of matched) {
                        row.delivery_status = values.delivery_status as DeliveryStatus
                      }
                      return { data: matched.map((row) => ({ id: row.id })), error: null }
                    },
                  }
                },
              }
            },
          }
        },
        select() {
          return {
            eq(_column: string, sid: string) {
              return {
                async maybeSingle() {
                  if (failOnExistenceCheck) {
                    return { data: null, error: { message: "simulated select failure" } }
                  }
                  const found = rows.find((row) => row.provider_message_id === sid) ?? null
                  return { data: found ? { id: found.id } : null, error: null }
                },
              }
            },
          }
        },
      }
    },
  }

  return {
    db: db as unknown as StatusUpdateDb,
    rows,
    updateCalls,
    failNextUpdate() {
      failOnUpdate = true
    },
    failNextExistenceCheck() {
      failOnExistenceCheck = true
    },
  }
}

function singleMessageRow(overrides: Partial<FakeRow> = {}): FakeRow[] {
  return [
    {
      id: "msg-1",
      company_id: "company-a",
      provider_message_id: SID,
      delivery_status: null,
      ...overrides,
    },
  ]
}

const SID = "SM00000000000000000000000000000000"

describe("mapTwilioStatus", () => {
  it("maps every real Twilio WhatsApp callback status onto a stored status", () => {
    expect(mapTwilioStatus("accepted")).toBe("queued")
    expect(mapTwilioStatus("scheduled")).toBe("queued")
    expect(mapTwilioStatus("queued")).toBe("queued")
    expect(mapTwilioStatus("sending")).toBe("queued")
    expect(mapTwilioStatus("sent")).toBe("sent")
    expect(mapTwilioStatus("delivered")).toBe("delivered")
    expect(mapTwilioStatus("read")).toBe("read")
    expect(mapTwilioStatus("undelivered")).toBe("undelivered")
    expect(mapTwilioStatus("failed")).toBe("failed")
    expect(mapTwilioStatus("canceled")).toBe("canceled")
  })

  it("is case-insensitive", () => {
    expect(mapTwilioStatus("DELIVERED")).toBe("delivered")
    expect(mapTwilioStatus("Sent")).toBe("sent")
  })

  it("returns null for non-delivery statuses and garbage", () => {
    expect(mapTwilioStatus("received")).toBeNull()
    expect(mapTwilioStatus("<script>alert(1)</script>")).toBeNull()
    expect(mapTwilioStatus("")).toBeNull()
  })
})

describe("applyDeliveryStatusUpdate", () => {
  it("advances a message through the forward lifecycle: queued → sent → delivered", async () => {
    const fake = createFakeDb(singleMessageRow())

    expect(await applyDeliveryStatusUpdate(fake.db, SID, "queued")).toBe("updated")
    expect(await applyDeliveryStatusUpdate(fake.db, SID, "sent")).toBe("updated")
    expect(await applyDeliveryStatusUpdate(fake.db, SID, "delivered")).toBe("updated")
    expect(fake.rows[0].delivery_status).toBe("delivered")
  })

  it("treats an identical duplicate callback as an idempotent no-op", async () => {
    const fake = createFakeDb(singleMessageRow())

    expect(await applyDeliveryStatusUpdate(fake.db, SID, "delivered")).toBe("updated")
    expect(await applyDeliveryStatusUpdate(fake.db, SID, "delivered")).toBe("unchanged")
    expect(fake.rows[0].delivery_status).toBe("delivered")
    expect(fake.updateCalls).toHaveLength(2)
  })

  it("ignores out-of-order callbacks that would regress the status", async () => {
    const fake = createFakeDb(singleMessageRow())

    await applyDeliveryStatusUpdate(fake.db, SID, "delivered")

    expect(await applyDeliveryStatusUpdate(fake.db, SID, "sent")).toBe("unchanged")
    expect(await applyDeliveryStatusUpdate(fake.db, SID, "queued")).toBe("unchanged")
    expect(fake.rows[0].delivery_status).toBe("delivered")
  })

  it("locks terminal failure states against later progress callbacks", async () => {
    const undeliveredFirst = createFakeDb(singleMessageRow())
    await applyDeliveryStatusUpdate(undeliveredFirst.db, SID, "undelivered")
    expect(await applyDeliveryStatusUpdate(undeliveredFirst.db, SID, "sent")).toBe("unchanged")
    expect(await applyDeliveryStatusUpdate(undeliveredFirst.db, SID, "delivered")).toBe("unchanged")
    expect(undeliveredFirst.rows[0].delivery_status).toBe("undelivered")

    const failedFirst = createFakeDb(singleMessageRow())
    await applyDeliveryStatusUpdate(failedFirst.db, SID, "failed")
    expect(await applyDeliveryStatusUpdate(failedFirst.db, SID, "delivered")).toBe("unchanged")
    expect(failedFirst.rows[0].delivery_status).toBe("failed")
  })

  it("never flips between mutually exclusive terminal outcomes", async () => {
    const fake = createFakeDb(singleMessageRow())

    await applyDeliveryStatusUpdate(fake.db, SID, "undelivered")
    expect(await applyDeliveryStatusUpdate(fake.db, SID, "failed")).toBe("unchanged")
    expect(fake.rows[0].delivery_status).toBe("undelivered")
  })

  it("allows the first callback to land directly on any lifecycle stage", async () => {
    for (const [raw, expected] of [
      ["sent", "sent"],
      ["delivered", "delivered"],
      ["failed", "failed"],
    ] as const) {
      const fake = createFakeDb(singleMessageRow())
      expect(await applyDeliveryStatusUpdate(fake.db, SID, raw)).toBe("updated")
      expect(fake.rows[0].delivery_status).toBe(expected)
    }
  })

  it("returns unknown_message for a signed SID that does not exist", async () => {
    const fake = createFakeDb(singleMessageRow())

    expect(await applyDeliveryStatusUpdate(fake.db, "SM-unknown", "delivered")).toBe("unknown_message")
  })

  it("ignores statuses outside the delivery lifecycle without touching the database", async () => {
    const fake = createFakeDb(singleMessageRow())

    expect(await applyDeliveryStatusUpdate(fake.db, SID, "received")).toBe("ignored")
    expect(fake.updateCalls).toHaveLength(0)
    expect(fake.rows[0].delivery_status).toBeNull()
  })

  it("restricts writes with a predecessor filter per target status", async () => {
    const fake = createFakeDb(singleMessageRow())

    await applyDeliveryStatusUpdate(fake.db, SID, "queued")
    await applyDeliveryStatusUpdate(fake.db, SID, "sent")
    await applyDeliveryStatusUpdate(fake.db, SID, "delivered")

    expect(fake.updateCalls[0].orExpression).toBe("delivery_status.is.null")
    expect(fake.updateCalls[1].orExpression).toBe(
      "delivery_status.is.null,delivery_status.in.(queued)",
    )
    expect(fake.updateCalls[2].orExpression).toBe(
      "delivery_status.is.null,delivery_status.in.(queued,sent)",
    )
  })

  it("propagates database failures from the conditional update", async () => {
    const fake = createFakeDb(singleMessageRow())
    fake.failNextUpdate()

    await expect(applyDeliveryStatusUpdate(fake.db, SID, "delivered")).rejects.toThrow(
      "simulated update failure",
    )
  })

  it("propagates database failures from the existence re-check", async () => {
    const fake = createFakeDb(singleMessageRow())
    await applyDeliveryStatusUpdate(fake.db, SID, "delivered")
    fake.failNextExistenceCheck()

    await expect(applyDeliveryStatusUpdate(fake.db, SID, "delivered")).rejects.toThrow(
      "simulated select failure",
    )
  })
})
