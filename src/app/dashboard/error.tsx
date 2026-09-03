"use client"

import { useEffect } from "react"
import { Button } from "@/components/ui/button"
import { useLanguage } from "@/components/language-provider"

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const { t } = useLanguage()
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center gap-3 p-16 text-center">
      <h2 className="text-lg font-semibold">{t("dashboardError.title")}</h2>
      <p className="max-w-md text-sm text-muted-foreground">
        {t("dashboardError.description")}
        {error?.digest ? ` (${t("dashboardError.reference", { digest: error.digest })})` : null}
      </p>
      <Button onClick={reset}>{t("dashboardError.retry")}</Button>
    </div>
  )
}
