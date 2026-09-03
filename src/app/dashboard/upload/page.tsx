"use client"

import { useState, useRef } from "react"
import { useRouter } from "next/navigation"
import { parseExcel, confirmImport, deleteImport, type PreviewData } from "./actions"
import { Notice } from "@/components/ui/notice"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { useLanguage } from "@/components/language-provider"
import type { TranslationKey } from "@/lib/i18n"

type Translate = (key: TranslationKey, values?: Record<string, string | number>) => string

const SAMPLE_COLUMNS = [
  "policy_no",
  "customer_name",
  "mobile_no",
  "policy_expiry_date",
  "veh_make_model",
] as const

const FIELD_LABEL_KEYS: Record<string, TranslationKey> = {
  policy_no: "upload.fieldPolicy",
  "policy no": "upload.fieldPolicy",
  "Policy No": "upload.fieldPolicy",
  "quotation no": "upload.fieldQuotation",
  customer_name: "upload.fieldCustomer",
  "customer name": "upload.fieldCustomer",
  "Customer Name": "upload.fieldCustomer",
  mobile_no: "upload.fieldMobile",
  "mobile no": "upload.fieldMobile",
  "Mobile No": "upload.fieldMobile",
  policy_expiry_date: "upload.fieldExpiry",
  "policy expiry date": "upload.fieldExpiry",
  "Policy Expiry Date": "upload.fieldExpiry",
  veh_make_model: "upload.fieldVehicle",
  "veh make model": "upload.fieldVehicle",
  "Veh Make Model": "upload.fieldVehicle",
  "driver dob": "upload.fieldDob",
  "Driver DOB": "upload.fieldDob",
  "driver age": "upload.fieldAge",
  "Driver Age": "upload.fieldAge",
  "new premium + vat amount": "upload.fieldPremium",
  "New Premium + VAT Amount": "upload.fieldPremium",
}

const VALIDATION_MESSAGE_KEYS: Record<string, TranslationKey> = {
  Required: "upload.validationRequired",
  "Duplicate in file": "upload.validationDuplicateFile",
  "Duplicate policy number": "upload.validationDuplicatePolicy",
  "Max 200 characters": "upload.validationNameLength",
  "Invalid mobile number format": "upload.validationMobile",
  "Invalid date. Use DD/MM/YYYY or YYYY-MM-DD": "upload.validationDate",
  "Must be a number between 16 and 120": "upload.validationAge",
  "Must be a valid positive number": "upload.validationPremium",
}

const ACTION_ERROR_KEYS: Record<string, TranslationKey> = {
  "No company assigned": "upload.errorNoCompany",
  "Only company admins can upload": "upload.errorAdminOnly",
  "Only company admins can delete imports": "upload.errorAdminOnly",
  "No file provided": "upload.errorNoFile",
  "File must be .xlsx or .xls": "upload.errorFileType",
  "Excel file is empty": "upload.errorEmptyFile",
  "No data rows found in the file": "upload.errorNoRows",
  "File exceeds 5000 rows. Please split into smaller files.": "upload.errorTooManyRows",
  "Invalid file. Please go back and re-select the file.": "upload.errorInvalidFile",
}

function translateFieldLabel(field: string, t: Translate): string {
  const key = FIELD_LABEL_KEYS[field]
  return key ? t(key) : field
}

function translateValidationMessage(message: string, t: Translate): string {
  const key = VALIDATION_MESSAGE_KEYS[message]
  return t(key ?? "upload.validationUnknown")
}

function translateUploadError(message: string | undefined, t: Translate): string {
  if (!message) return t("upload.genericError")

  const missingColumnsPrefix = "Missing required columns: "
  if (message.startsWith(missingColumnsPrefix)) {
    const columns = message
      .slice(missingColumnsPrefix.length)
      .split(", ")
      .map((column) => translateFieldLabel(column, t))
      .join(", ")
    return t("upload.errorMissingColumns", { columns })
  }

  const key = ACTION_ERROR_KEYS[message]
  return t(key ?? "upload.genericError")
}

