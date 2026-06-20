"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { getProfile } from "@/lib/supabase/queries"

import * as XLSX from "xlsx"

export type PreviewData = {
  validRows: number
  invalidRows: number
  totalRows: number
  errors: { row: number; field: string; message: string }[]
  sample: Record<string, string | undefined>[]
}

export type ParseResult = { preview: PreviewData } | { error: string }

type RowValues = {
  policy_no: string
  quotation_no: string
  customer_name: string
  mobile_no: string
  policy_expiry_date: string
  veh_make_model: string
  driver_age: number | null
  driver_dob: string | null
  new_premium_vat_amount: number | null
  communication_status: string
}

type ValidationError = { row: number; field: string; message: string }

type ValidationResult = {
  rowValid: boolean
  errors: ValidationError[]
  values: RowValues
}

const COLUMN_MAP: Record<string, string> = {
  "policy no": "policy_no",
  "quotation no": "quotation_no",
  "customer name": "customer_name",
  "mobile no": "mobile_no",
  "policy expiry date": "policy_expiry_date",
  "veh make model": "veh_make_model",
  "driver age": "driver_age",
  "driver dob": "driver_dob",
  "new premium + vat amount": "new_premium_vat_amount",
}

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase()
}

function findColumn(row: Record<string, unknown>, ...candidates: string[]): string | undefined {
  const keys = Object.keys(row)
  for (const c of candidates) {
    const norm = normalizeHeader(c)
    const found = keys.find((k) => normalizeHeader(k) === norm)
    if (found) return found
  }
  return undefined
}

function parseExcelDate(value: unknown): Date | null {
  if (value == null || value === "") return null
  if (typeof value === "number") {
    const epoch = new Date(Date.UTC(1899, 11, 30))
    const d = new Date(epoch.getTime() + value * 86400000)
    if (!isNaN(d.getTime())) return d
  }
  if (value instanceof Date && !isNaN(value.getTime())) return value
  if (typeof value === "string") {
    const ddmm = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
    if (ddmm) {
      const d = new Date(`${ddmm[3]}-${ddmm[2].padStart(2, "0")}-${ddmm[1].padStart(2, "0")}`)
      if (!isNaN(d.getTime())) return d
    }
    const d = new Date(value)
    if (!isNaN(d.getTime())) return d
    const num = parseFloat(value)
    if (!isNaN(num) && num > 40000) {
      return parseExcelDate(num)
    }
  }
  return null
}

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0]
}

function isValidMobile(mobile: string): boolean {
  const cleaned = mobile.replace(/[\s\-\(\)\+]/g, "")
  return /^\d{7,15}$/.test(cleaned)
}

function cleanMobile(raw: string): string {
  return raw.replace(/[\s\-\(\)]/g, "")
}

function normalizeMobile(raw: string): string {
  let num = raw.trim()
  if (num.startsWith("+")) return num
  if (num.startsWith("00")) num = `+${num.slice(2)}`
  if (num.startsWith("+")) return num
  if (num.startsWith("968")) return `+${num}`
  return `+968${num}`
}

