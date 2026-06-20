import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  const { data: { user } } = await supabase.auth.getUser()

  const publicPaths = ["/login", "/sign-up", "/auth", "/api"]
  const isPublicPath = publicPaths.some((p) =>
    request.nextUrl.pathname.startsWith(p),
  )

  if (!user) {
    if (!isPublicPath && request.nextUrl.pathname !== "/") {
      const url = request.nextUrl.clone()
      url.pathname = "/login"
      return NextResponse.redirect(url)
    }
    return supabaseResponse
  }

  const profile = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", user.id)
    .single()
    .then((r) => r.data)

  if (!profile) {
    if (!request.nextUrl.pathname.startsWith("/login")) {
      const url = request.nextUrl.clone()
      url.pathname = "/login"
      url.searchParams.set("error", "profile_missing")
      return NextResponse.redirect(url)
    }
    return supabaseResponse
  }

  if (!profile.is_active) {
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    url.searchParams.set("error", "deactivated")
    return NextResponse.redirect(url)
  }

  if (isPublicPath || request.nextUrl.pathname === "/") {
    if (profile) {
      if (profile.role === "super_admin" && !request.nextUrl.pathname.startsWith("/super-admin")) {
        const url = request.nextUrl.clone()
        url.pathname = "/super-admin/companies"
        return NextResponse.redirect(url)
      }
      if (profile.role === "company_admin" && !request.nextUrl.pathname.startsWith("/dashboard")) {
        const url = request.nextUrl.clone()
        url.pathname = "/dashboard"
        return NextResponse.redirect(url)
      }
      if (profile.role === "staff" && !request.nextUrl.pathname.startsWith("/dashboard")) {
        const url = request.nextUrl.clone()
        url.pathname = "/dashboard"
        return NextResponse.redirect(url)
      }
    }
  }

  return supabaseResponse
}
