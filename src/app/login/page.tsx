import { Notice } from "@/components/ui/notice"
import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { signIn } from "./actions"

export default async function LoginPage(props: { searchParams: Promise<{ error?: string; check_email?: string }> }) {
  const searchParams = await props.searchParams
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
        <div className="text-center">
          <h1 className="text-2xl font-bold">Sign in</h1>
          <p className="text-muted-foreground text-sm">Sign in to your account</p>
        </div>

        {searchParams.error && (
          <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {searchParams.error}
          </div>
        )}

        {searchParams.check_email && (
          <Notice variant="success">
            Check your email for a confirmation link.
          </Notice>
        )}

        <form className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="email" className="text-sm font-medium">Email</label>
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
            <label htmlFor="password" className="text-sm font-medium">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              required
              className="w-full rounded-md border px-3 py-2 text-sm"
              placeholder="Enter your password"
            />
          </div>

          <button
            type="submit"
            formAction={signIn}
            className="w-full rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            Sign in
          </button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          Don&apos;t have an account?{" "}
          <a href="/sign-up" className="font-medium text-black hover:underline">Sign up</a>
        </p>
      </div>
    </div>
  )
}
