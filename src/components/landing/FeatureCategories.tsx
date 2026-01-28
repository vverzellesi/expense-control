import {
  Brain,
  Zap,
  AlertTriangle,
  Target,
  RefreshCw,
  PiggyBank,
  PieChart,
  TrendingUp,
  Upload,
} from "lucide-react"

const categories = [
  {
    title: "Inteligência",
    icon: Brain,
    features: [
      {
        icon: Zap,
        title: "Categorização Automática",
        description: "Regras inteligentes que classificam suas transações automaticamente",
      },
      {
        icon: RefreshCw,
        title: "Detecção de Parcelas",
        description: "Reconhece pagamentos parcelados e organiza por você",
      },
      {
        icon: AlertTriangle,
        title: "Alertas de Gastos Incomuns",
        description: "Avisa quando uma transação foge do padrão",
      },
    ],
  },
  {
    title: "Controle",
    icon: Target,
    features: [
      {
        icon: Target,
        title: "Orçamentos por Categoria",
        description: "Defina limites e acompanhe em tempo real",
      },
      {
        icon: RefreshCw,
        title: "Despesas Fixas e Recorrentes",
        description: "Geração automática de contas mensais",
      },
      {
        icon: PiggyBank,
        title: "Metas de Economia",
        description: "Estabeleça objetivos e visualize seu progresso",
      },
    ],
  },
  {
    title: "Visualização",
    icon: PieChart,
    features: [
      {
        icon: PieChart,
        title: "Gráficos Interativos",
        description: "Veja para onde vai seu dinheiro com gráficos de pizza e barras",
      },
      {
        icon: TrendingUp,
        title: "Projeções Futuras",
        description: "Antecipe gastos e planeje os próximos meses",
      },
      {
        icon: Upload,
        title: "Importação Multi-Banco",
        description: "Importe extratos de C6, Itaú, BTG e outros",
      },
    ],
  },
]

export function FeatureCategories() {
  return (
    <section id="recursos" className="bg-gray-50 py-24">
      <div className="mx-auto max-w-6xl px-6">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight text-gray-900 md:text-4xl">
            Tudo que você precisa para organizar suas finanças
          </h2>
          <p className="mt-4 text-lg text-gray-600">
            Ferramentas poderosas, interface simples
          </p>
        </div>

        <div className="mt-16 grid gap-8 md:grid-cols-3">
          {categories.map((category) => (
            <div key={category.title} className="space-y-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100">
                  <category.icon className="h-5 w-5 text-emerald-600" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900">
                  {category.title}
                </h3>
              </div>

              <div className="space-y-4">
                {category.features.map((feature) => (
                  <div
                    key={feature.title}
                    className="rounded-lg border border-gray-200 bg-white p-4 transition-shadow hover:shadow-md"
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-emerald-50 to-emerald-100">
                        <feature.icon className="h-4 w-4 text-emerald-600" />
                      </div>
                      <div>
                        <h4 className="font-medium text-gray-900">
                          {feature.title}
                        </h4>
                        <p className="mt-1 text-sm text-gray-600">
                          {feature.description}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
