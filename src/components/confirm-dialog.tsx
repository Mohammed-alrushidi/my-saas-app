"use client"

import { useEffect, useCallback } from "react"

type Props = {
  open: boolean
  title: string
  message: string
  cancelLabel?: string
  confirmLabel?: string
  variant?: "default" | "danger"
  onCancel: () => void
  onConfirm: () => void
}

export function ConfirmDialog({
  open,
  title,
  message,
  cancelLabel = "Cancel",
  confirmLabel = "Confirm",
  variant = "default",
  onCancel,
  onConfirm,
}: Props) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel()
    },
    [onCancel]
  )

  useEffect(() => {
    if (!open) return
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [open, handleKeyDown])

  if (!open) return null

  const confirmClass =
    variant === "danger"
      ? "bg-red-600 hover:bg-red-700 text-white"
      : "bg-black hover:bg-gray-800 text-white"

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="mx-4 w-full max-w-md rounded-lg bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-2 text-lg font-bold">{title}</h2>
        <p className="mb-6 text-sm text-gray-600">{message}</p>
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded border px-4 py-2 text-sm font-medium hover:bg-gray-100"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`rounded px-4 py-2 text-sm font-medium ${confirmClass}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
