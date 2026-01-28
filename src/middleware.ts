import NextAuth from "next-auth"
import { authConfig } from "./auth.config"

export const { auth: middleware } = NextAuth(authConfig)

export const config = {
  // Protect all routes except:
  // - Static files (_next/static, _next/image, favicon.ico)
  // - Public assets
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
}