function validateRow(
  row: Record<string, unknown>,
  rowNum: number,
  seenFilePolicyNos: Set<string>,
  existingDbPolicyNos: Set<string> | null,
  optedOutMobiles: Set<string> | null = null,
): ValidationResult {
  const errors: ValidationError[] = []
  let rowValid = true

  const policyNoCol = findColumn(row, "Policy No")
  const policyNo = policyNoCol ? String(row[policyNoCol] ?? "").trim() : ""

  if (!policyNo) {
    errors.push({ row: rowNum, field: "Policy No", message: "Required" })
    rowValid = false
  } else if (seenFilePolicyNos.has(policyNo.toLowerCase())) {
    errors.push({ row: rowNum, field: "Policy No", message: "Duplicate in file" })
    rowValid = false
  } else if (existingDbPolicyNos?.has(policyNo.toLowerCase())) {
    errors.push({ row: rowNum, field: "Policy No", message: "Duplicate policy number" })
    rowValid = false
  } else {
    seenFilePolicyNos.add(policyNo.toLowerCase())
  }

  const nameCol = findColumn(row, "Customer Name")
  const customerName = nameCol ? String(row[nameCol] ?? "").trim() : ""
  if (!customerName) {
    errors.push({ row: rowNum, field: "Customer Name", message: "Required" })
    rowValid = false
  } else if (customerName.length > 200) {
    errors.push({ row: rowNum, field: "Customer Name", message: "Max 200 characters" })
    rowValid = false
  }

  const mobileCol = findColumn(row, "Mobile No")
  const rawMobile = mobileCol ? String(row[mobileCol] ?? "").trim() : ""
  let mobile = rawMobile
  let commStatus = "allowed"
  if (!rawMobile) {
    errors.push({ row: rowNum, field: "Mobile No", message: "Required" })
    rowValid = false
  } else if (!isValidMobile(rawMobile)) {
    mobile = cleanMobile(rawMobile)
    commStatus = "invalid_number"
    errors.push({ row: rowNum, field: "Mobile No", message: "Invalid mobile number format" })
  } else if (optedOutMobiles?.has(cleanMobile(rawMobile))) {
    mobile = cleanMobile(rawMobile)
    commStatus = "opted_out"
  }

  if (mobile && commStatus !== "invalid_number") {
    mobile = normalizeMobile(mobile)
  }

  const expiryCol = findColumn(row, "Policy Expiry Date")
  const expiryRaw = expiryCol ? row[expiryCol] : null
  const expiryParsed = expiryRaw ? parseExcelDate(expiryRaw) : null
  let expiryDateStr = ""
  if (!expiryRaw || String(expiryRaw).trim() === "") {
    errors.push({ row: rowNum, field: "Policy Expiry Date", message: "Required" })
    rowValid = false
  } else if (!expiryParsed) {
    errors.push({ row: rowNum, field: "Policy Expiry Date", message: "Invalid date" })
    rowValid = false
  } else {
    expiryDateStr = formatDate(expiryParsed)
  }

  const dobCol = findColumn(row, "Driver DOB")
  const dobRaw = dobCol ? row[dobCol] : null
  const dobParsed = dobRaw ? parseExcelDate(dobRaw) : null
  let dobStr: string | null = null
  if (dobRaw && String(dobRaw).trim() !== "") {
    if (!dobParsed) {
      errors.push({ row: rowNum, field: "Driver DOB", message: "Invalid date" })
      rowValid = false
    } else {
      dobStr = formatDate(dobParsed)
    }
  }

  const ageCol = findColumn(row, "Driver Age")
  let driverAge: number | null = null
  if (ageCol) {
    const ageRaw = String(row[ageCol] ?? "").trim()
    if (ageRaw) {
      const age = parseInt(ageRaw, 10)
      if (isNaN(age) || age < 16 || age > 120) {
        errors.push({ row: rowNum, field: "Driver Age", message: "Must be a number between 16 and 120" })
        rowValid = false
      } else {
        driverAge = age
      }
    }
  }

  const premiumCol = findColumn(row, "New Premium + VAT Amount")
  let premium: number | null = null
  if (premiumCol) {
    const premiumRaw = String(row[premiumCol] ?? "").trim()
    if (premiumRaw) {
      const parsed = parseFloat(premiumRaw)
      if (isNaN(parsed) || parsed < 0) {
        errors.push({ row: rowNum, field: "New Premium + VAT Amount", message: "Must be a valid positive number" })
        rowValid = false
      } else {
        premium = parsed
      }
    }
  }

  const vehCol = findColumn(row, "Veh Make Model")
  const vehMakeModel = vehCol ? String(row[vehCol] ?? "").trim() : ""

  const quoteCol = findColumn(row, "Quotation No")
  const quotationNo = quoteCol ? String(row[quoteCol] ?? "").trim() : ""

  return {
    rowValid,
    errors,
    values: {
      policy_no: policyNo,
      quotation_no: quotationNo,
      customer_name: customerName,
      mobile_no: mobile,
      policy_expiry_date: expiryDateStr,
      veh_make_model: vehMakeModel,
      driver_age: driverAge,
      driver_dob: dobStr,
      new_premium_vat_amount: premium,
      communication_status: commStatus,
    },
  }
}

