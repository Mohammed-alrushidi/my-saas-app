import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

const variantStyles: Record<string, string> = {
  success: "bg-green-50 text-green-700",
  error: "bg-destructive/10 text-destructive",
  warning: "border border-amber-200 bg-amber-50 text-amber-800",
  info: "bg-blue-50 text-blue-800",
}

interface NoticeProps {
  variant: "success" | "error" | "warning" | "info"
  icon?: LucideIcon
  title?: string
  children: React.ReactNode
  dismissible?: boolean
  onDismiss?: () => void
  className?: string
}

export function Notice({
  variant,
  icon: Icon,
  title,
  children,
  dismissible,
  onDismiss,
  className,
}: NoticeProps) {
  const needsGroup = Icon || title || dismissible

  return (
    <div
      className={cn(
        "rounded-md px-4 py-3 text-sm",
        variantStyles[variant],
        needsGroup && "flex items-start gap-3",
        className,
      )}
    >
      {Icon && <Icon className="mt-0.5 h-4 w-4 shrink-0" />}
      {needsGroup ? (
        <div className="flex-1">
          {title && <h3 className="font-semibold">{title}</h3>}
          {title ? <div className="mt-1">{children}</div> : children}
        </div>
      ) : (
        children
      )}
      {dismissible && onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 rounded p-1 text-xs font-bold hover:bg-muted hover:text-foreground"
          aria-label="Dismiss"
        >
          x
        </button>
      )}
    </div>
  )
}
