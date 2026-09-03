import { Notice } from "@/components/ui/notice"
import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { signIn } from "./actions"
import { LanguageSelector } from "@/components/language-selector"
import { translate } from "@/lib/i18n"
import { getRequestLocale } from "@/lib/i18n/server"

export default async function LoginPage(props: { searchParams: Promise<{ error?: string; check_email?: string }> }) {
  const searchParams = await props.searchParams
  const locale = await getRequestLocale()
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key)
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    const profile = await supabase
      .from("profiles")
      .select("id")
      .eq("id", user.id)
      .single()
      .then((r) => r.data)

    if (profile) {
      redirect("/")
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex justify-end">
          <LanguageSelector compact />
        </div>
        <div className="text-center">
          <h1 className="text-2xl font-bold">{t("auth.signIn")}</h1>
          <p className="text-muted-foreground text-sm">{t("auth.signInDescription")}</p>
        </div>

        {searchParams.error && (
          <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {searchParams.error}
          </div>
        )}

        {searchParams.check_email && (
          <Notice variant="success">
            {t("auth.checkEmail")}
          </Notice>
        )}

        <form className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="email" className="text-sm font-medium">{t("auth.email")}</label>
            <input
              id="email"
              name="email"
              type="email"
              required
              className="w-full rounded-md border px-3 py-2 text-sm"
              placeholder="you@example.com"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="password" className="text-sm font-medium">{t("auth.password")}</label>
            <input
              id="password"
              name="password"
              type="password"
              required
              className="w-full rounded-md border px-3 py-2 text-sm"
              placeholder={t("auth.passwordPlaceholder")}
            />
          </div>

          <button
            type="submit"
            formAction={signIn}
            className="w-full rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            {t("auth.signIn")}
          </button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          {t("auth.noAccount")}{" "}
          <a href="/sign-up" className="font-medium text-black hover:underline">{t("auth.signUp")}</a>
        </p>
      </div>
    </div>
  )
}
