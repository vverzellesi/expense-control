import { Upload, Sparkles, TrendingUp } from "lucide-react"

const steps = [
  {
    number: "01",
    icon: Upload,
    title: "Importe seus dados",
    description:
      "Importe seu extrato bancário em CSV ou escaneie notas fiscais com nossa tecnologia OCR.",
  },
  {
    number: "02",
    icon: Sparkles,
    title: "Deixe a mágica acontecer",
    description:
      "Nossas regras inteligentes categorizam automaticamente suas transações.",
  },
  {
    number: "03",
    icon: TrendingUp,
    title: "Acompanhe e economize",
    description:
      "Visualize seus gastos, ajuste orçamentos e alcance suas metas financeiras.",
  },
]

export function HowItWorks() {
  return (
    <section id="como-funciona" className="bg-white py-24">
      <div className="mx-auto max-w-6xl px-6">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight text-gray-900 md:text-4xl">
            Comece em 3 passos simples
          </h2>
          <p className="mt-4 text-lg text-gray-600">
            Do extrato ao controle total em minutos
          </p>
        </div>

        <div className="relative mt-16">
          {/* Connecting line */}
          <div className="absolute left-0 right-0 top-24 hidden h-0.5 bg-gradient-to-r from-emerald-200 via-emerald-400 to-emerald-200 md:block" />

          <div className="grid gap-12 md:grid-cols-3 md:gap-8">
            {steps.map((step, index) => (
              <div key={step.number} className="relative text-center">
                {/* Step number badge */}
                <div className="mx-auto mb-6 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-lg font-bold text-emerald-600">
                  {step.number}
                </div>

                {/* Icon card */}
                <div className="relative mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-50 to-emerald-100 shadow-lg">
                  <step.icon className="h-10 w-10 text-emerald-600" />

                  {/* Connector dot for desktop */}
                  {index < steps.length - 1 && (
                    <div className="absolute -right-4 top-1/2 hidden h-3 w-3 -translate-y-1/2 translate-x-full rounded-full bg-emerald-400 md:block" />
                  )}
                </div>

                <h3 className="text-xl font-semibold text-gray-900">
                  {step.title}
                </h3>
                <p className="mt-2 text-gray-600">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
