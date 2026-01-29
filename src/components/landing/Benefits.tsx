import { Clock, Eye, Shield, Building2, Gift, Smartphone } from "lucide-react"

const benefits = [
  {
    icon: Clock,
    title: "Economize Tempo",
    description:
      "Pare de categorizar transações manualmente. Nossas regras inteligentes fazem isso por você.",
  },
  {
    icon: Eye,
    title: "Visão Clara",
    description:
      "Entenda exatamente para onde vai cada centavo do seu dinheiro.",
  },
  {
    icon: Shield,
    title: "Controle Total",
    description:
      "Defina orçamentos, receba alertas e nunca mais estoure o limite.",
  },
  {
    icon: Smartphone,
    title: "Sempre no Seu Bolso",
    description:
      "Totalmente responsivo. Acesse do celular, tablet ou desktop — suas finanças sempre com você.",
  },
  {
    icon: Building2,
    title: "Multi-Banco",
    description:
      "Funciona com C6, Itaú, BTG e outros. Importe de qualquer banco.",
  },
  {
    icon: Gift,
    title: "100% Gratuito",
    description:
      "Sem planos pagos, sem pegadinhas. Todas as funcionalidades liberadas.",
  },
]

export function Benefits() {
  return (
    <section className="bg-gradient-to-b from-gray-50 to-white py-24">
      <div className="mx-auto max-w-6xl px-6">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight text-gray-900 md:text-4xl">
            Por que escolher o MyPocket?
          </h2>
          <p className="mt-4 text-lg text-gray-600">
            Simplicidade e poder em um só lugar
          </p>
        </div>

        <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {benefits.map((benefit) => (
            <div
              key={benefit.title}
              className="flex items-start gap-4 rounded-xl border border-gray-100 bg-white p-6 shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-100 to-emerald-50">
                <benefit.icon className="h-6 w-6 text-emerald-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">{benefit.title}</h3>
                <p className="mt-1 text-sm text-gray-600">
                  {benefit.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
