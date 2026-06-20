"use client"

import { useState } from "react"
import { signOut } from "@/app/login/actions"
import { ConfirmDialog } from "./confirm-dialog"
import { LogOut } from "lucide-react"

export function SuperAdminLogoutButton() {
  const [showConfirm, setShowConfirm] = useState(false)

  async function handleConfirm() {
    setShowConfirm(false)
    await signOut()
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setShowConfirm(true)}
        className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        aria-label="Sign out"
      >
        <LogOut size={16} aria-hidden="true" />
      </button>

      <ConfirmDialog
        open={showConfirm}
        title="Sign out?"
        message="You will be returned to the login page."
        confirmLabel="Sign out"
        onCancel={() => setShowConfirm(false)}
        onConfirm={handleConfirm}
      />
    </>
  )
}
