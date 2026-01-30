import {
  Sparkles,
  LayoutDashboard,
  FileUp,
  PlusCircle,
  Repeat,
  Target,
  Wand2,
  PiggyBank,
  TrendingUp,
  type LucideIcon,
} from "lucide-react"

export interface Slide {
  icon: LucideIcon
  title: string
  description: string
}

export const slides: Slide[] = [
  {
    icon: Sparkles,
    title: "Bem-vindo ao MyPocket!",
    description:
      "Seu assistente pessoal de finanças. Vamos fazer um tour rápido pelas principais funcionalidades.",
  },
  {
    icon: LayoutDashboard,
    title: "Seu Dashboard",
    description:
      "Aqui você vê o resumo completo: receitas, despesas, saldo e gráficos de evolução mensal.",
  },
  {
    icon: FileUp,
    title: "Importar Faturas",
    description:
      "Importe extratos CSV do seu banco (C6, Itaú, BTG) e categorize dezenas de transações de uma vez.",
  },
  {
    icon: PlusCircle,
    title: "Cadastrar Transações",
    description:
      "Adicione receitas e despesas manualmente com categoria, data e descrição.",
  },
  {
    icon: Repeat,
    title: "Despesas Recorrentes",
    description:
      "Marque contas fixas como aluguel e assinaturas. Elas serão geradas automaticamente todo mês.",
  },
  {
    icon: Target,
    title: "Orçamentos por Categoria",
    description:
      "Defina limites de gastos por categoria e receba alertas quando estiver perto de estourar.",
  },
  {
    icon: Wand2,
    title: "Categorização Automática",
    description:
      "Crie regras para categorizar transações automaticamente baseado em palavras-chave.",
  },
  {
    icon: PiggyBank,
    title: "Meta de Economia",
    description:
      "Defina quanto quer economizar por mês e acompanhe seu progresso no dashboard.",
  },
  {
    icon: TrendingUp,
    title: "Acompanhe seus Investimentos",
    description:
      "Cadastre seus investimentos, registre aportes e resgates, e acompanhe a rentabilidade de cada ativo.",
  },
]
