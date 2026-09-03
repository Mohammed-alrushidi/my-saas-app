"use client"

import { useState } from "react"
import { CalendarDays } from "lucide-react"
import { sendBirthdayNow } from "./actions"
import { useLanguage } from "@/components/language-provider"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { EmptyState } from "@/components/ui/empty-state"
import { Notice } from "@/components/ui/notice"
import { Button } from "@/components/ui/button"

type BirthdayRow = {
  id: string
  customer_name: string
  policy_no: string
  mobile_no: string
  driver_dob: string | null
  isToday: boolean
}

export function BirthdayList({
  records,
  showToday,
  automationEnabled,
  sendTime,
  canSend,
  templateReady,
}: {
  records: BirthdayRow[]
  showToday: boolean
  automationEnabled: boolean
  sendTime: string
  canSend: boolean
  templateReady: boolean
}) {
  const { t } = useLanguage()
  const [selected, setSelected] = useState<BirthdayRow | null>(null)
  const [sendingId, setSendingId] = useState<string | null>(null)
  const [sentIds, setSentIds] = useState<Set<string>>(new Set())
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null)

  async function confirmSend() {
    if (!selected) return
    setSendingId(selected.id)
    setNotice(null)
    const result = await sendBirthdayNow(selected.id)
    if (result.success) {
      setSentIds((current) => new Set(current).add(selected.id))
      setNotice({ type: "success", text: t("birthdays.sendSuccess") })
    } else {
      setNotice({
        type: "error",
        text: result.state === "duplicate" ? t("birthdays.alreadySent") : t("birthdays.sendBlocked"),
      })
    }
    setSendingId(null)
    setSelected(null)
  }

  if (records.length === 0) {
    return <EmptyState icon={CalendarDays} title={showToday ? t("birthdays.noneToday") : t("birthdays.noneMonth")} />
  }

  return (
    <>
      {notice && (
        <Notice
          variant={notice.type === "success" ? "success" : "error"}
          className="mb-4"
          dismissible
          onDismiss={() => setNotice(null)}
        >
          {notice.text}
        </Notice>
      )}
      <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b bg-muted/40">
              <th className="px-4 py-3 text-start font-medium text-muted-foreground">{t("birthdays.customer")}</th>
              <th className="px-4 py-3 text-start font-medium text-muted-foreground">{t("birthdays.policy")}</th>
              <th className="px-4 py-3 text-start font-medium text-muted-foreground">{t("birthdays.mobile")}</th>
              <th className="px-4 py-3 text-start font-medium text-muted-foreground">{t("birthdays.dob")}</th>
              <th className="px-4 py-3 text-start font-medium text-muted-foreground">{t("birthdays.action")}</th>
            </tr>
          </thead>
          <tbody>
            {records.map((record) => {
              const sent = sentIds.has(record.id)
              return (
                <tr key={record.id} className="border-b last:border-b-0 hover:bg-muted/30">
                  {/* Imported values are intentionally rendered verbatim and never passed to t(). */}
                  <td className="px-4 py-3 font-medium">{record.customer_name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{record.policy_no}</td>
                  <td className="px-4 py-3 text-muted-foreground" dir="ltr">{record.mobile_no}</td>
                  <td className="px-4 py-3" dir="ltr">{record.driver_dob || "—"}</td>
                  <td className="px-4 py-3">
                    {sent ? (
                      <span className="text-sm font-medium text-emerald-700">{t("common.sent")}</span>
                    ) : automationEnabled && record.isToday ? (
                      <span className="text-xs text-blue-700">{t("birthdays.scheduled")} · {sendTime.slice(0, 5)}</span>
                    ) : !record.isToday ? (
                      <span className="text-xs text-muted-foreground">{t("birthdays.notToday")}</span>
                    ) : canSend && !templateReady ? (
                      <Button size="sm" disabled title={t("birthdays.templateRequired")}>
                        {t("birthdays.templateRequired")}
                      </Button>
                    ) : canSend ? (
                      <Button size="sm" onClick={() => setSelected(record)} disabled={sendingId === record.id}>
                        {sendingId === record.id ? t("common.sending") : t("common.sendNow")}
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">{t("birthdays.noPermission")}</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={selected !== null}
        title={t("birthdays.confirmTitle")}
        message={t("birthdays.confirmMessage", { name: selected?.customer_name ?? "" })}
        cancelLabel={t("common.cancel")}
        confirmLabel={sendingId ? t("common.sending") : t("common.sendNow")}
        confirmDisabled={sendingId !== null}
        onCancel={() => setSelected(null)}
        onConfirm={() => void confirmSend()}
      />
    </>
  )
}
