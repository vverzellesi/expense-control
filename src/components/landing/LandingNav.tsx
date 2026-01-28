"use client"

import Link from "next/link"
import { useSession } from "next-auth/react"
import { Button } from "@/components/ui/button"

export function LandingNav() {
  const { data: session } = useSession()

  return (
    <header className="sticky top-0 z-50 w-full border-b border-gray-100 bg-white/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="text-xl font-semibold text-gray-900">
          MyPocket
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          <a
            href="#recursos"
            className="text-sm text-gray-600 transition-colors hover:text-gray-900"
          >
            Recursos
          </a>
          <a
            href="#como-funciona"
            className="text-sm text-gray-600 transition-colors hover:text-gray-900"
          >
            Como Funciona
          </a>
          <a
            href="#faq"
            className="text-sm text-gray-600 transition-colors hover:text-gray-900"
          >
            FAQ
          </a>
        </nav>

        <div className="flex items-center gap-3">
          {session?.user ? (
            <Button asChild className="bg-emerald-600 hover:bg-emerald-700">
              <Link href="/dashboard">Ir para Dashboard</Link>
            </Button>
          ) : (
            <>
              <Button variant="ghost" asChild>
                <Link href="/auth/login">Entrar</Link>
              </Button>
              <Button asChild className="bg-emerald-600 hover:bg-emerald-700">
                <Link href="/auth/register">Começar Grátis</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
