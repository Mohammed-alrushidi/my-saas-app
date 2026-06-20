import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

let mockResolveValue: any = { data: null, error: null }
let mockResponseQueue: any[] = []

function createQueryBuilder() {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    insert: vi.fn(() => builder),
    single: vi.fn(() => Promise.resolve(mockResponseQueue.shift() ?? mockResolveValue)),
    then: vi.fn((onfulfilled: any) =>
      Promise.resolve(mockResponseQueue.shift() ?? mockResolveValue).then(onfulfilled)),
  }
  return builder
}

const mockChain: any = {
  from: vi.fn(() => createQueryBuilder()),
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => mockChain),
}))

const mockGetProfile = vi.fn(() => ({
  id: "test-user-id",
  company_id: "test-company-id",
  role: "company_admin",
  companies: { name: "Test Company" },
}))

vi.mock("@/lib/supabase/queries", () => ({
  getProfile: (...args: any[]) => mockGetProfile(...args),
}))

beforeEach(() => {
  mockResponseQueue = []
  mockResolveValue = { data: null, error: null }
  vi.clearAllMocks()
})

import { parseExcel, deleteImport, confirmImport } from "@/app/dashboard/upload/actions"
import * as XLSX from "xlsx"

function makeXlsx(data: Record<string, unknown>[]): Buffer {
  const ws = XLSX.utils.json_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1")
  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }))
}

function makeFormData(rows: Record<string, unknown>[]): FormData {
  const buffer = makeXlsx(rows)
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  })
  const file = new File([blob], "test.xlsx")
  const fd = new FormData()
  fd.append("file", file)
  return fd
}

describe("parseExcel", () => {
  it("rejects non-admin role", async () => {
    mockGetProfile.mockReturnValueOnce({
      id: "test-user-id",
      company_id: "test-company-id",
      role: "staff",
      companies: { name: "Test Company" },
    })

    const formData = new FormData()
    const result = await parseExcel(formData)

    expect("error" in result).toBe(true)
    if ("error" in result) expect(result.error).toContain("Only company admins")
  })
})

describe("deleteImport", () => {
  it("rejects non-admin role", async () => {
    mockGetProfile.mockReturnValueOnce({
      id: "test-user-id",
      company_id: "test-company-id",
      role: "staff",
      companies: { name: "Test Company" },
    })

    const result = await deleteImport("some-import-id")

    expect(result.success).toBe(false)
    expect(result.error).toContain("Only company admins")
  })
})

describe("confirmImport", () => {
  it("rejects non-admin role", async () => {
    mockGetProfile.mockReturnValueOnce({
      id: "test-user-id",
      company_id: "test-company-id",
      role: "staff",
      companies: { name: "Test Company" },
    })

    const formData = new FormData()
    const result = await confirmImport(formData)

    expect(result.success).toBe(false)
    expect(result.error).toContain("Only company admins")
  })

  it("imports 1 valid row successfully", async () => {
    const validRow = {
      "Policy No": "POL001",
      "Quotation No": "Q001",
      "Customer Name": "Ahmed",
      "Mobile No": "91234567",
      "Policy Expiry Date": "31/12/2026",
      "Veh Make Model": "Toyota Camry",
      "Driver Age": 35,
      "Driver DOB": "15/06/1990",
      "New Premium + VAT Amount": 500,
    }

    const formData = makeFormData([validRow])

    mockResponseQueue.push(
      { data: [], error: null },
      { data: [], error: null },
      { data: { id: "import-1", company_id: "test-company-id" }, error: null },
      { error: null },
    )

    const result = await confirmImport(formData)

    expect(result.success).toBe(true)
    expect(result.importId).toBe("import-1")

    const { revalidatePath } = await import("next/cache")
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard")
  })

  it("handles duplicate policy number from existing DB records", async () => {
    const row = {
      "Policy No": "POL001",
      "Quotation No": "Q001",
      "Customer Name": "Ahmed",
      "Mobile No": "91234567",
      "Policy Expiry Date": "31/12/2026",
      "Veh Make Model": "Toyota Camry",
      "Driver Age": 35,
      "Driver DOB": "15/06/1990",
      "New Premium + VAT Amount": 500,
    }

    const formData = makeFormData([row])

    mockResponseQueue.push(
      { data: [{ policy_no: "pol001" }], error: null },
      { data: [], error: null },
      { data: { id: "import-2", company_id: "test-company-id" }, error: null },
      { error: null },
    )

    const result = await confirmImport(formData)

    expect(result.success).toBe(true)
    expect(result.importId).toBe("import-2")

    const fromCalls = mockChain.from.mock.calls
    expect(fromCalls[fromCalls.length - 1][0]).toBe("import_errors")

    const { revalidatePath } = await import("next/cache")
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard")
  })

  it("imports row with opted-out mobile and sets communication_status to opted_out", async () => {
    const row = {
      "Policy No": "POL002",
      "Quotation No": "Q002",
      "Customer Name": "Fatima",
      "Mobile No": "91234567",
      "Policy Expiry Date": "31/12/2026",
      "Veh Make Model": "Honda Civic",
      "Driver Age": 30,
      "Driver DOB": "10/03/1995",
      "New Premium + VAT Amount": 400,
    }

    const formData = makeFormData([row])

    mockResponseQueue.push(
      { data: [], error: null },
      { data: [{ mobile_no: "91234567" }], error: null },
      { data: { id: "import-3", company_id: "test-company-id" }, error: null },
      { error: null },
    )

    const result = await confirmImport(formData)

    expect(result.success).toBe(true)
    expect(result.importId).toBe("import-3")

    const lastBuilder = mockChain.from.mock.results.at(-1)!.value
    const inserted = lastBuilder.insert.mock.calls[0][0]
    expect(inserted).toHaveLength(1)
    expect(inserted[0].communication_status).toBe("opted_out")
    expect(inserted[0].mobile_no).toBe("+96891234567")

    const { revalidatePath } = await import("next/cache")
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard")
  })

  it("skips customer_records insert and writes import_errors when row is invalid", async () => {
    const row = {
      "Policy No": "",
      "Quotation No": "Q003",
      "Customer Name": "Said",
      "Mobile No": "91234567",
      "Policy Expiry Date": "31/12/2026",
      "Veh Make Model": "Nissan Sunny",
      "Driver Age": 40,
      "Driver DOB": "20/08/1985",
      "New Premium + VAT Amount": 350,
    }

    const formData = makeFormData([row])

    mockResponseQueue.push(
      { data: [], error: null },
      { data: [], error: null },
      { data: { id: "import-4", company_id: "test-company-id" }, error: null },
      { error: null },
    )

    const result = await confirmImport(formData)

    expect(result.success).toBe(true)
    expect(result.importId).toBe("import-4")

    const fromCalls = mockChain.from.mock.calls
    expect(fromCalls[fromCalls.length - 1][0]).toBe("import_errors")

    const { revalidatePath } = await import("next/cache")
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard")
  })
})
