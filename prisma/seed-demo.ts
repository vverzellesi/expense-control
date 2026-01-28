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
];

const demoBudgets = [
  { category: "Alimentacao", amount: 1500 },
  { category: "Lazer", amount: 500 },
  { category: "Transporte", amount: 600 },
  { category: "Compras", amount: 800 },
];

// Fixed/recurring expenses
const fixedExpenses = [
  { description: "Aluguel", amount: 2200, category: "Moradia", day: 5 },
  { description: "Condominio", amount: 450, category: "Moradia", day: 10 },
  { description: "Internet Vivo", amount: 120, category: "Moradia", day: 15 },
  { description: "Academia Smart Fit", amount: 150, category: "Saude", day: 5 },
  { description: "Netflix", amount: 55, category: "Lazer", day: 12 },
  { description: "Spotify", amount: 35, category: "Lazer", day: 12 },
  { description: "iCloud 200GB", amount: 15, category: "Servicos", day: 20 },
];

// Installments to create
const installments = [
  {
    description: "iPhone 15 Pro",
    totalAmount: 7800,
    totalInstallments: 12,
    startMonthsAgo: 6,
    category: "Compras",
    origin: "Nubank",
  },
  {
    description: "Curso de Ingles - Wise Up",
    totalAmount: 2400,
    totalInstallments: 6,
    startMonthsAgo: 2,
    category: "Educacao",
    origin: "Itau",
  },
  {
    description: "Geladeira Brastemp",
    totalAmount: 3200,
    totalInstallments: 10,
    startMonthsAgo: 8,
    category: "Compras",
    origin: "C6 Bank",
  },
];

// Variable expense templates (will be randomized)
const variableExpenses = [
  { description: "iFood - ", amounts: [35, 45, 55, 65, 75], category: "Alimentacao", frequency: 8 },
  { description: "Uber - ", amounts: [18, 25, 32, 40, 55], category: "Transporte", frequency: 6 },
  { description: "Supermercado Extra", amounts: [180, 220, 280, 350, 420], category: "Alimentacao", frequency: 2 },
  { description: "Posto Shell", amounts: [150, 200, 250, 300], category: "Transporte", frequency: 2 },
  { description: "Farmacia Drogasil", amounts: [45, 80, 120, 180], category: "Saude", frequency: 1 },
  { description: "Restaurante ", amounts: [60, 85, 120, 150], category: "Alimentacao", frequency: 3 },
  { description: "Cinema Cinemark", amounts: [45, 60, 80], category: "Lazer", frequency: 0.5 },
  { description: "Amazon - ", amounts: [50, 100, 150, 200, 300], category: "Compras", frequency: 1 },
  { description: "Padaria Pao Quente", amounts: [15, 25, 35, 45], category: "Alimentacao", frequency: 4 },
  { description: "Estacionamento", amounts: [10, 15, 20, 25], category: "Transporte", frequency: 3 },
];

const restaurantNames = ["Outback", "Madero", "Coco Bambu", "Fogo de Chao", "Paris 6", "Rascal"];
const ifoodSuffixes = ["Burger King", "McDonalds", "Pizza Hut", "Habbibs", "China in Box", "Subway"];
const uberSuffixes = ["Casa-Trabalho", "Shopping", "Aeroporto", "Centro", "Barra"];
const amazonItems = ["Livro", "Fone Bluetooth", "Cabo USB", "Mouse", "Teclado", "Mochila"];

