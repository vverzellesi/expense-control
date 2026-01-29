import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const defaultCategories = [
  { name: "Moradia", color: "#3B82F6", icon: "home" },
  { name: "Alimentacao", color: "#F97316", icon: "utensils" },
  { name: "Mercado", color: "#22C55E", icon: "shopping-cart" },
  { name: "Transporte", color: "#8B5CF6", icon: "car" },
  { name: "Saude", color: "#EF4444", icon: "heart" },
  { name: "Lazer", color: "#EC4899", icon: "gamepad" },
  { name: "Educacao", color: "#6366F1", icon: "book" },
  { name: "Servicos", color: "#14B8A6", icon: "smartphone" },
  { name: "Compras", color: "#F59E0B", icon: "shopping-bag" },
  { name: "Salario", color: "#10B981", icon: "wallet" },
  { name: "Investimentos", color: "#06B6D4", icon: "trending-up" },
  { name: "Outros", color: "#6B7280", icon: "help-circle" },
];

const defaultRules = [
  { keyword: "UBER", category: "Transporte" },
  { keyword: "99", category: "Transporte" },
  { keyword: "CABIFY", category: "Transporte" },
  { keyword: "IFOOD", category: "Alimentacao" },
  { keyword: "RAPPI", category: "Alimentacao" },
  { keyword: "AIQFOME", category: "Alimentacao" },
  { keyword: "ZDELIVERY", category: "Alimentacao" },
  { keyword: "MERCADO", category: "Mercado" },
  { keyword: "SUPERMERCADO", category: "Mercado" },
  { keyword: "CARREFOUR", category: "Mercado" },
  { keyword: "EXTRA", category: "Mercado" },
  { keyword: "PAO DE ACUCAR", category: "Mercado" },
  { keyword: "ASSAI", category: "Mercado" },
  { keyword: "ATACADAO", category: "Mercado" },
  { keyword: "NETFLIX", category: "Servicos" },
  { keyword: "SPOTIFY", category: "Servicos" },
  { keyword: "AMAZON PRIME", category: "Servicos" },
  { keyword: "DISNEY", category: "Servicos" },
  { keyword: "HBO", category: "Servicos" },
  { keyword: "YOUTUBE", category: "Servicos" },
  { keyword: "FARMACIA", category: "Saude" },
  { keyword: "DROGARIA", category: "Saude" },
  { keyword: "DROGASIL", category: "Saude" },
  { keyword: "DROGA RAIA", category: "Saude" },
  { keyword: "PANVEL", category: "Saude" },
  { keyword: "ALUGUEL", category: "Moradia" },
  { keyword: "CONDOMINIO", category: "Moradia" },
  { keyword: "IPTU", category: "Moradia" },
  { keyword: "ENERGIA", category: "Moradia" },
  { keyword: "AGUA", category: "Moradia" },
  { keyword: "GAS", category: "Moradia" },
  { keyword: "INTERNET", category: "Moradia" },
  { keyword: "RESTAURANTE", category: "Alimentacao" },
  { keyword: "LANCHONETE", category: "Alimentacao" },
  { keyword: "PIZZARIA", category: "Alimentacao" },
  { keyword: "PADARIA", category: "Alimentacao" },
  { keyword: "SHOPPING", category: "Compras" },
  { keyword: "LOJAS", category: "Compras" },
  { keyword: "RENNER", category: "Compras" },
  { keyword: "C&A", category: "Compras" },
  { keyword: "RIACHUELO", category: "Compras" },
  { keyword: "CINEMA", category: "Lazer" },
  { keyword: "TEATRO", category: "Lazer" },
  { keyword: "SHOW", category: "Lazer" },
  { keyword: "INGRESSO", category: "Lazer" },
  { keyword: "CURSO", category: "Educacao" },
  { keyword: "ESCOLA", category: "Educacao" },
  { keyword: "FACULDADE", category: "Educacao" },
  { keyword: "LIVRO", category: "Educacao" },
  { keyword: "AMAZON", category: "Compras" },
  { keyword: "MERCADO LIVRE", category: "Compras" },
  { keyword: "MAGAZINE LUIZA", category: "Compras" },
  { keyword: "CASAS BAHIA", category: "Compras" },
  // Extratos bancarios
  { keyword: "TARIFA", category: "Servicos" },
  { keyword: "IOF", category: "Servicos" },
  { keyword: "ANUIDADE", category: "Servicos" },
  { keyword: "TAXA BANCARIA", category: "Servicos" },
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
  // Cartoes de credito
  { name: "Cartao C6" },
  { name: "Cartao Itau" },
  { name: "Cartao BTG" },
  // Formas de pagamento
  { name: "PIX" },
  { name: "Transferencia" },
  { name: "Dinheiro" },
  { name: "Boleto" },
  { name: "Debito Automatico" },
  // Extratos bancarios
  { name: "Extrato C6" },
  { name: "Extrato Itau" },
  { name: "Extrato BTG" },
  { name: "Extrato Nubank" },
  { name: "Extrato Bradesco" },
  { name: "Extrato Santander" },
  { name: "Extrato BB" },
  { name: "Extrato Caixa" },
  { name: "Extrato Bancario" },
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
