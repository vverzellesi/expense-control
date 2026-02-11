import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const DEMO_EMAIL = "demo@demo.com";
const DEMO_PASSWORD = "demo123";

// Categories for the demo user
const demoCategories = [
  { name: "Salario", color: "#10B981", icon: "wallet" },
  { name: "Alimentacao", color: "#F97316", icon: "utensils" },
  { name: "Transporte", color: "#3B82F6", icon: "car" },
  { name: "Moradia", color: "#8B5CF6", icon: "home" },
  { name: "Lazer", color: "#EC4899", icon: "gamepad" },
  { name: "Saude", color: "#EF4444", icon: "heart" },
  { name: "Educacao", color: "#14B8A6", icon: "book" },
  { name: "Investimentos", color: "#F59E0B", icon: "trending-up" },
  { name: "Compras", color: "#6366F1", icon: "shopping-bag" },
  { name: "Servicos", color: "#06B6D4", icon: "smartphone" },
];

const demoOrigins = [
  { name: "Nubank" },
  { name: "Itau" },
  { name: "C6 Bank" },
  { name: "Bradesco" },
  { name: "Dinheiro" },
  { name: "PIX" },
];

const demoRules = [
  { keyword: "UBER", category: "Transporte" },
  { keyword: "99", category: "Transporte" },
  { keyword: "IFOOD", category: "Alimentacao" },
  { keyword: "RAPPI", category: "Alimentacao" },
  { keyword: "NETFLIX", category: "Lazer" },
  { keyword: "SPOTIFY", category: "Lazer" },
  { keyword: "AMAZON", category: "Compras" },
  { keyword: "MERCADO", category: "Alimentacao" },
  { keyword: "FARMACIA", category: "Saude" },
  { keyword: "ALUGUEL", category: "Moradia" },
  { keyword: "SHELL", category: "Transporte" },
  { keyword: "DROGASIL", category: "Saude" },
  { keyword: "CINEMARK", category: "Lazer" },
  { keyword: "SMART FIT", category: "Saude" },
];

const demoBudgets = [
  { category: "Alimentacao", amount: 1800 },
  { category: "Lazer", amount: 600 },
  { category: "Transporte", amount: 700 },
  { category: "Compras", amount: 1000 },
  { category: "Saude", amount: 500 },
  { category: "Moradia", amount: 3000 },
  { category: "Servicos", amount: 400 },
];

// Fixed/recurring expenses
const fixedExpenses = [
  { description: "Aluguel", amount: 2200, category: "Moradia", day: 5 },
  { description: "Condominio", amount: 450, category: "Moradia", day: 10 },
  { description: "Internet Vivo Fibra 300MB", amount: 120, category: "Moradia", day: 15 },
  { description: "Energia Eletrica - Enel", amount: 180, category: "Moradia", day: 18 },
  { description: "Agua e Esgoto - Sabesp", amount: 95, category: "Moradia", day: 20 },
  { description: "Academia Smart Fit", amount: 150, category: "Saude", day: 5 },
  { description: "Netflix Premium", amount: 55, category: "Lazer", day: 12 },
  { description: "Spotify Familia", amount: 35, category: "Lazer", day: 12 },
  { description: "iCloud 200GB", amount: 15, category: "Servicos", day: 20 },
  { description: "Disney+ Combo", amount: 44, category: "Lazer", day: 14 },
  { description: "HBO Max", amount: 35, category: "Lazer", day: 16 },
  { description: "Plano de Saude Unimed", amount: 520, category: "Saude", day: 1 },
  { description: "Seguro Auto Porto Seguro", amount: 180, category: "Transporte", day: 8 },
];

