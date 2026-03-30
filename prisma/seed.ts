import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const defaultCategories = [
  { name: "Moradia", color: "#3B82F6", icon: "home", flexibilityType: "ESSENTIAL" as const },
  { name: "Alimentação", color: "#F97316", icon: "utensils", flexibilityType: "VARIABLE" as const },
  { name: "Mercado", color: "#22C55E", icon: "shopping-cart", flexibilityType: "VARIABLE" as const },
  { name: "Transporte", color: "#8B5CF6", icon: "car", flexibilityType: "NEGOTIABLE" as const },
  { name: "Saúde", color: "#EF4444", icon: "heart", flexibilityType: "ESSENTIAL" as const },
  { name: "Lazer", color: "#EC4899", icon: "gamepad", flexibilityType: "VARIABLE" as const },
  { name: "Educação", color: "#6366F1", icon: "book", flexibilityType: "NEGOTIABLE" as const },
  { name: "Serviços", color: "#14B8A6", icon: "smartphone", flexibilityType: "NEGOTIABLE" as const },
  { name: "Compras", color: "#F59E0B", icon: "shopping-bag", flexibilityType: "VARIABLE" as const },
  { name: "Salário", color: "#10B981", icon: "wallet", flexibilityType: null },
  { name: "Investimentos", color: "#06B6D4", icon: "trending-up", flexibilityType: null },
  { name: "Outros", color: "#6B7280", icon: "help-circle", flexibilityType: "VARIABLE" as const },
];

const defaultRules = [
  { keyword: "UBER", category: "Transporte" },
  { keyword: "99", category: "Transporte" },
  { keyword: "CABIFY", category: "Transporte" },
  { keyword: "IFOOD", category: "Alimentação" },
  { keyword: "RAPPI", category: "Alimentação" },
  { keyword: "AIQFOME", category: "Alimentação" },
  { keyword: "ZDELIVERY", category: "Alimentação" },
  { keyword: "MERCADO", category: "Mercado" },
  { keyword: "SUPERMERCADO", category: "Mercado" },
  { keyword: "CARREFOUR", category: "Mercado" },
  { keyword: "EXTRA", category: "Mercado" },
  { keyword: "PAO DE ACUCAR", category: "Mercado" },
  { keyword: "ASSAI", category: "Mercado" },
  { keyword: "ATACADAO", category: "Mercado" },
  { keyword: "NETFLIX", category: "Serviços" },
  { keyword: "SPOTIFY", category: "Serviços" },
  { keyword: "AMAZON PRIME", category: "Serviços" },
  { keyword: "DISNEY", category: "Serviços" },
  { keyword: "HBO", category: "Serviços" },
  { keyword: "YOUTUBE", category: "Serviços" },
  { keyword: "FARMACIA", category: "Saúde" },
  { keyword: "DROGARIA", category: "Saúde" },
  { keyword: "DROGASIL", category: "Saúde" },
  { keyword: "DROGA RAIA", category: "Saúde" },
  { keyword: "PANVEL", category: "Saúde" },
  { keyword: "ALUGUEL", category: "Moradia" },
  { keyword: "CONDOMINIO", category: "Moradia" },
  { keyword: "IPTU", category: "Moradia" },
  { keyword: "ENERGIA", category: "Moradia" },
  { keyword: "AGUA", category: "Moradia" },
  { keyword: "GAS", category: "Moradia" },
  { keyword: "INTERNET", category: "Moradia" },
  { keyword: "RESTAURANTE", category: "Alimentação" },
  { keyword: "LANCHONETE", category: "Alimentação" },
  { keyword: "PIZZARIA", category: "Alimentação" },
  { keyword: "PADARIA", category: "Alimentação" },
  { keyword: "SHOPPING", category: "Compras" },
  { keyword: "LOJAS", category: "Compras" },
  { keyword: "RENNER", category: "Compras" },
  { keyword: "C&A", category: "Compras" },
  { keyword: "RIACHUELO", category: "Compras" },
  { keyword: "CINEMA", category: "Lazer" },
  { keyword: "TEATRO", category: "Lazer" },
  { keyword: "SHOW", category: "Lazer" },
  { keyword: "INGRESSO", category: "Lazer" },
  { keyword: "CURSO", category: "Educação" },
  { keyword: "ESCOLA", category: "Educação" },
  { keyword: "FACULDADE", category: "Educação" },
  { keyword: "LIVRO", category: "Educação" },
  { keyword: "AMAZON", category: "Compras" },
  { keyword: "MERCADO LIVRE", category: "Compras" },
  { keyword: "MAGAZINE LUIZA", category: "Compras" },
  { keyword: "CASAS BAHIA", category: "Compras" },
  // Extratos bancarios
  { keyword: "TARIFA", category: "Serviços" },
  { keyword: "IOF", category: "Serviços" },
  { keyword: "ANUIDADE", category: "Serviços" },
  { keyword: "TAXA BANCARIA", category: "Serviços" },
  { keyword: "TED", category: "Outros" },
  { keyword: "DOC", category: "Outros" },
  { keyword: "SAQUE", category: "Outros" },
  { keyword: "DEPOSITO", category: "Outros" },
  { keyword: "RENDIMENTO", category: "Investimentos" },
  { keyword: "APLICACAO", category: "Investimentos" },
  { keyword: "RESGATE", category: "Investimentos" },
  { keyword: "CDB", category: "Investimentos" },
  { keyword: "LCI", category: "Investimentos" },
  { keyword: "LCA", category: "Investimentos" },
  { keyword: "POUPANCA", category: "Investimentos" },
];