export default function UploadPage() {
  const { t } = useLanguage()
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(false)
  const [preview, setPreview] = useState<PreviewData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<{ total: number; valid: number; invalid: number; importId?: string } | null>(null)
  const [showErrors, setShowErrors] = useState(false)
  const [fileName, setFileName] = useState<string>("")
  const [confirmUndo, setConfirmUndo] = useState(false)
  const fileDataRef = useRef<File | null>(null)

  async function handleUndoImport() {
    if (!success?.importId) return
    setLoading(true)
    try {
      const result = await deleteImport(success.importId)
      if (result.success) {
        setSuccess(null)
        setPreview(null)
        setError(null)
        setFileName("")
        setConfirmUndo(false)
        fileDataRef.current = null
        if (fileRef.current) fileRef.current.value = ""
        router.refresh()
      } else {
        setError(translateUploadError(result.error, t))
      }
    } catch {
      setError(t("upload.genericError"))
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="p-4 sm:p-8">
        <div className="mx-auto max-w-lg rounded-lg border p-8 text-center">
          <div className="mb-4 text-4xl">&#10003;</div>
          <h2 className="mb-2 text-xl font-semibold">{t("upload.importComplete")}</h2>
          <p className="mb-2 text-sm text-muted-foreground">
            {t("upload.importSummary", { valid: success.valid, total: success.total })}
          </p>
          {success.invalid > 0 && (
            <p className="mb-4 text-sm text-amber-600">
              {t("upload.skippedRows", { count: success.invalid })}
            </p>
          )}
          <div className="flex flex-wrap justify-center gap-3">
            <Button onClick={() => router.push("/dashboard")}>
              {t("upload.backDashboard")}
            </Button>
            <Button variant="outline" onClick={() => {
              setSuccess(null)
              setPreview(null)
              setError(null)
              setFileName("")
              fileDataRef.current = null
              if (fileRef.current) fileRef.current.value = ""
            }}>
              {t("upload.uploadAnother")}
            </Button>
            {success.importId && (
              <Button variant="destructive" onClick={() => setConfirmUndo(true)} disabled={loading}>
                {loading ? t("upload.undoing") : t("upload.undoImport")}
              </Button>
            )}
          </div>
          {error && <Notice variant="error" className="mt-4">{error}</Notice>}
          <ConfirmDialog
            open={confirmUndo}
            title={t("upload.undoImport")}
            message={t("upload.undoMessage")}
            confirmLabel={loading ? t("upload.undoing") : t("upload.undoImport")}
            confirmDisabled={loading}
            variant="danger"
            onCancel={() => setConfirmUndo(false)}
            onConfirm={handleUndoImport}
          />
        </div>
      </div>
    )
  }

  if (preview) {
    return (
      <div className="p-4 sm:p-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">{t("upload.previewTitle")}</h1>
          <p className="text-muted-foreground">{t("upload.fileName", { name: fileName })}</p>
        </div>

        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg border p-4 text-center">
            <div className="text-2xl font-bold">{preview.totalRows}</div>
            <div className="text-xs text-muted-foreground">{t("upload.totalRows")}</div>
          </div>
          <div className="rounded-lg border p-4 text-center">
            <div className="text-2xl font-bold text-green-600">{preview.validRows}</div>
            <div className="text-xs text-muted-foreground">{t("upload.validRows")}</div>
          </div>
          <div className="rounded-lg border p-4 text-center">
            <div className="text-2xl font-bold text-red-600">{preview.invalidRows}</div>
            <div className="text-xs text-muted-foreground">{t("upload.invalidRows")}</div>
          </div>
        </div>

        {preview.errors.length > 0 && (
          <div className="mb-6 rounded-lg border">
            <Button variant="ghost" onClick={() => setShowErrors(!showErrors)} className="flex w-full items-center justify-between px-4 py-3 text-start font-medium">
              <span>{t("upload.validationErrors", { count: preview.errors.length })}</span>
              <span>{showErrors ? "\u25B2" : "\u25BC"}</span>
            </Button>
            {showErrors && (
              <div className="max-h-64 overflow-y-auto border-t">
                {preview.errors.map((err, idx) => (
                  <div key={idx} className="border-b px-4 py-2 text-sm last:border-b-0">
                    <span className="font-medium">{t("upload.row", { row: err.row })}</span>{" "}
                    <span className="text-muted-foreground">
                      {translateFieldLabel(err.field, t)} — {translateValidationMessage(err.message, t)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {preview.sample.length > 0 && (
          <div className="mb-6 rounded-lg border">
            <div className="border-b px-4 py-3 font-medium">
              {t("upload.sampleTitle", { count: preview.sample.length })}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50">
                    {SAMPLE_COLUMNS.map((key) => (
                      <th key={key} className="px-4 py-2 text-start font-medium text-muted-foreground">
                        {translateFieldLabel(key, t)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.sample.map((row, idx) => (
                    <tr key={idx} className="border-b last:border-b-0">
                      {SAMPLE_COLUMNS.map((key) => (
                        <td key={key} className="px-4 py-2">
                          {row[key] || "\u2014"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <Button onClick={async () => {
            setLoading(true)
            setError(null)

            if (!fileDataRef.current) {
              setError(t("upload.fileUnavailable"))
              setLoading(false)
              return
            }

            const fd = new FormData()
            fd.append("file", fileDataRef.current)

            try {
              const result = await confirmImport(fd)

              if ("error" in result && result.error) {
                setError(translateUploadError(result.error, t))
              } else if (result.success) {
                setSuccess({
                  total: preview.totalRows,
                  valid: preview.validRows,
                  invalid: preview.invalidRows,
                  importId: (result as { importId?: string }).importId,
                })
              }
            } catch {
              setError(t("upload.genericError"))
            } finally {
              setLoading(false)
            }
          }} disabled={loading}>
            {loading ? t("upload.importing") : t("upload.confirmImport")}
          </Button>

          <Button variant="outline" disabled={loading} onClick={() => {
            setPreview(null)
            setError(null)
            setFileName("")
            setShowErrors(false)
            fileDataRef.current = null
            if (fileRef.current) fileRef.current.value = ""
          }}>
            {t("common.cancel")}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{t("upload.title")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("upload.description")}
        </p>
      </div>

      {error && (
        <Notice variant="error" className="mb-6">{error}</Notice>
      )}

      <div className="mx-auto max-w-lg rounded-lg border p-4 sm:p-8">
        <form
          action={async (formData) => {
            setLoading(true)
            setError(null)
            try {
              const result = await parseExcel(formData)

              if ("error" in result) {
                setError(translateUploadError(result.error, t))
              } else if ("preview" in result) {
                setPreview(result.preview)
                setShowErrors(false)
              }
            } catch {
              setError(t("upload.genericError"))
            } finally {
              setLoading(false)
            }
          }}
        >
          <div className="mb-6">
            <label htmlFor="upload-file" className="mb-2 block text-sm font-medium">
              {t("upload.selectFile")}
            </label>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <label
                htmlFor="upload-file"
                className="inline-flex w-fit cursor-pointer items-center rounded-md bg-black px-3 py-2 text-xs font-medium text-white hover:bg-gray-800"
              >
                {t("upload.chooseFile")}
              </label>
              <span className="min-w-0 truncate text-sm text-muted-foreground">
                {fileName || t("upload.noFileSelected")}
              </span>
            </div>
            <input
              id="upload-file"
              ref={fileRef}
              type="file"
              name="file"
              accept=".xlsx,.xls"
              required
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) {
                  setFileName(f.name)
                  fileDataRef.current = f
                }
              }}
              className="sr-only"
            />
            <p className="mt-2 text-xs text-muted-foreground">{t("upload.requirements")}</p>
          </div>

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? t("upload.parsing") : t("upload.previewImport")}
          </Button>
        </form>
      </div>
    </div>
  )
}
