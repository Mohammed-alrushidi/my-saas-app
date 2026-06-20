"use client"

import { useState } from "react"
import { toggleCompanyStatus } from "@/app/super-admin/companies/actions"
import { ConfirmDialog } from "./confirm-dialog"

type Props = {
  companyId: string
  isActive: boolean
}

export function CompanyToggleButton({ companyId, isActive }: Props) {
  const [showConfirm, setShowConfirm] = useState(false)

  const label = isActive ? "Deactivate" : "Activate"

  async function handleConfirm() {
    setShowConfirm(false)
    const formData = new FormData()
    formData.append("company_id", companyId)
    formData.append("is_active", String(!isActive))
    await toggleCompanyStatus(formData)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setShowConfirm(true)}
        className={`rounded-md px-3 py-1.5 text-xs font-medium ${
          isActive
            ? "bg-red-50 text-red-600 hover:bg-red-100"
            : "bg-green-50 text-green-600 hover:bg-green-100"
        }`}
      >
        {label}
      </button>

      <ConfirmDialog
        open={showConfirm}
        title={isActive ? "Deactivate company?" : "Activate company?"}
        message={
          isActive
            ? "This will temporarily disable this company from using the platform. Existing data will not be deleted."
            : "This will allow this company to use the platform again."
        }
        confirmLabel={label}
        variant={isActive ? "danger" : "default"}
        onCancel={() => setShowConfirm(false)}
        onConfirm={handleConfirm}
      />
    </>
  )
}
