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
            Suas finanças no bolso,{" "}
            <span className="text-emerald-600">sob controle</span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-lg text-gray-600 md:text-xl">
            Categorize automaticamente, acompanhe orçamentos e visualize para onde
            vai seu dinheiro — tudo no seu bolso.
          </p>

          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Button
              asChild
              size="lg"
              className="px-8 text-base"
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
                  mypocketbr.app/dashboard
                </div>
              </div>

              {/* Dashboard preview placeholder */}
              <div className="flex aspect-[16/10] bg-gray-50">
                <DashboardSidebar />
                <div className="flex-1 overflow-hidden p-4">
                  <DashboardPreview />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function DashboardSidebar() {
  const navItems = [
    { name: "Dashboard", active: true, badge: 3 },
    { name: "Transações" },
    { name: "Faturas" },
    { name: "Recorrentes" },
    { name: "Parcelas" },
    { name: "Projeção" },
    { name: "Importar" },
    { name: "Categorias" },
    { name: "Relatórios" },
    { name: "Lixeira" },
  ]

  return (
    <div className="hidden w-40 flex-shrink-0 flex-col border-r border-gray-100 bg-white p-3 md:flex">
      {/* Logo */}
      <div className="mb-4 flex items-center gap-1.5">
        <div className="flex h-5 w-5 items-center justify-center rounded bg-emerald-500">
          <svg className="h-3 w-3 text-white" viewBox="0 0 24 24" fill="currentColor">
            <rect x="3" y="12" width="4" height="9" rx="1" />
            <rect x="10" y="8" width="4" height="13" rx="1" />
            <rect x="17" y="4" width="4" height="17" rx="1" />
          </svg>
        </div>
        <span className="text-sm font-bold text-gray-800">MyPocket</span>
      </div>

      {/* Nav items */}
      <nav className="flex-1 space-y-0.5">
        {navItems.map((item) => (
          <div
            key={item.name}
            className={`flex items-center justify-between rounded-md px-2 py-1.5 text-[10px] ${
              item.active
                ? "bg-emerald-50 font-medium text-emerald-700"
                : "text-gray-600"
            }`}
          >
            <span>{item.name}</span>
            {item.badge && (
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-[8px] font-medium text-white">
                {item.badge}
              </span>
            )}
          </div>
        ))}
      </nav>

      {/* Bottom section */}
      <div className="mt-auto space-y-1 border-t border-gray-100 pt-2">
        <div className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] text-gray-600">
          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
          </svg>
          Configurações
        </div>
        <div className="flex items-center gap-1.5 rounded-md px-2 py-1">
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100">
            <svg className="h-3 w-3 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </div>
          <div className="text-[9px]">
            <div className="font-medium text-gray-800">João Silva</div>
            <div className="text-gray-400">joao@email.com</div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] text-gray-600">
          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
          </svg>
          Sair
        </div>
      </div>
    </div>
  )
}