export async function parseExcel(formData: FormData): Promise<ParseResult> {
  const profile = await getProfile()
  if (!profile?.company_id) return { error: "No company assigned" }
  if (profile.role !== "company_admin") return { error: "Only company admins can upload" }

  const file = formData.get("file") as File
  if (!file) return { error: "No file provided" }

  const ext = file.name.split(".").pop()?.toLowerCase()
  if (!ext || !["xlsx", "xls"].includes(ext)) return { error: "File must be .xlsx or .xls" }

  const buffer = Buffer.from(await file.arrayBuffer())
  const workbook = XLSX.read(buffer, { type: "buffer" })
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) return { error: "Excel file is empty" }

  const sheet = workbook.Sheets[sheetName]
  const rawRows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, { defval: "" })

  if (rawRows.length === 0) return { error: "No data rows found in the file" }
  if (rawRows.length > 5000) return { error: "File exceeds 5000 rows. Please split into smaller files." }

  const headerKeys = Object.keys(rawRows[0])
  const missingColumns = Object.keys(COLUMN_MAP).filter((col) => {
    const norm = normalizeHeader(col)
    return !headerKeys.some((k) => normalizeHeader(k) === norm)
  })

  if (missingColumns.length > 0) {
    return {
      error: `Missing required columns: ${missingColumns.join(", ")}`,
    }
  }

  const supabase = await createClient()

  const { data: optOutRows } = await supabase
    .from("opt_outs")
    .select("mobile_no")
    .eq("company_id", profile.company_id)

  const optedOutMobiles = new Set(optOutRows?.map((r) => r.mobile_no) ?? [])

  const allErrors: ValidationError[] = []
  let validCount = 0
  const seenPolicyNos = new Set<string>()
  const sample: Record<string, string | undefined>[] = []

  for (let i = 0; i < rawRows.length; i++) {
    const { rowValid, errors, values } = validateRow(rawRows[i], i + 2, seenPolicyNos, null, optedOutMobiles)

    allErrors.push(...errors)

    if (rowValid) {
      validCount++
      if (sample.length < 5) {
        sample.push({
          policy_no: values.policy_no,
          customer_name: values.customer_name,
          mobile_no: values.mobile_no,
          policy_expiry_date: values.policy_expiry_date,
          veh_make_model: values.veh_make_model,
        })
      }
    }
  }

  return {
    preview: {
      validRows: validCount,
      invalidRows: allErrors.length,
      totalRows: rawRows.length,
      errors: allErrors,
      sample,
    },
  }
}

export async function deleteImport(importId: string): Promise<{ success: boolean; error?: string }> {
  const profile = await getProfile()
  if (!profile?.company_id) return { success: false, error: "No company assigned" }
  if (profile.role !== "company_admin") return { success: false, error: "Only company admins can delete imports" }

  const supabase = await createClient()

  const { error: deleteRecordsError } = await supabase
    .from("customer_records")
    .delete()
    .eq("import_id", importId)
    .eq("company_id", profile.company_id)

  if (deleteRecordsError) return { success: false, error: deleteRecordsError.message }

  const { error: deleteImportError } = await supabase
    .from("imports")
    .delete()
    .eq("id", importId)
    .eq("company_id", profile.company_id)

  if (deleteImportError) return { success: false, error: deleteImportError.message }

  revalidatePath("/dashboard")
  return { success: true }
}