// Installments to create - mix of past, present, and future-extending
const installments = [
  {
    description: "iPhone 15 Pro Max 256GB",
    totalAmount: 9200,
    totalInstallments: 12,
    startMonthsAgo: 6,
    category: "Compras",
    origin: "Nubank",
    day: 10,
  },
  {
    description: "Curso de Ingles - Wise Up",
    totalAmount: 3600,
    totalInstallments: 12,
    startMonthsAgo: 3,
    category: "Educacao",
    origin: "Itau",
    day: 15,
  },
  {
    description: "Geladeira Brastemp Frost Free",
    totalAmount: 4200,
    totalInstallments: 10,
    startMonthsAgo: 8,
    category: "Compras",
    origin: "C6 Bank",
    day: 5,
  },
  {
    description: "MacBook Air M3",
    totalAmount: 11400,
    totalInstallments: 12,
    startMonthsAgo: 2,
    category: "Compras",
    origin: "Nubank",
    day: 20,
  },
  {
    description: "TV Samsung 55\" 4K",
    totalAmount: 3600,
    totalInstallments: 10,
    startMonthsAgo: 4,
    category: "Compras",
    origin: "C6 Bank",
    day: 12,
  },
  {
    description: "Sofa Retratil Tok&Stok",
    totalAmount: 4800,
    totalInstallments: 8,
    startMonthsAgo: 1,
    category: "Compras",
    origin: "Bradesco",
    day: 22,
  },
  {
    description: "Passagem Aerea - Cancun",
    totalAmount: 6400,
    totalInstallments: 10,
    startMonthsAgo: 0, // starts this month
    category: "Lazer",
    origin: "Nubank",
    day: 8,
  },
  {
    description: "Ar Condicionado Samsung",
    totalAmount: 2800,
    totalInstallments: 6,
    startMonthsAgo: 5,
    category: "Compras",
    origin: "Itau",
    day: 18,
  },
  {
    description: "Dentista - Tratamento Ortodontico",
    totalAmount: 5400,
    totalInstallments: 12,
    startMonthsAgo: 3,
    category: "Saude",
    origin: "Bradesco",
    day: 25,
  },
];

// Variable expense templates (will be randomized)
const variableExpenses = [
  { description: "iFood - ", amounts: [28, 35, 42, 55, 65, 78, 90], category: "Alimentacao", frequency: 10 },
  { description: "Uber - ", amounts: [15, 22, 28, 35, 45, 58], category: "Transporte", frequency: 7 },
  { description: "99 - ", amounts: [12, 18, 25, 32, 40], category: "Transporte", frequency: 4 },
  { description: "Supermercado Extra", amounts: [180, 220, 280, 350, 420, 480], category: "Alimentacao", frequency: 2 },
  { description: "Supermercado Pao de Acucar", amounts: [150, 200, 260, 320, 380], category: "Alimentacao", frequency: 1.5 },
  { description: "Atacadao", amounts: [300, 420, 550, 680], category: "Alimentacao", frequency: 0.8 },
  { description: "Posto Shell", amounts: [150, 200, 250, 300, 350], category: "Transporte", frequency: 2 },
  { description: "Posto Ipiranga", amounts: [120, 180, 220, 280], category: "Transporte", frequency: 1 },
  { description: "Farmacia Drogasil", amounts: [35, 65, 90, 130, 180], category: "Saude", frequency: 1.5 },
  { description: "Farmacia Droga Raia", amounts: [28, 50, 75, 110], category: "Saude", frequency: 0.8 },
  { description: "Restaurante ", amounts: [55, 75, 95, 120, 150, 180], category: "Alimentacao", frequency: 4 },
  { description: "Cinema Cinemark", amounts: [45, 60, 80, 95], category: "Lazer", frequency: 0.8 },
  { description: "Amazon - ", amounts: [40, 75, 120, 180, 250, 350], category: "Compras", frequency: 1.5 },
  { description: "Mercado Livre - ", amounts: [35, 60, 100, 150, 220], category: "Compras", frequency: 1 },
  { description: "Padaria Pao Quente", amounts: [12, 18, 25, 35, 45], category: "Alimentacao", frequency: 6 },
  { description: "Estacionamento", amounts: [10, 15, 20, 25, 30], category: "Transporte", frequency: 3 },
  { description: "Rappi - ", amounts: [30, 45, 60, 78, 95], category: "Alimentacao", frequency: 3 },
  { description: "Livraria Cultura", amounts: [40, 65, 85, 120], category: "Educacao", frequency: 0.3 },
  { description: "Pet Shop Petz", amounts: [80, 120, 160, 200], category: "Compras", frequency: 0.5 },
  { description: "Barbeiro - Studio Hair", amounts: [45, 60, 80], category: "Servicos", frequency: 0.8 },
  { description: "Lava Rapido Auto Clean", amounts: [35, 50, 65, 80], category: "Transporte", frequency: 0.5 },
  { description: "Shopee - ", amounts: [25, 45, 70, 100, 140], category: "Compras", frequency: 1.2 },
  { description: "Magazine Luiza - ", amounts: [50, 90, 150, 200], category: "Compras", frequency: 0.4 },
];

