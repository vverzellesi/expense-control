import type { NextAuthConfig } from "next-auth"

// Edge-compatible config (used by middleware)
// This file should NOT import Prisma or bcrypt (not edge-compatible)
export const authConfig = {
  pages: {
    signIn: "/auth/login",
    error: "/auth/error",
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user
      const isOnAuthPage = nextUrl.pathname.startsWith("/auth")
      const isApiAuthRoute = nextUrl.pathname.startsWith("/api/auth")
      const isLandingPage = nextUrl.pathname === "/"

      // Allow landing page, auth pages, and auth API routes without authentication
      if (isLandingPage || isOnAuthPage || isApiAuthRoute) {
        return true
      }

      // Redirect to login if not authenticated
      if (!isLoggedIn) {
        return false
      }

      return true
    },
  },
  providers: [], // Providers are added in auth.ts
} satisfies NextAuthConfig
