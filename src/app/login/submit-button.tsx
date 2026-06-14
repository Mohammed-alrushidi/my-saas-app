"use client"

import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"

export function SubmitButton() {
  const router = useRouter()

  async function handleSubmit(formData: FormData) {
    const email = formData.get("email") as string
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}/auth/callback` },
    })

    if (!error) {
      router.push("/login?check_email=true")
    }
  }

  return (
    <button
      type="submit"
      formAction={handleSubmit}
      className="w-full rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
    >
      Send magic link
    </button>
  )
}