export async function confirmImport(formData: FormData): Promise<{ success: boolean; error?: string; importId?: string }> {
  const profile = await getProfile()
  if (!profile?.company_id) return { success: false, error: "No company assigned" }
  if (profile.role !== "company_admin") return { success: false, error: "Only company admins can upload" }

  const supabase = await createClient()

  const fileEntry = formData.get("file")
  if (!fileEntry || typeof fileEntry === "string" || !(fileEntry instanceof File)) {
    return { success: false, error: "Invalid file. Please go back and re-select the file." }
  }
  const file = fileEntry as File

  const buffer = Buffer.from(await file.arrayBuffer())
  const workbook = XLSX.read(buffer, { type: "buffer" })
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) return { success: false, error: "Excel file is empty" }

  const sheet = workbook.Sheets[sheetName]
  const rawRows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, { defval: "" })

  if (rawRows.length === 0) return { success: false, error: "No data rows found in the file" }

  const headerKeys = Object.keys(rawRows[0])
  const missingColumns = Object.keys(COLUMN_MAP).filter((col) => {
    const norm = normalizeHeader(col)
    return !headerKeys.some((k) => normalizeHeader(k) === norm)
  })
  if (missingColumns.length > 0) {
    return { success: false, error: `Missing required columns: ${missingColumns.join(", ")}` }
  }

  const { data: existingRecords, error: fetchError } = await supabase
    .from("customer_records")
    .select("policy_no")
    .eq("company_id", profile.company_id)

  if (fetchError) return { success: false, error: fetchError.message }

  const existingDbPolicyNos = new Set(existingRecords?.map((r) => r.policy_no.toLowerCase()) ?? [])

  const { data: optOutRows } = await supabase
    .from("opt_outs")
    .select("mobile_no")
    .eq("company_id", profile.company_id)

  const optedOutMobiles = new Set(optOutRows?.map((r) => r.mobile_no) ?? [])

  const validRecords: (RowValues & { company_id: string })[] = []
  const importErrors: { row_number: number; field: string; value: string; error_message: string }[] = []
  const seenFilePolicyNos = new Set<string>()
  let validCount = 0

  for (let i = 0; i < rawRows.length; i++) {
    const { rowValid, errors, values } = validateRow(rawRows[i], i + 2, seenFilePolicyNos, existingDbPolicyNos, optedOutMobiles)

    if (!rowValid) {
      for (const e of errors) {
        importErrors.push({
          row_number: e.row,
          field: e.field,
          value: String(rawRows[i][findColumn(rawRows[i], e.field) ?? ""] ?? ""),
          error_message: e.message,
        })
      }
    }

    if (rowValid) {
      validRecords.push({
        ...values,
        company_id: profile.company_id,
      })
      validCount++
    }
  }

  const totalErrors = importErrors.length

  const { data: importRecord, error: importError } = await supabase
    .from("imports")
    .insert({
      company_id: profile.company_id,
      uploaded_by: profile.id,
      file_name: file.name,
      total_rows: rawRows.length,
      valid_rows: validCount,
      invalid_rows: totalErrors,
      status: "completed",
    })
    .select()
    .single()

  if (importError) return { success: false, error: importError.message }

  if (validRecords.length > 0) {
    const recordsWithImportId = validRecords.map((r) => ({
      company_id: r.company_id as string,
      import_id: importRecord.id,
      policy_no: r.policy_no,
      quotation_no: r.quotation_no,
      customer_name: r.customer_name,
      mobile_no: r.mobile_no,
      policy_expiry_date: r.policy_expiry_date,
      veh_make_model: r.veh_make_model,
      driver_age: r.driver_age,
      driver_dob: r.driver_dob,
      new_premium_vat_amount: r.new_premium_vat_amount,
      communication_status: r.communication_status,
    }))

    const { error: insertError } = await supabase
      .from("customer_records")
      .insert(recordsWithImportId)

    if (insertError) return { success: false, error: insertError.message }
  }

  if (importErrors.length > 0) {
    const errorsWithImportId = importErrors.map((e) => ({
      ...e,
      import_id: importRecord.id,
    }))

    const { error: errorsInsertError } = await supabase
      .from("import_errors")
      .insert(errorsWithImportId)

    if (errorsInsertError) return { success: false, error: errorsInsertError.message }
  }

  revalidatePath("/dashboard")
  return { success: true, importId: importRecord.id }
}