const restaurantNames = [
  "Outback", "Madero", "Coco Bambu", "Fogo de Chao", "Paris 6",
  "Rascal", "Applebees", "Olive Garden", "Eataly", "Sushi Leblon",
  "Arábia", "Mocotó", "A Casa do Porco", "Mani", "Beco do Batman Bar",
];
const ifoodSuffixes = [
  "Burger King", "McDonalds", "Pizza Hut", "Habbibs", "China in Box",
  "Subway", "Popeyes", "KFC", "Giraffas", "Spoleto", "Bob's",
  "Dominos Pizza", "Jeronimo", "Ragazzo",
];
const uberSuffixes = [
  "Casa-Trabalho", "Shopping Morumbi", "Aeroporto GRU", "Centro",
  "Barra Funda", "Vila Madalena", "Pinheiros", "Itaim Bibi",
  "Paulista", "Moema", "Brooklin",
];
const ride99Suffixes = [
  "Casa-Shopping", "Trabalho-Casa", "Consulta Medica", "Dentista",
  "Happy Hour", "Aeroporto",
];
const amazonItems = [
  "Livro", "Fone Bluetooth JBL", "Cabo USB-C", "Mouse Logitech",
  "Teclado Mecanico", "Mochila", "Echo Dot", "Kindle Paperwhite",
  "Carregador Portatil", "Webcam HD",
];
const mlItems = [
  "Capa Celular", "Pelicula", "Suporte Notebook", "Hub USB",
  "Luminaria LED", "Organizador Escritorio", "Adaptador HDMI",
];
const rappiSuffixes = [
  "Zé Delivery", "Pão de Açúcar Express", "Drogaria SP", "Carrefour Express",
];
const shopeeItems = [
  "Capa AirPods", "Ring Light", "Fita LED", "Organizador",
  "Porta Caneta", "Mousepad Gamer",
];
const magazineItems = [
  "Aspirador Robo", "Cafeteira Nespresso", "Panela Eletrica", "Ventilador",
];

// Extra income sources
const extraIncomes = [
  { description: "Freelance - Desenvolvimento Web", amounts: [1500, 2000, 2500, 3000, 3500], frequency: 0.4 },
  { description: "Freelance - Consultoria Tech", amounts: [800, 1200, 1800, 2200], frequency: 0.3 },
  { description: "Cashback Nubank", amounts: [25, 45, 65, 85, 120], frequency: 0.6 },
  { description: "Rendimento Poupanca", amounts: [35, 50, 70, 90], frequency: 0.8 },
  { description: "Venda OLX - ", amounts: [100, 200, 350, 500, 800], frequency: 0.2 },
];
const olxItems = ["Monitor Antigo", "Cadeira", "Livros Usados", "Celular Antigo", "Console PS4"];

