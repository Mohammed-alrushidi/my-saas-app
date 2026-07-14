"use client"

import { useState, useRef } from "react"
import { useRouter } from "next/navigation"
import { parseExcel, confirmImport, deleteImport, type PreviewData } from "./actions"
import { Notice } from "@/components/ui/notice"
import { Button } from "@/components/ui/button"

const COLUMN_LABELS: Record<string, string> = {
  policy_no: "Policy No",
  customer_name: "Customer Name",
  mobile_no: "Mobile No",
  policy_expiry_date: "Expiry Date",
  veh_make_model: "Vehicle",
}

export default function UploadPage() {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(false)
  const [preview, setPreview] = useState<PreviewData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<{ total: number; valid: number; invalid: number; importId?: string } | null>(null)
  const [showErrors, setShowErrors] = useState(false)
  const [fileName, setFileName] = useState<string>("")
  const fileDataRef = useRef<File | null>(null)

  if (success) {
    return (
      <div className="p-8">
        <div className="mx-auto max-w-lg rounded-lg border p-8 text-center">
          <div className="mb-4 text-4xl">&#10003;</div>
          <h2 className="mb-2 text-xl font-semibold">Import complete</h2>
          <p className="mb-2 text-sm text-muted-foreground">
            {success.valid} of {success.total} records imported successfully.
          </p>
          {success.invalid > 0 && (
            <p className="mb-4 text-sm text-amber-600">
              {success.invalid} rows had errors and were skipped.
            </p>
          )}
          <div className="flex gap-3 justify-center">
            <Button onClick={() => router.push("/dashboard")}>
              Back to dashboard
            </Button>
            <Button variant="outline" onClick={() => {
              setSuccess(null)
              setPreview(null)
              setError(null)
              setFileName("")
              if (fileRef.current) fileRef.current.value = ""
            }}>
              Upload another
            </Button>
            {success.importId && (
              <Button variant="destructive" onClick={async () => {
                if (!confirm("Undo this import? All imported records will be permanently deleted.")) return
                setLoading(true)
                const result = await deleteImport(success.importId!)
                if (result.success) {
                  setSuccess(null)
                  setPreview(null)
                  setError(null)
                  setFileName("")
                  if (fileRef.current) fileRef.current.value = ""
                  router.refresh()
                } else {
                  setError(result.error ?? "Failed to undo import")
                }
                setLoading(false)
              }} disabled={loading}>
                {loading ? "Undoing..." : "Undo import"}
              </Button>
            )}
          </div>
        </div>
      </div>
    )
  }

  if (preview) {
    return (
      <div className="p-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Preview import</h1>
          <p className="text-muted-foreground">File: {fileName}</p>
        </div>

        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg border p-4 text-center">
            <div className="text-2xl font-bold">{preview.totalRows}</div>
            <div className="text-xs text-muted-foreground">Total rows</div>
          </div>
          <div className="rounded-lg border p-4 text-center">
            <div className="text-2xl font-bold text-green-600">{preview.validRows}</div>
            <div className="text-xs text-muted-foreground">Valid rows</div>
          </div>
          <div className="rounded-lg border p-4 text-center">
            <div className="text-2xl font-bold text-red-600">{preview.invalidRows}</div>
            <div className="text-xs text-muted-foreground">Invalid rows</div>
          </div>
        </div>

        {preview.errors.length > 0 && (
          <div className="mb-6 rounded-lg border">
            <Button variant="ghost" onClick={() => setShowErrors(!showErrors)} className="flex w-full items-center justify-between px-4 py-3 text-left font-medium">
              <span>Validation errors ({preview.errors.length})</span>
              <span>{showErrors ? "\u25B2" : "\u25BC"}</span>
            </Button>
            {showErrors && (
              <div className="max-h-64 overflow-y-auto border-t">
                {preview.errors.map((err, idx) => (
                  <div key={idx} className="border-b px-4 py-2 text-sm last:border-b-0">
                    <span className="font-medium">Row {err.row}:</span>{" "}
                    <span className="text-muted-foreground">
                      {err.field} — {err.message}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {preview.sample.length > 0 && (
          <div className="mb-6 rounded-lg border">
            <div className="border-b px-4 py-3 font-medium">Sample valid data (first {preview.sample.length} rows)</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50">
                    {Object.keys(COLUMN_LABELS).map((key) => (
                      <th key={key} className="px-4 py-2 text-left font-medium text-muted-foreground">
                        {COLUMN_LABELS[key]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.sample.map((row, idx) => (
                    <tr key={idx} className="border-b last:border-b-0">
                      {Object.keys(COLUMN_LABELS).map((key) => (
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

        <div className="flex gap-3">
          <Button onClick={async () => {
            setLoading(true)
            setError(null)

            if (!fileDataRef.current) {
              setError("File not available. Please go back and re-select the file.")
              setLoading(false)
              return
            }

            const fd = new FormData()
            fd.append("file", fileDataRef.current)

            const result = await confirmImport(fd)
            setLoading(false)

            if ("error" in result && result.error) {
              setError(result.error)
            } else if (result.success) {
              setSuccess({
                total: preview.totalRows,
                valid: preview.validRows,
                invalid: preview.invalidRows,
                importId: (result as { importId?: string }).importId,
              })
            }
          }} disabled={loading}>
            {loading ? "Importing..." : "Confirm import"}
          </Button>

          <Button variant="outline" onClick={() => {
            setPreview(null)
            setError(null)
            setFileName("")
            if (fileRef.current) fileRef.current.value = ""
          }}>
            Cancel
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Upload Excel</h1>
        <p className="text-sm text-muted-foreground">
          Upload a .xlsx or .xls file with your customer records
        </p>
      </div>

      {error && (
        <Notice variant="error" className="mb-6">{error}</Notice>
      )}

      <div className="mx-auto max-w-lg rounded-lg border p-8">
        <form
          action={async (formData) => {
            setLoading(true)
            setError(null)
            const result = await parseExcel(formData)
            setLoading(false)

            if ("error" in result) {
              setError(result.error)
            } else if ("preview" in result) {
              setPreview(result.preview)
            }
          }}
        >
          <div className="mb-6">
            <label className="mb-2 block text-sm font-medium">Select Excel file</label>
            <input
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
              className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-black file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white hover:file:bg-gray-800"
            />
            <p className="mt-1 text-xs text-muted-foreground">Max 5000 rows. Required columns: Policy No, Customer Name, Mobile No, Policy Expiry Date, and more.</p>
          </div>

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Parsing..." : "Preview import"}
          </Button>
        </form>
      </div>
    </div>
  )
}
