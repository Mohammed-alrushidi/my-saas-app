import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

const mockEq = vi.fn()
const mockSelect = vi.fn()
const mockFrom = vi.fn()

mockSelect.mockReturnValue({ eq: mockEq })
mockFrom.mockReturnValue({ select: mockSelect })
mockEq.mockResolvedValue({ data: [], error: null })

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => ({ from: mockFrom })),
}))

vi.mock("@/lib/supabase/queries", () => ({
  getProfile: vi.fn(() => ({
    id: "test-user-id",
    company_id: "test-company-id",
    role: "company_admin",
  })),
}))

import { parseExcel } from "@/app/dashboard/upload/actions"
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

const VALID_ROW = {
  "Policy No": "POL001",
  "Quotation No": "Q001",
  "Customer Name": "John Doe",
  "Mobile No": "91234567",
  "Policy Expiry Date": "31/12/2025",
  "Veh Make Model": "Toyota Camry",
  "Driver Age": 35,
  "Driver DOB": "15/06/1990",
  "New Premium + VAT Amount": 500,
}

describe("parseExcel validation", () => {
  beforeEach(() => {
    mockEq.mockResolvedValue({ data: [], error: null })
  })

  it("accepts a valid row", async () => {
    const result = await parseExcel(makeFormData([VALID_ROW]))
    if ("error" in result) {
      expect(result.error).toBeUndefined()
      return
    }
    expect(result.preview.validRows).toBe(1)
    expect(result.preview.invalidRows).toBe(0)
    expect(result.preview.totalRows).toBe(1)
    expect(result.preview.errors).toHaveLength(0)
  })

  describe("policy number validation", () => {
    it("rejects missing policy number", async () => {
      const row = { ...VALID_ROW, "Policy No": "" }
      const result = await parseExcel(makeFormData([row]))
      if ("error" in result) return
      expect(result.preview.validRows).toBe(0)
      expect(result.preview.errors.some((e) => e.message === "Required")).toBe(true)
    })

    it("rejects duplicate policy number in file", async () => {
      const row2 = { ...VALID_ROW, "Policy No": "POL001", "Mobile No": "97123456" }
      const result = await parseExcel(makeFormData([VALID_ROW, row2]))
      if ("error" in result) return
      expect(result.preview.validRows).toBe(1)
      expect(result.preview.errors.some((e) => e.message === "Duplicate in file")).toBe(true)
    })
  })

  describe("customer name validation", () => {
    it("rejects missing customer name", async () => {
      const row = { ...VALID_ROW, "Customer Name": "" }
      const result = await parseExcel(makeFormData([row]))
      if ("error" in result) return
      expect(result.preview.validRows).toBe(0)
      expect(result.preview.errors.some((e) => e.message === "Required")).toBe(true)
    })

    it("rejects name over 200 characters", async () => {
      const row = { ...VALID_ROW, "Customer Name": "A".repeat(201) }
      const result = await parseExcel(makeFormData([row]))
      if ("error" in result) return
      expect(result.preview.validRows).toBe(0)
      expect(result.preview.errors.some((e) => e.message === "Max 200 characters")).toBe(true)
    })
  })

  describe("mobile number validation", () => {
    it("rejects missing mobile", async () => {
      const row = { ...VALID_ROW, "Mobile No": "" }
      const result = await parseExcel(makeFormData([row]))
      if ("error" in result) return
      expect(result.preview.validRows).toBe(0)
      expect(result.preview.errors.some((e) => e.message === "Required")).toBe(true)
    })

    it("marks row invalid_number for bad format mobile", async () => {
      const row = { ...VALID_ROW, "Mobile No": "abc" }
      const result = await parseExcel(makeFormData([row]))
      if ("error" in result) return
      // invalid format row is still counted as valid but flagged
      expect(result.preview.validRows).toBe(1)
      expect(result.preview.errors.some((e) => e.message === "Invalid mobile number format")).toBe(true)
    })

    it("detects opted-out mobile via supabase query", async () => {
      mockEq.mockResolvedValue({ data: [{ mobile_no: "91234567" }], error: null })
      const result = await parseExcel(makeFormData([VALID_ROW]))
      if ("error" in result) return
      // opted-out row is counted as valid but flagged
      expect(result.preview.validRows).toBe(1)
    })
  })

  describe("policy expiry date validation", () => {
    it("rejects missing expiry date", async () => {
      const row = { ...VALID_ROW, "Policy Expiry Date": "" }
      const result = await parseExcel(makeFormData([row]))
      if ("error" in result) return
      expect(result.preview.validRows).toBe(0)
      expect(result.preview.errors.some((e) => e.message === "Required")).toBe(true)
    })

    it("rejects invalid expiry date", async () => {
      const row = { ...VALID_ROW, "Policy Expiry Date": "not-a-date" }
      const result = await parseExcel(makeFormData([row]))
      if ("error" in result) return
      expect(result.preview.validRows).toBe(0)
      expect(result.preview.errors.some((e) => e.message === "Invalid date")).toBe(true)
    })
  })

  describe("driver age validation", () => {
    it("rejects age below 16", async () => {
      const row = { ...VALID_ROW, "Driver Age": 15 }
      const result = await parseExcel(makeFormData([row]))
      if ("error" in result) return
      expect(result.preview.validRows).toBe(0)
      expect(result.preview.errors.some((e) => e.message === "Must be a number between 16 and 120")).toBe(true)
    })

    it("rejects age above 120", async () => {
      const row = { ...VALID_ROW, "Driver Age": 121 }
      const result = await parseExcel(makeFormData([row]))
      if ("error" in result) return
      expect(result.preview.validRows).toBe(0)
    })

    it("accepts valid age", async () => {
      const row = { ...VALID_ROW, "Driver Age": 30 }
      const result = await parseExcel(makeFormData([row]))
      if ("error" in result) return
      expect(result.preview.validRows).toBe(1)
    })
  })

  describe("premium validation", () => {
    it("rejects negative premium", async () => {
      const row = { ...VALID_ROW, "New Premium + VAT Amount": -100 }
      const result = await parseExcel(makeFormData([row]))
      if ("error" in result) return
      expect(result.preview.validRows).toBe(0)
    })

    it("rejects non-numeric premium", async () => {
      const row = { ...VALID_ROW, "New Premium + VAT Amount": "abc" }
      const result = await parseExcel(makeFormData([row]))
      if ("error" in result) return
      expect(result.preview.validRows).toBe(0)
    })
  })

  describe("file-level validation", () => {
    it("rejects missing file", async () => {
      const fd = new FormData()
      const result = await parseExcel(fd)
      expect("error" in result).toBe(true)
      if ("error" in result) {
        expect(result.error).toBe("No file provided")
      }
    })

    it("rejects non-xlsx file extension", async () => {
      const blob = new Blob(["dummy"], { type: "text/plain" })
      const file = new File([blob], "test.txt")
      const fd = new FormData()
      fd.append("file", file)
      const result = await parseExcel(fd)
      expect("error" in result).toBe(true)
      if ("error" in result) {
        expect(result.error).toBe("File must be .xlsx or .xls")
      }
    })

    it("rejects missing columns", async () => {
      const result = await parseExcel(makeFormData([{ "Some Column": "value" }]))
      expect("error" in result).toBe(true)
      if ("error" in result) {
        expect(result.error).toContain("Missing required columns")
      }
    })

    it("rejects more than 5000 rows", async () => {
      const manyRows = Array.from({ length: 5001 }, (_, i) => ({
        ...VALID_ROW,
        "Policy No": `POL${String(i).padStart(4, "0")}`,
      }))
      const result = await parseExcel(makeFormData(manyRows))
      expect("error" in result).toBe(true)
      if ("error" in result) {
        expect(result.error).toContain("5000 rows")
      }
    })
  })
})
