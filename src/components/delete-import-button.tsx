"use client"

import { deleteImport } from "@/app/dashboard/upload/actions"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Notice } from "@/components/ui/notice"
import { ConfirmDialog } from "@/components/confirm-dialog"

type Props = {
  importId: string
  fileName: string
}

export function DeleteImportButton({ importId, fileName }: Props) {
  const router = useRouter()
  const [deleting, setDeleting] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleConfirmDelete() {
    setDeleting(true)
    setError(null)
    try {
      const result = await deleteImport(importId)
      if (result.success) {
        setConfirmOpen(false)
        router.refresh()
      } else {
        setError(result.error ?? "Failed to delete import")
      }
    } catch {
      setError("Something went wrong. Please try again.")
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        variant="destructive"
        size="sm"
        onClick={() => setConfirmOpen(true)}
        disabled={deleting}
      >
        {deleting ? "Deleting..." : "Delete"}
      </Button>
      {error && <Notice variant="error">{error}</Notice>}
      <ConfirmDialog
        open={confirmOpen}
        title="Delete import"
        message={`Delete import "${fileName}"? All records from this import will be permanently removed.`}
        confirmLabel={deleting ? "Deleting..." : "Delete"}
        confirmDisabled={deleting}
        variant="danger"
        onCancel={() => setConfirmOpen(false)}
        onConfirm={handleConfirmDelete}
      />
    </div>
  )
}
