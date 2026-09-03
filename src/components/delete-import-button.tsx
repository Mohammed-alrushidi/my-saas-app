"use client"

import { deleteImport } from "@/app/dashboard/upload/actions"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Notice } from "@/components/ui/notice"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { useLanguage } from "@/components/language-provider"

type Props = {
  importId: string
  fileName: string
}

export function DeleteImportButton({ importId, fileName }: Props) {
  const { t } = useLanguage()
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
        setError(result.error === "No company assigned"
          ? t("upload.errorNoCompany")
          : result.error === "Only company admins can delete imports"
            ? t("upload.errorAdminOnly")
            : t("imports.deleteError"))
      }
    } catch {
      setError(t("imports.deleteError"))
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
        {deleting ? t("imports.deleting") : t("imports.delete")}
      </Button>
      {error && <Notice variant="error">{error}</Notice>}
      <ConfirmDialog
        open={confirmOpen}
        title={t("imports.deleteTitle")}
        message={t("imports.deleteMessage", { name: fileName })}
        confirmLabel={deleting ? t("imports.deleting") : t("imports.delete")}
        confirmDisabled={deleting}
        variant="danger"
        onCancel={() => setConfirmOpen(false)}
        onConfirm={handleConfirmDelete}
      />
    </div>
  )
}
