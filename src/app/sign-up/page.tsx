import { redirect } from "next/navigation"

export default function SignUpPage() {
  redirect("/login?error=signup_disabled")
}
