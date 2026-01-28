import Link from "next/link"
import { Button } from "@/components/ui/button"

export function FinalCTA() {
  return (
    <section className="relative overflow-hidden bg-white py-24">
      {/* Decorative gradient */}
      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-emerald-50/50 to-transparent" />

      <div className="relative mx-auto max-w-4xl px-6 text-center">
        <h2 className="text-3xl font-bold tracking-tight text-gray-900 md:text-4xl">
          Pronto para organizar suas finanças?
        </h2>
        <p className="mt-4 text-lg text-gray-600">
          Crie sua conta gratuita e comece a ter controle do seu dinheiro hoje.
        </p>

        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Button variant="outline" size="lg" asChild className="px-8 text-base">
            <Link href="/auth/login">Entrar</Link>
          </Button>
          <Button
            size="lg"
            asChild
            className="px-8 text-base"
          >
            <Link href="/auth/register">Criar Conta</Link>
          </Button>
        </div>
      </div>
    </section>
  )
}
