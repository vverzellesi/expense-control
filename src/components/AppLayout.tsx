"use client"

import { useState, useEffect } from "react"
import { usePathname } from "next/navigation"
import { Sidebar } from "@/components/Sidebar"
import { MobileHeader } from "@/components/MobileHeader"

export function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isAuthPage = pathname.startsWith("/auth")
  const isLandingPage = pathname === "/"
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  // Close mobile menu on route change
  useEffect(() => {
    setIsMobileMenuOpen(false)
  }, [pathname])

  // Landing page and auth pages render without sidebar
  if (isLandingPage || isAuthPage) {
    return <>{children}</>
  }

  return (
    <div className="flex h-screen flex-col md:flex-row overflow-x-hidden">
      {/* Mobile header - only visible on mobile */}
      <MobileHeader onMenuToggle={() => setIsMobileMenuOpen(true)} />

      {/* Sidebar with mobile drawer support */}
      <Sidebar
        isOpen={isMobileMenuOpen}
        onClose={() => setIsMobileMenuOpen(false)}
      />

      <main className="flex-1 overflow-y-auto overflow-x-hidden bg-gray-50 p-4 md:p-6">
        <div className="max-w-full overflow-x-hidden">
          {children}
        </div>
      </main>
    </div>
  )
}
