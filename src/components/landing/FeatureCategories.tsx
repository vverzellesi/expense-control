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
  Wallet,
  BarChart3,
  ArrowUpRight,
  Users,
  UserPlus,
  Lock,
  ArrowLeftRight,
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
  {
    title: "Investimentos",
    icon: Wallet,
    features: [
      {
        icon: BarChart3,
        title: "Portfólio Completo",
        description: "Acompanhe todos seus investimentos em um só lugar",
      },
      {
        icon: ArrowUpRight,
        title: "Rentabilidade em Tempo Real",
        description: "Veja o retorno de cada aplicação e do portfólio total",
      },
      {
        icon: Target,
        title: "Metas por Investimento",
        description: "Defina objetivos e acompanhe o progresso de cada ativo",
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

        <div className="mt-16 grid gap-8 md:grid-cols-2 lg:grid-cols-4">
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

        {/* Highlighted: Shared Accounts */}
        <div className="mt-16 overflow-hidden rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-emerald-50">
          <div className="px-8 py-10 md:px-12">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-600">
                <Users className="h-6 w-6 text-white" />
              </div>
              <div>
                <span className="inline-block rounded-full bg-emerald-100 px-3 py-0.5 text-xs font-semibold uppercase tracking-wide text-emerald-700">
                  Novo
                </span>
                <h3 className="text-2xl font-bold text-gray-900">
                  Espaço Família
                </h3>
              </div>
            </div>
            <p className="mt-3 max-w-2xl text-gray-600">
              Controle financeiro conjunto para casais e famílias. Cada pessoa mantém sua conta pessoal e compartilha um espaço comum com visibilidade total.
            </p>

            <div className="mt-8 grid gap-6 sm:grid-cols-3">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-emerald-100">
                  <UserPlus className="h-4 w-4 text-emerald-600" />
                </div>
                <div>
                  <h4 className="font-medium text-gray-900">Convide por Email ou Link</h4>
                  <p className="mt-1 text-sm text-gray-600">
                    Adicione membros ao espaço com convites simples e defina permissões por pessoa
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-emerald-100">
                  <ArrowLeftRight className="h-4 w-4 text-emerald-600" />
                </div>
                <div>
                  <h4 className="font-medium text-gray-900">Sincronização Automática</h4>
                  <p className="mt-1 text-sm text-gray-600">
                    Transações pessoais aparecem automaticamente no espaço. Marque como privada para esconder
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-emerald-100">
                  <Lock className="h-4 w-4 text-emerald-600" />
                </div>
                <div>
                  <h4 className="font-medium text-gray-900">3 Níveis de Acesso</h4>
                  <p className="mt-1 text-sm text-gray-600">
                    Admin, Membro e Limitado — controle quem vê e edita cada parte do espaço
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
