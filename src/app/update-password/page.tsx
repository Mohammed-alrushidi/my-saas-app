"use client"

import { Notice } from "@/components/ui/notice"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@supabase/ssr"

type PageState = "verifying" | "expired" | "missing_token" | "form" | "success"

export default function UpdatePasswordPage() {
  const router = useRouter()
  const [state, setState] = useState<PageState>("verifying")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [error, setError] = useState("")
  const [errorDescription, setErrorDescription] = useState("")

  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, "")
    const params = new URLSearchParams(hash)
    const accessToken = params.get("access_token")
    const refreshToken = params.get("refresh_token")
    const err = params.get("error")
    const errorCode = params.get("error_code")
    const errorDesc = params.get("error_description")

    if (err || errorCode) {
      setError(err || errorCode || "invalid_link")
      setErrorDescription(
        errorDesc || "This password setup link has expired or is invalid. Password setup links are one-time use and expire after 24 hours.",
      )
      setState("expired")
      return
    }

    if (!accessToken || !refreshToken) {
      setState("missing_token")
      return
    }

    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    )

    supabase.auth
      .setSession({ access_token: accessToken, refresh_token: refreshToken })
      .then(({ data, error: sessionError }) => {
        if (sessionError || !data.session) {
          setErrorDescription(
            sessionError?.message ||
              "Could not verify your link. It may have expired or already been used.",
          )
          setState("expired")
          return
        }
        setEmail(data.session.user.email ?? "")
        setState("form")
      })
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")

    if (!password || password.length < 6) {
      setError("Password must be at least 6 characters.")
      return
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.")
      return
    }

    setIsSubmitting(true)

    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    )

    const { error: updateError } = await supabase.auth.updateUser({ password })

    if (updateError) {
      setError(updateError.message)
      setState("form")
      setIsSubmitting(false)
      return
    }

    setState("success")
    setTimeout(() => {
      router.push("/login?password_set=true")
    }, 3000)
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Set your password</h1>
          <p className="text-muted-foreground text-sm">Choose a strong password for your account</p>
        </div>

        {state === "verifying" && (
          <div className="rounded-md bg-muted px-4 py-3 text-sm text-muted-foreground text-center">
            Verifying your link...
          </div>
        )}

        {state === "expired" && (
          <div className="space-y-4">
            <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {errorDescription}
            </div>
            <a
              href="/login"
              className="block w-full rounded-md bg-black px-4 py-2 text-sm font-medium text-white text-center hover:bg-gray-800"
            >
              Return to sign in
            </a>
          </div>
        )}

        {state === "missing_token" && (
          <div className="space-y-4">
            <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
              No recovery token found. If you clicked a link from your email, try opening it in a new browser.
            </div>
            <a
              href="/login"
              className="block w-full rounded-md bg-black px-4 py-2 text-sm font-medium text-white text-center hover:bg-gray-800"
            >
              Return to sign in
            </a>
          </div>
        )}

        {state === "form" && (
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium">Email</label>
              <input
                id="email"
                type="email"
                value={email}
                readOnly
                className="w-full rounded-md border px-3 py-2 text-sm bg-muted cursor-not-allowed"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium">New password</label>
              <input
                id="password"
                name="password"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-md border px-3 py-2 text-sm"
                placeholder="At least 6 characters"
                disabled={isSubmitting}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="confirm-password" className="text-sm font-medium">Confirm password</label>
              <input
                id="confirm-password"
                name="confirm-password"
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full rounded-md border px-3 py-2 text-sm"
                placeholder="Repeat your password"
                disabled={isSubmitting}
              />
            </div>

            {error && (
              <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? "Setting password..." : "Set password"}
            </button>
          </form>
        )}

        {state === "success" && (
          <div className="space-y-4">
            <Notice variant="success">
              Password set successfully! You can now sign in.
            </Notice>
            <a
              href="/login"
              className="block w-full rounded-md bg-black px-4 py-2 text-sm font-medium text-white text-center hover:bg-gray-800"
            >
              Sign in
            </a>
          </div>
        )}
      </div>
    </div>
  )
}
