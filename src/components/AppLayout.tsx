"use client"

import { usePathname } from "next/navigation"
import { Sidebar } from "@/components/Sidebar"

export function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isAuthPage = pathname.startsWith("/auth")
  const isLandingPage = pathname === "/"

  // Landing page and auth pages render without sidebar
  if (isLandingPage || isAuthPage) {
    return <>{children}</>
  }

  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 overflow-auto bg-gray-50 p-6">{children}</main>
    </div>
  )
}
