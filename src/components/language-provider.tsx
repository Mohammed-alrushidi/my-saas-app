"use client"

import { createContext, useContext, useMemo, type ReactNode } from "react"
import {
  directionFor,
  translate,
  type Direction,
  type Locale,
  type TranslationKey,
} from "@/lib/i18n"

type LanguageContextValue = {
  locale: Locale
  direction: Direction
  t: (key: TranslationKey, values?: Record<string, string | number>) => string
}

const LanguageContext = createContext<LanguageContextValue | null>(null)

export function LanguageProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  const value = useMemo<LanguageContextValue>(() => ({
    locale,
    direction: directionFor(locale),
    t: (key, values) => translate(locale, key, values),
  }), [locale])

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export function useLanguage(): LanguageContextValue {
  const value = useContext(LanguageContext)
  if (!value) throw new Error("useLanguage must be used inside LanguageProvider")
  return value
}
