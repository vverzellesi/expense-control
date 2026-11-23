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
      const isTelegramWebhook = nextUrl.pathname === "/api/telegram/webhook"
      const isTelegramSetup = nextUrl.pathname === "/api/telegram/setup"
      // Pluggy: autenticadas pela própria rota (CRON_SECRET / assinatura do webhook)
      const isPluggyCron = nextUrl.pathname === "/api/cron/pluggy-sync"
      const isPluggyWebhook = nextUrl.pathname === "/webhooks/pluggy"

      // Allow landing page, auth pages, auth API routes, Telegram and Pluggy endpoints without authentication
      if (
        isLandingPage ||
        isOnAuthPage ||
        isApiAuthRoute ||
        isTelegramWebhook ||
        isTelegramSetup ||
        isPluggyCron ||
        isPluggyWebhook
      ) {
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