const defaultOrigins = [
  // Cartões de crédito
  { name: "Cartão C6", type: "CREDIT_CARD" as const },
  { name: "Cartão Itaú", type: "CREDIT_CARD" as const },
  { name: "Cartão BTG", type: "CREDIT_CARD" as const },
  { name: "Cartão Nubank", type: "CREDIT_CARD" as const },
  // Formas de pagamento
  { name: "PIX", type: "PIX" as const },
  { name: "Transferência", type: "OTHER" as const },
  { name: "Dinheiro", type: "OTHER" as const },
  { name: "Boleto", type: "OTHER" as const },
  { name: "Débito Automático", type: "DEBIT" as const },
  // Extratos bancários
  { name: "Extrato C6", type: "OTHER" as const },
  { name: "Extrato Itaú", type: "OTHER" as const },
  { name: "Extrato BTG", type: "OTHER" as const },
  { name: "Extrato Nubank", type: "OTHER" as const },
  { name: "Extrato Bradesco", type: "OTHER" as const },
  { name: "Extrato Santander", type: "OTHER" as const },
  { name: "Extrato BB", type: "OTHER" as const },
  { name: "Extrato Caixa", type: "OTHER" as const },
  { name: "Extrato Bancário", type: "OTHER" as const },
];

const defaultInvestmentCategories = [
  { name: "Renda Fixa", color: "#3B82F6", icon: "landmark" },
  { name: "Renda Variável", color: "#8B5CF6", icon: "trending-up" },
  { name: "Cripto", color: "#F97316", icon: "bitcoin" },
  { name: "Previdência", color: "#10B981", icon: "shield" },
];

async function main() {
  console.log("Seeding database...");

  // Create categories (without userId for seed data - these are global defaults)
  const categoryMap = new Map<string, string>();

  for (const cat of defaultCategories) {
    // Use findFirst since unique constraint now includes userId
    const existing = await prisma.category.findFirst({
      where: { name: cat.name, userId: null },
    });

    if (existing) {
      categoryMap.set(cat.name, existing.id);
      console.log(`Category "${cat.name}" already exists`);
    } else {
      const created = await prisma.category.create({
        data: cat,
      });
      categoryMap.set(cat.name, created.id);
      console.log(`Created category: ${cat.name}`);
    }
  }

  // Update existing categories with flexibilityType if not set
  const categoryDefaults: Record<string, string> = {
    "Moradia": "ESSENTIAL", "Saúde": "ESSENTIAL",
    "Transporte": "NEGOTIABLE", "Educação": "NEGOTIABLE", "Serviços": "NEGOTIABLE",
    "Alimentação": "VARIABLE", "Mercado": "VARIABLE", "Lazer": "VARIABLE",
    "Compras": "VARIABLE", "Outros": "VARIABLE",
  };

  for (const [name, type] of Object.entries(categoryDefaults)) {
    await prisma.category.updateMany({
      where: { name, flexibilityType: null },
      data: { flexibilityType: type as "ESSENTIAL" | "NEGOTIABLE" | "VARIABLE" },
    });
  }
  console.log("Updated existing categories with flexibilityType");

  // Create rules (without userId for seed data)
  for (const rule of defaultRules) {
    const categoryId = categoryMap.get(rule.category);
    if (!categoryId) {
      console.log(`Category not found for rule: ${rule.keyword}`);
      continue;
    }

    const existing = await prisma.categoryRule.findFirst({
      where: {
        keyword: rule.keyword,
        categoryId,
        userId: null,
      },
    });

    if (!existing) {
      await prisma.categoryRule.create({
        data: {
          keyword: rule.keyword,
          categoryId,
        },
      });
      console.log(`Created rule: ${rule.keyword} -> ${rule.category}`);
    }
  }

  // Create origins (without userId for seed data)
  for (const origin of defaultOrigins) {
    // Use findFirst since unique constraint now includes userId
    const existing = await prisma.origin.findFirst({
      where: { name: origin.name, userId: null },
    });

    if (!existing) {
      await prisma.origin.create({
        data: origin,
      });
      console.log(`Created origin: ${origin.name}`);
    }
  }

  // Create investment categories (default global categories)
  for (const cat of defaultInvestmentCategories) {
    const existing = await prisma.investmentCategory.findFirst({
      where: { name: cat.name, userId: null },
    });

    if (!existing) {
      await prisma.investmentCategory.create({
        data: {
          ...cat,
          isDefault: true,
        },
      });
      console.log(`Created investment category: ${cat.name}`);
    } else {
      console.log(`Investment category "${cat.name}" already exists`);
    }
  }

  console.log("Seeding completed!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
