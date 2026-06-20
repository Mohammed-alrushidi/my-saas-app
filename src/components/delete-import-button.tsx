"use client"

import { deleteImport } from "@/app/dashboard/upload/actions"
import { useRouter } from "next/navigation"
import { useState } from "react"

type Props = {
  importId: string
  fileName: string
}

export function DeleteImportButton({ importId, fileName }: Props) {
  const router = useRouter()
  const [deleting, setDeleting] = useState(false)

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault()
        if (!confirm(`Delete import "${fileName}"? All records from this import will be permanently removed.`)) return
        setDeleting(true)
        const result = await deleteImport(importId)
        if (result.success) {
          router.refresh()
        } else {
          alert(result.error ?? "Failed to delete import")
        }
        setDeleting(false)
      }}
    >
      <button
        type="submit"
        disabled={deleting}
        className="text-xs text-red-600 hover:text-red-800 hover:underline disabled:opacity-50"
      >
        {deleting ? "Deleting..." : "Delete"}
      </button>
    </form>
  )
}
