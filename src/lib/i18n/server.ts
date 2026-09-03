import "server-only"

import { cookies } from "next/headers"
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, type Locale } from "./index"

export async function getRequestLocale(): Promise<Locale> {
  const value = (await cookies()).get(LOCALE_COOKIE)?.value
  return isLocale(value) ? value : DEFAULT_LOCALE
}

export async function setLocaleCookie(locale: Locale): Promise<void> {
  ;(await cookies()).set(LOCALE_COOKIE, locale, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  })
}