function randomElement<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
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
  console.log("=== Demo Account Seeding ===\n");

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
      value: "2000",
      userId: demoUser.id,
    },
  });
  console.log("Created savings goal setting");

  // Determine date range (12 months back from current month)
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const currentDay = now.getDate();

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

  // Generate transactions for 12 months
  let transactionCount = 0;

  for (let monthOffset = -11; monthOffset <= 0; monthOffset++) {
    const targetDate = addMonths(new Date(currentYear, currentMonth, 1), monthOffset);
    const year = targetDate.getFullYear();
    const month = targetDate.getMonth();
    const daysInMonth = getMonthDays(year, month);
    const isCurrentMonth = monthOffset === 0;
    const maxDay = isCurrentMonth ? currentDay : daysInMonth;

    // Monthly salary (income)
    const salaryDay = Math.min(5, maxDay);
    await prisma.transaction.create({
      data: {
        description: "Salario - Empresa XYZ",
        amount: 8500,
        date: new Date(year, month, salaryDay),
        type: "INCOME",
        origin: "Itau",
        categoryId: categoryMap.get("Salario"),
        userId: demoUser.id,
        isFixed: true,
      },
    });
    transactionCount++;

    // Fixed expenses
    for (const expense of fixedExpenses) {
      const day = Math.min(expense.day, maxDay);
      if (day <= maxDay) {
        await prisma.transaction.create({
          data: {
            description: expense.description,
            amount: -expense.amount,
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
    }

    // Variable expenses
    for (const template of variableExpenses) {
      // Determine how many transactions this month (based on frequency with some randomness)
      const count = Math.round(template.frequency * (0.7 + Math.random() * 0.6));

      for (let i = 0; i < count; i++) {
        const day = randomInt(1, maxDay);
        const amount = randomElement(template.amounts);
        let description = template.description;

        // Add variety to descriptions
        if (description.includes("iFood")) {
          description += randomElement(ifoodSuffixes);
        } else if (description.includes("Uber")) {
          description += randomElement(uberSuffixes);
        } else if (description.includes("Restaurante")) {
          description += randomElement(restaurantNames);
        } else if (description.includes("Amazon")) {
          description += randomElement(amazonItems);
        }

        await prisma.transaction.create({
          data: {
            description,
            amount: -amount,
            date: new Date(year, month, day),
            type: "EXPENSE",
            origin: randomElement(["Nubank", "Itau", "C6 Bank", "PIX"]),
            categoryId: categoryMap.get(template.category),
            userId: demoUser.id,
          },
        });
        transactionCount++;
      }
    }

    // Occasional investment transfer (every 2-3 months)
    if (monthOffset % 2 === 0 && !isCurrentMonth) {
      await prisma.transaction.create({
        data: {
          description: "Investimento CDB Nubank",
          amount: -randomElement([500, 1000, 1500, 2000]),
          date: new Date(year, month, randomInt(15, Math.min(25, maxDay))),
          type: "EXPENSE",
          origin: "Nubank",
          categoryId: categoryMap.get("Investimentos"),
          userId: demoUser.id,
        },
      });
      transactionCount++;
    }
  }
  console.log(`Created ${transactionCount} regular transactions`);

  // Create installments with their transactions
  let installmentTransactionCount = 0;
  for (const inst of installments) {
    const installmentAmount = inst.totalAmount / inst.totalInstallments;
    const startDate = addMonths(new Date(currentYear, currentMonth, 1), -inst.startMonthsAgo);

    // Create the installment group
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

    // Create transactions for each installment paid so far
    const paidInstallments = Math.min(inst.startMonthsAgo + 1, inst.totalInstallments);

    for (let i = 0; i < paidInstallments; i++) {
      const transactionDate = addMonths(startDate, i);
      // Only create if the date is not in the future
      if (transactionDate <= now) {
        const installmentNumber = i + 1;
        await prisma.transaction.create({
          data: {
            description: `${inst.description} ${installmentNumber}/${inst.totalInstallments}`,
            amount: -installmentAmount,
            date: new Date(transactionDate.getFullYear(), transactionDate.getMonth(), 10),
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
  }
  console.log(`Created ${installments.length} installment groups with ${installmentTransactionCount} transactions`);

  // Create savings history for past months
  for (let monthOffset = -11; monthOffset < 0; monthOffset++) {
    const targetDate = addMonths(new Date(currentYear, currentMonth, 1), monthOffset);
    const year = targetDate.getFullYear();
    const month = targetDate.getMonth();

    // Vary the actual savings (sometimes above goal, sometimes below)
    const goal = 2000;
    const actual = randomElement([1200, 1500, 1800, 2000, 2200, 2500, 1000, 2800]);
    const percentage = (actual / goal) * 100;

    await prisma.savingsHistory.create({
      data: {
        month: month + 1, // 1-indexed month
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