// Investment portfolio
const investmentData = [
  {
    categoryName: "Renda Fixa",
    categoryColor: "#10B981",
    categoryIcon: "shield",
    investments: [
      { name: "CDB Nubank 120% CDI", broker: "Nubank", totalInvested: 15000, returnRate: 0.12, goalAmount: 25000 },
      { name: "Tesouro Selic 2029", broker: "Rico", totalInvested: 8000, returnRate: 0.105, goalAmount: 15000 },
      { name: "LCI Banco Inter 95% CDI", broker: "Inter", totalInvested: 5000, returnRate: 0.09, goalAmount: 10000 },
    ],
  },
  {
    categoryName: "Renda Variavel",
    categoryColor: "#3B82F6",
    categoryIcon: "trending-up",
    investments: [
      { name: "IVVB11 - ETF S&P 500", broker: "Clear", totalInvested: 6000, returnRate: 0.15, goalAmount: 20000 },
      { name: "PETR4 - Petrobras", broker: "Clear", totalInvested: 3000, returnRate: 0.08, goalAmount: null },
      { name: "VALE3 - Vale", broker: "Clear", totalInvested: 2500, returnRate: -0.03, goalAmount: null },
    ],
  },
  {
    categoryName: "Fundos Imobiliarios",
    categoryColor: "#8B5CF6",
    categoryIcon: "building",
    investments: [
      { name: "HGLG11 - CSHG Logistica", broker: "Rico", totalInvested: 4000, returnRate: 0.06, goalAmount: 10000 },
      { name: "XPLG11 - XP Log", broker: "Rico", totalInvested: 3000, returnRate: 0.04, goalAmount: 8000 },
    ],
  },
  {
    categoryName: "Cripto",
    categoryColor: "#F59E0B",
    categoryIcon: "bitcoin",
    investments: [
      { name: "Bitcoin (BTC)", broker: "Binance", totalInvested: 2000, returnRate: 0.35, goalAmount: 10000 },
      { name: "Ethereum (ETH)", broker: "Binance", totalInvested: 1000, returnRate: 0.20, goalAmount: 5000 },
    ],
  },
];

function randomElement<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

