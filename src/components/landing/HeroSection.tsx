import Link from "next/link"
import { Button } from "@/components/ui/button"

export function HeroSection() {
  return (
    <section className="relative overflow-hidden bg-white">
      {/* Subtle background pattern */}
      <div className="absolute inset-0 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:20px_20px] opacity-50" />

      {/* Decorative shapes */}
      <div className="absolute -left-20 top-20 h-72 w-72 rounded-full bg-emerald-100 opacity-40 blur-3xl" />
      <div className="absolute -right-20 bottom-20 h-96 w-96 rounded-full bg-emerald-50 opacity-60 blur-3xl" />

      <div className="relative mx-auto max-w-6xl px-6 py-24 md:py-32">
        <div className="text-center">
          <h1 className="mx-auto max-w-4xl text-4xl font-bold tracking-tight text-gray-900 md:text-5xl lg:text-6xl">
            Suas finanças sob controle,{" "}
            <span className="text-emerald-600">sem complicação</span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-lg text-gray-600 md:text-xl">
            Categorize automaticamente, acompanhe orçamentos e visualize para onde
            vai seu dinheiro — tudo em um só lugar.
          </p>

          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Button
              asChild
              size="lg"
              className="bg-emerald-600 px-8 text-base hover:bg-emerald-700"
            >
              <Link href="/auth/register">Começar Grátis</Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="px-8 text-base"
            >
              <a href="#recursos">Saiba Mais</a>
            </Button>
          </div>
        </div>

        {/* Dashboard screenshot mockup */}
        <div className="relative mt-16 md:mt-24">
          <div className="relative mx-auto max-w-5xl">
            {/* Shadow/glow effect */}
            <div className="absolute -inset-4 rounded-2xl bg-gradient-to-r from-emerald-500/20 to-emerald-600/20 blur-2xl" />

            {/* Screenshot container */}
            <div className="relative overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl">
              {/* Browser chrome mockup */}
              <div className="flex items-center gap-2 border-b border-gray-100 bg-gray-50 px-4 py-3">
                <div className="h-3 w-3 rounded-full bg-red-400" />
                <div className="h-3 w-3 rounded-full bg-yellow-400" />
                <div className="h-3 w-3 rounded-full bg-green-400" />
                <div className="ml-4 flex-1 rounded-md bg-gray-200 px-3 py-1 text-xs text-gray-500">
                  app.financas.com/dashboard
                </div>
              </div>

              {/* Dashboard preview placeholder */}
              <div className="aspect-[16/10] bg-gray-50 p-6">
                <DashboardPreview />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function DashboardPreview() {
  return (
    <div className="flex h-full gap-4">
      {/* Sidebar mockup */}
      <div className="hidden w-48 flex-shrink-0 rounded-lg bg-white p-4 shadow-sm md:block">
        <div className="mb-6 h-6 w-24 rounded bg-gray-200" />
        <div className="space-y-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="h-4 w-4 rounded bg-gray-200" />
              <div className={`h-3 rounded bg-gray-200 ${i === 0 ? "w-20 bg-emerald-200" : "w-16"}`} />
            </div>
          ))}
        </div>
      </div>

      {/* Main content mockup */}
      <div className="flex-1 space-y-4">
        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-lg bg-white p-4 shadow-sm">
            <div className="mb-2 h-3 w-16 rounded bg-gray-200" />
            <div className="h-6 w-24 rounded bg-emerald-200" />
          </div>
          <div className="rounded-lg bg-white p-4 shadow-sm">
            <div className="mb-2 h-3 w-16 rounded bg-gray-200" />
            <div className="h-6 w-24 rounded bg-red-200" />
          </div>
          <div className="rounded-lg bg-white p-4 shadow-sm">
            <div className="mb-2 h-3 w-16 rounded bg-gray-200" />
            <div className="h-6 w-24 rounded bg-blue-200" />
          </div>
        </div>

        {/* Chart mockup */}
        <div className="rounded-lg bg-white p-4 shadow-sm">
          <div className="mb-4 h-4 w-32 rounded bg-gray-200" />
          <div className="flex h-32 items-end gap-2">
            {[40, 65, 45, 80, 55, 70, 50].map((h, i) => (
              <div
                key={i}
                className="flex-1 rounded-t bg-emerald-400"
                style={{ height: `${h}%` }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