function DashboardPreview() {
  const barData = [
    { income: 36, expense: 44 },
    { income: 40, expense: 38 },
    { income: 32, expense: 42 },
    { income: 56, expense: 36 },
    { income: 68, expense: 48 },
    { income: 60, expense: 44 },
  ]

  return (
    <div className="flex h-full flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-gray-800">Dashboard</div>
          <div className="text-xs text-gray-500">Janeiro 2026</div>
        </div>
        <div className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-medium text-white">
          + Nova Transação
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg bg-white p-3 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">Receitas</span>
            <svg className="h-3 w-3 text-emerald-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M7 17l5-5 5 5M7 7l5 5 5-5" />
            </svg>
          </div>
          <div className="mt-1 text-sm font-bold text-emerald-600">R$ 8.500,00</div>
          <div className="mt-0.5 text-[10px] text-emerald-600">↗ +0.0% vs mês anterior</div>
        </div>
        <div className="rounded-lg bg-white p-3 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">Despesas</span>
            <svg className="h-3 w-3 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M7 7l5 5 5-5M7 17l5-5 5 5" />
            </svg>
          </div>
          <div className="mt-1 text-sm font-bold text-red-600">R$ 6.563,00</div>
          <div className="mt-0.5 text-[10px] text-red-600">↘ -7.8% vs mês anterior</div>
        </div>
        <div className="rounded-lg bg-white p-3 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">Saldo</span>
            <svg className="h-3 w-3 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <path d="M3 10h18" />
            </svg>
          </div>
          <div className="mt-1 text-sm font-bold text-emerald-600">R$ 1.937,00</div>
          <div className="mt-0.5 text-[10px] text-emerald-600">↗ +40.4% vs mês anterior</div>
        </div>
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-2 gap-3">
        {/* Donut chart */}
        <div className="rounded-lg bg-white p-3 shadow-sm">
          <div className="mb-2 text-xs font-semibold text-gray-800">Despesas por Categoria</div>
          <div className="flex items-center gap-4">
            {/* Donut */}
            <div className="relative h-[72px] w-[72px] flex-shrink-0">
              <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
                <circle cx="18" cy="18" r="12" fill="none" stroke="#8b5cf6" strokeWidth="5" strokeDasharray="30 70" strokeDashoffset="0" />
                <circle cx="18" cy="18" r="12" fill="none" stroke="#f97316" strokeWidth="5" strokeDasharray="22 78" strokeDashoffset="-30" />
                <circle cx="18" cy="18" r="12" fill="none" stroke="#3b82f6" strokeWidth="5" strokeDasharray="18 82" strokeDashoffset="-52" />
                <circle cx="18" cy="18" r="12" fill="none" stroke="#06b6d4" strokeWidth="5" strokeDasharray="12 88" strokeDashoffset="-70" />
                <circle cx="18" cy="18" r="12" fill="none" stroke="#ef4444" strokeWidth="5" strokeDasharray="8 92" strokeDashoffset="-82" />
                <circle cx="18" cy="18" r="12" fill="none" stroke="#ec4899" strokeWidth="5" strokeDasharray="6 94" strokeDashoffset="-90" />
                <circle cx="18" cy="18" r="12" fill="none" stroke="#22c55e" strokeWidth="5" strokeDasharray="4 96" strokeDashoffset="-96" />
              </svg>
            </div>
            {/* Legend */}
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[9px]">
              <div className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-violet-500" />Moradia</div>
              <div className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-orange-500" />Alimentação</div>
              <div className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-500" />Compras</div>
              <div className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-cyan-500" />Transporte</div>
              <div className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-500" />Saúde</div>
              <div className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-pink-500" />Lazer</div>
              <div className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-green-500" />Serviços</div>
            </div>
          </div>
        </div>

        {/* Bar chart */}
        <div className="rounded-lg bg-white p-3 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-800">Últimos 6 Meses</span>
            <div className="flex gap-2 text-[9px]">
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-emerald-500" />Receitas</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-red-500" />Despesas</span>
            </div>
          </div>
          <div className="relative h-[60px]">
            {/* Y axis labels */}
            <div className="absolute -left-1 top-0 flex h-full flex-col justify-between text-[7px] text-gray-400">
              <span>10 mil</span>
              <span>5 mil</span>
              <span>0</span>
            </div>
            {/* Bars */}
            <div className="ml-6 flex h-full items-end gap-2">
              {barData.map((month, i) => (
                <div key={i} className="flex flex-1 items-end justify-center gap-0.5">
                  <div className="w-3 rounded-t bg-emerald-400" style={{ height: month.income }} />
                  <div className="w-3 rounded-t bg-red-400" style={{ height: month.expense }} />
                </div>
              ))}
            </div>
          </div>
          <div className="ml-6 mt-1 flex justify-around text-[8px] text-gray-400">
            <span>ago.</span><span>set.</span><span>out.</span><span>nov.</span><span>dez.</span><span>jan.</span>
          </div>
        </div>
      </div>

      {/* Meta de Economia */}
      <div className="rounded-lg bg-white p-3 shadow-sm">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 6v6l4 2" />
          </svg>
          Meta de Economia
        </div>
        <div className="mt-1 text-sm font-bold text-emerald-600">R$ 1.937,00</div>
        <div className="mt-0.5 text-[10px] text-gray-500">de R$ 2.000,00 meta</div>
        <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-gray-100">
          <div className="h-full w-[97%] rounded-full bg-emerald-500" />
        </div>
        <div className="mt-0.5 text-[10px] text-gray-500">97% da meta</div>
      </div>

      {/* Budget alerts preview */}
      <div className="rounded-lg border border-red-100 bg-red-50/50 p-3">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-red-600">
          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          Alertas de Orçamento
        </div>
        <div className="mt-2 space-y-1.5">
          <div className="flex items-center justify-between text-[10px]">
            <div className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
              <span className="text-gray-700">Compras</span>
            </div>
            <span className="font-medium text-red-600">127%</span>
          </div>
          <div className="h-1 w-full overflow-hidden rounded-full bg-gray-200">
            <div className="h-full w-full rounded-full bg-red-500" />
          </div>
          <div className="flex items-center justify-between text-[10px]">
            <div className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />
              <span className="text-gray-700">Alimentação</span>
            </div>
            <span className="font-medium text-emerald-600">82%</span>
          </div>
          <div className="h-1 w-full overflow-hidden rounded-full bg-gray-200">
            <div className="h-full w-[82%] rounded-full bg-emerald-500" />
          </div>
        </div>
      </div>
    </div>
  )
}