function getMonthDays(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

async function main() {
  console.log("=== Demo Account Seeding (Enhanced) ===\n");

  // Check if demo user exists
  const existingUser = await prisma.user.findUnique({
    where: { email: DEMO_EMAIL },
  });

  if (existingUser) {
    console.log("Demo user exists. Deleting all data for reset...");
    await prisma.user.delete({ where: { id: existingUser.id } });
    console.log("Existing demo user deleted.\n");
  }

  // Create demo user
  const hashedPassword = await bcrypt.hash(DEMO_PASSWORD, 12);
  const demoUser = await prisma.user.create({
    data: {
      email: DEMO_EMAIL,
      name: "Usuario Demo",
      hashedPassword,
    },
  });
  console.log(`Created demo user: ${DEMO_EMAIL}`);

  // Create categories
  const categoryMap = new Map<string, string>();
  for (const cat of demoCategories) {
    const created = await prisma.category.create({
      data: { ...cat, userId: demoUser.id },
    });
    categoryMap.set(cat.name, created.id);
  }
  console.log(`Created ${demoCategories.length} categories`);

  // Create origins
  const originMap = new Map<string, string>();
  for (const origin of demoOrigins) {
    const created = await prisma.origin.create({
      data: { ...origin, userId: demoUser.id },
    });
    originMap.set(origin.name, created.id);
  }
  console.log(`Created ${demoOrigins.length} origins`);

  // Create category rules
  for (const rule of demoRules) {
    const categoryId = categoryMap.get(rule.category);
    if (categoryId) {
      await prisma.categoryRule.create({
        data: {
          keyword: rule.keyword,
          categoryId,
          userId: demoUser.id,
        },
      });
    }
  }
  console.log(`Created ${demoRules.length} category rules`);

  // Create budgets
  for (const budget of demoBudgets) {
    const categoryId = categoryMap.get(budget.category);
    if (categoryId) {
      await prisma.budget.create({
        data: {
          categoryId,
          amount: budget.amount,
          userId: demoUser.id,
        },
      });
    }
  }
  console.log(`Created ${demoBudgets.length} budgets`);

  // Create settings (savings goal)
  await prisma.settings.create({
    data: {
      key: "savingsGoal",
      value: "2500",
      userId: demoUser.id,
    },
  });
  console.log("Created savings goal setting");

  // Determine date range
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const currentDay = now.getDate();

  // How many months into the future to generate (for recurring & installments)
  const FUTURE_MONTHS = 6;

  // Create recurring expense templates
  const recurringMap = new Map<string, string>();
  for (const expense of fixedExpenses) {
    const categoryId = categoryMap.get(expense.category);
    const recurring = await prisma.recurringExpense.create({
      data: {
        description: expense.description,
        defaultAmount: expense.amount,
        dayOfMonth: expense.day,
        type: "EXPENSE",
        origin: "Nubank",
        categoryId,
        userId: demoUser.id,
        isActive: true,
        autoGenerate: true,
      },
    });
    recurringMap.set(expense.description, recurring.id);
  }
  console.log(`Created ${fixedExpenses.length} recurring expense templates`);

  // ─── Generate transactions ───────────────────────────────────────
  // 12 months back + current month + 6 months ahead
  let transactionCount = 0;

  for (let monthOffset = -11; monthOffset <= FUTURE_MONTHS; monthOffset++) {
    const targetDate = addMonths(new Date(currentYear, currentMonth, 1), monthOffset);
    const year = targetDate.getFullYear();
    const month = targetDate.getMonth();
    const daysInMonth = getMonthDays(year, month);
    const isCurrentMonth = monthOffset === 0;
    const isFutureMonth = monthOffset > 0;
    const isPastMonth = monthOffset < 0;

    // For current month, only generate up to today
    // For past and future months, generate full month
    const maxDay = isCurrentMonth ? currentDay : daysInMonth;

    // ── Salary (income) ──
    const salaryDay = Math.min(5, maxDay);
    // Vary salary slightly with bonuses
    let salaryAmount = 8500;
    if (month === 11) salaryAmount = 17000; // 13th salary in December
    if (month === 5) salaryAmount = 9500; // Bonus in June

    await prisma.transaction.create({
      data: {
        description: month === 11 ? "Salario + 13o - Empresa TechCorp" : "Salario - Empresa TechCorp",
        amount: salaryAmount,
        date: new Date(year, month, salaryDay),
        type: "INCOME",
        origin: "Itau",
        categoryId: categoryMap.get("Salario"),
        userId: demoUser.id,
        isFixed: true,
      },
    });
    transactionCount++;

    // ── Fixed/recurring expenses ──
    for (const expense of fixedExpenses) {
      const day = Math.min(expense.day, maxDay);
      // Slight variation in utility bills
      let amount = expense.amount;
      if (expense.description.includes("Energia")) {
        amount = Math.round(expense.amount * randomFloat(0.8, 1.3));
      } else if (expense.description.includes("Agua")) {
        amount = Math.round(expense.amount * randomFloat(0.85, 1.2));
      }

      await prisma.transaction.create({
        data: {
          description: expense.description,
          amount: -amount,
          date: new Date(year, month, day),
          type: "EXPENSE",
          origin: "Nubank",
          categoryId: categoryMap.get(expense.category),
          userId: demoUser.id,
          isFixed: true,
          recurringExpenseId: recurringMap.get(expense.description),
        },
      });
      transactionCount++;
    }

    // ── Variable expenses (only for past + current month) ──
    if (!isFutureMonth) {
      for (const template of variableExpenses) {
        const count = Math.round(template.frequency * (0.7 + Math.random() * 0.6));

        for (let i = 0; i < count; i++) {
          const day = randomInt(1, maxDay);
          const amount = randomElement(template.amounts);
          let description = template.description;

          // Add variety to descriptions
          if (description.includes("iFood")) {
            description += randomElement(ifoodSuffixes);
          } else if (description.startsWith("Uber")) {
            description += randomElement(uberSuffixes);
          } else if (description.startsWith("99")) {
            description += randomElement(ride99Suffixes);
          } else if (description.includes("Restaurante")) {
            description += randomElement(restaurantNames);
          } else if (description.includes("Amazon")) {
            description += randomElement(amazonItems);
          } else if (description.includes("Mercado Livre")) {
            description += randomElement(mlItems);
          } else if (description.includes("Rappi")) {
            description += randomElement(rappiSuffixes);
          } else if (description.includes("Shopee")) {
            description += randomElement(shopeeItems);
          } else if (description.includes("Magazine Luiza")) {
            description += randomElement(magazineItems);
          }

          await prisma.transaction.create({
            data: {
              description,
              amount: -amount,
              date: new Date(year, month, day),
              type: "EXPENSE",
              origin: randomElement(["Nubank", "Itau", "C6 Bank", "PIX", "Bradesco"]),
              categoryId: categoryMap.get(template.category),
              userId: demoUser.id,
            },
          });
          transactionCount++;
        }
      }

      // ── Extra income (freelance, cashback, sales) ──
      for (const income of extraIncomes) {
        if (Math.random() < income.frequency) {
          const day = randomInt(1, maxDay);
          const amount = randomElement(income.amounts);
          let description = income.description;

          if (description.includes("OLX")) {
            description += randomElement(olxItems);
          }

          await prisma.transaction.create({
            data: {
              description,
              amount,
              date: new Date(year, month, day),
              type: "INCOME",
              origin: randomElement(["PIX", "Nubank", "Itau"]),
              categoryId: categoryMap.get("Salario"),
              userId: demoUser.id,
            },
          });
          transactionCount++;
        }
      }

      // ── Occasional investment transfer (monthly, varying amounts) ──
      if (isPastMonth || (isCurrentMonth && currentDay > 10)) {
        const investDay = randomInt(8, Math.min(15, maxDay));
        await prisma.transaction.create({
          data: {
            description: randomElement([
              "Aporte CDB Nubank",
              "Aporte Tesouro Direto",
              "Aporte ETF IVVB11",
              "Aporte FII HGLG11",
              "Aporte Bitcoin Binance",
            ]),
            amount: -randomElement([500, 800, 1000, 1200, 1500, 2000]),
            date: new Date(year, month, investDay),
            type: "EXPENSE",
            origin: randomElement(["Nubank", "C6 Bank", "Itau"]),
            categoryId: categoryMap.get("Investimentos"),
            userId: demoUser.id,
          },
        });
        transactionCount++;
      }
    }
  }
  console.log(`Created ${transactionCount} regular transactions (past + current + future fixed)`);

  // ─── Installments with future transactions ─────────────────────
  let installmentTransactionCount = 0;
  for (const inst of installments) {
    const installmentAmount = Math.round((inst.totalAmount / inst.totalInstallments) * 100) / 100;
    const startDate = addMonths(new Date(currentYear, currentMonth, 1), -inst.startMonthsAgo);

    const installmentGroup = await prisma.installment.create({
      data: {
        description: inst.description,
        totalAmount: inst.totalAmount,
        totalInstallments: inst.totalInstallments,
        installmentAmount,
        startDate,
        origin: inst.origin,
        userId: demoUser.id,
      },
    });

    // Generate ALL installment transactions (past AND future)
    for (let i = 0; i < inst.totalInstallments; i++) {
      const transactionDate = addMonths(startDate, i);
      const txYear = transactionDate.getFullYear();
      const txMonth = transactionDate.getMonth();
      const txDay = Math.min(inst.day, getMonthDays(txYear, txMonth));

      // For current month, only if today >= the day
      const isCurrentMonthTx =
        txYear === currentYear && txMonth === currentMonth;
      if (isCurrentMonthTx && txDay > currentDay) continue;

      // Don't generate more than FUTURE_MONTHS ahead
      const futureLimit = addMonths(new Date(currentYear, currentMonth, 1), FUTURE_MONTHS + 1);
      if (transactionDate >= futureLimit) continue;

      const installmentNumber = i + 1;
      await prisma.transaction.create({
        data: {
          description: `${inst.description} ${installmentNumber}/${inst.totalInstallments}`,
          amount: -installmentAmount,
          date: new Date(txYear, txMonth, txDay),
          type: "EXPENSE",
          origin: inst.origin,
          categoryId: categoryMap.get(inst.category),
          userId: demoUser.id,
          isInstallment: true,
          installmentId: installmentGroup.id,
          currentInstallment: installmentNumber,
          totalInstallments: inst.totalInstallments,
        },
      });
      installmentTransactionCount++;
    }
  }
  console.log(`Created ${installments.length} installment groups with ${installmentTransactionCount} transactions`);

  // ─── Investment Portfolio ──────────────────────────────────────
  let investmentCount = 0;
  let investmentTxCount = 0;

  for (const catData of investmentData) {
    // Create or find investment category
    const invCategory = await prisma.investmentCategory.create({
      data: {
        name: catData.categoryName,
        color: catData.categoryColor,
        icon: catData.categoryIcon,
        isDefault: false,
        userId: demoUser.id,
      },
    });

    for (const inv of catData.investments) {
      // Calculate current value with returns
      const currentValue = Math.round(inv.totalInvested * (1 + inv.returnRate) * 100) / 100;

      const investment = await prisma.investment.create({
        data: {
          name: inv.name,
          categoryId: invCategory.id,
          currentValue,
          totalInvested: inv.totalInvested,
          totalWithdrawn: 0,
          goalAmount: inv.goalAmount,
          broker: inv.broker,
          userId: demoUser.id,
        },
      });
      investmentCount++;

      // Create deposit transactions spread over past months
      const numDeposits = Math.ceil(inv.totalInvested / 1000);
      const depositAmount = Math.round((inv.totalInvested / numDeposits) * 100) / 100;
      for (let d = 0; d < numDeposits; d++) {
        const monthsBack = randomInt(1, 10);
        const depositDate = addMonths(new Date(currentYear, currentMonth, randomInt(5, 25)), -monthsBack);

        await prisma.investmentTransaction.create({
          data: {
            investmentId: investment.id,
            type: "DEPOSIT",
            amount: d === numDeposits - 1
              ? Math.round((inv.totalInvested - depositAmount * (numDeposits - 1)) * 100) / 100
              : depositAmount,
            date: depositDate,
            notes: `Aporte ${inv.name}`,
          },
        });
        investmentTxCount++;
      }
    }
  }
  console.log(`Created ${investmentCount} investments with ${investmentTxCount} deposit transactions`);

  // ─── Investment Snapshots (monthly portfolio history) ──────────
  let snapshotCount = 0;
  for (let monthOffset = -11; monthOffset <= 0; monthOffset++) {
    const targetDate = addMonths(new Date(currentYear, currentMonth, 1), monthOffset);
    const snapYear = targetDate.getFullYear();
    const snapMonth = targetDate.getMonth();

    // Simulate growing portfolio
    const monthProgress = (monthOffset + 12) / 12; // 0.08 to 1.0
    const totalInvested = Math.round(49500 * monthProgress); // 49500 is sum of all totalInvested
    const returnMultiplier = 1 + (0.10 * monthProgress * randomFloat(0.8, 1.2));
    const totalValue = Math.round(totalInvested * returnMultiplier);

    await prisma.investmentSnapshot.create({
      data: {
        month: snapMonth + 1,
        year: snapYear,
        totalValue,
        totalInvested,
        totalWithdrawn: 0,
        userId: demoUser.id,
      },
    });
    snapshotCount++;
  }
  console.log(`Created ${snapshotCount} investment snapshots`);

  // ─── Savings History ───────────────────────────────────────────
  for (let monthOffset = -11; monthOffset < 0; monthOffset++) {
    const targetDate = addMonths(new Date(currentYear, currentMonth, 1), monthOffset);
    const year = targetDate.getFullYear();
    const month = targetDate.getMonth();

    const goal = 2500;
    const actual = randomElement([1200, 1500, 1800, 2000, 2200, 2500, 2800, 3000, 1600, 2100, 2400, 2700]);
    const percentage = (actual / goal) * 100;

    await prisma.savingsHistory.create({
      data: {
        month: month + 1,
        year,
        goal,
        actual,
        isAchieved: actual >= goal,
        percentage,
        userId: demoUser.id,
      },
    });
  }
  console.log("Created 11 months of savings history");

  console.log("\n=== Demo Account Seeding Complete ===");
  console.log(`\nLogin credentials:`);
  console.log(`  Email: ${DEMO_EMAIL}`);
  console.log(`  Password: ${DEMO_PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
