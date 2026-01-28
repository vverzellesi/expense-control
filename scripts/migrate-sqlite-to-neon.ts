import Database from "better-sqlite3";
import { PrismaClient } from "@prisma/client";

const SQLITE_PATH = "./prisma/data/expense-control.db";

// Accept user ID as command-line argument
const OLD_USER_ID = process.argv[2];

if (!OLD_USER_ID) {
  console.error("Usage: npx tsx scripts/migrate-sqlite-to-neon.ts <user_id>");
  console.error("\nTo find user IDs in SQLite, run:");
  console.error('  sqlite3 ./prisma/data/expense-control.db "SELECT id, email FROM User;"');
  process.exit(1);
}

async function migrate() {
  // Connect to SQLite
  const sqlite = new Database(SQLITE_PATH, { readonly: true });

  // Connect to PostgreSQL (Neon) via Prisma
  const prisma = new PrismaClient();

  try {
    console.log("Starting migration...\n");

    // 1. Get or create user in Neon
    const oldUser = sqlite.prepare("SELECT * FROM User WHERE id = ?").get(OLD_USER_ID) as any;

    if (!oldUser) {
      console.error(`User not found in SQLite: ${OLD_USER_ID}`);
      process.exit(1);
    }

    console.log(`Found user in SQLite: ${oldUser.email}`);

    let neonUser = await prisma.user.findUnique({
      where: { email: oldUser.email }
    });

    if (!neonUser) {
      console.log("Creating user in Neon...");
      neonUser = await prisma.user.create({
        data: {
          id: oldUser.id,
          email: oldUser.email,
          name: oldUser.name,
          hashedPassword: oldUser.hashedPassword,
          emailVerified: oldUser.emailVerified ? new Date(oldUser.emailVerified) : null,
          image: oldUser.image,
          createdAt: new Date(oldUser.createdAt),
          updatedAt: new Date(oldUser.updatedAt),
        }
      });
      console.log(`Created user: ${neonUser.email}`);
    } else {
      console.log(`User already exists in Neon: ${neonUser.email}`);
    }

    const userId = neonUser.id;

    // 2. Migrate all data in a transaction for consistency
    console.log("\nMigrating data in transaction...");

    await prisma.$transaction(async (tx) => {
      // Clear existing data for this user
      console.log("Clearing any existing data for user...");
      await tx.transaction.deleteMany({ where: { userId } });
      await tx.categoryRule.deleteMany({ where: { userId } });
      await tx.budget.deleteMany({ where: { userId } });
      await tx.installment.deleteMany({ where: { userId } });
      await tx.recurringExpense.deleteMany({ where: { userId } });
      await tx.category.deleteMany({ where: { userId } });
      await tx.origin.deleteMany({ where: { userId } });
      await tx.settings.deleteMany({ where: { userId } });
      await tx.savingsHistory.deleteMany({ where: { userId } });

      // 3. Migrate Categories
      const categories = sqlite.prepare("SELECT * FROM Category WHERE userId = ?").all(OLD_USER_ID) as any[];
      console.log(`\nMigrating ${categories.length} categories...`);

      for (const cat of categories) {
        await tx.category.create({
          data: {
            id: cat.id,
            name: cat.name,
            color: cat.color,
            icon: cat.icon,
            userId,
          }
        });
      }
      console.log(`✓ Migrated ${categories.length} categories`);

      // 4. Migrate Origins
      const origins = sqlite.prepare("SELECT * FROM Origin WHERE userId = ?").all(OLD_USER_ID) as any[];
      console.log(`\nMigrating ${origins.length} origins...`);

      for (const origin of origins) {
        await tx.origin.create({
          data: {
            id: origin.id,
            name: origin.name,
            userId,
          }
        });
      }
      console.log(`✓ Migrated ${origins.length} origins`);

      // 5. Migrate Installments
      const installments = sqlite.prepare("SELECT * FROM Installment WHERE userId = ?").all(OLD_USER_ID) as any[];
      console.log(`\nMigrating ${installments.length} installments...`);

      for (const inst of installments) {
        await tx.installment.create({
          data: {
            id: inst.id,
            description: inst.description,
            totalAmount: inst.totalAmount,
            totalInstallments: inst.totalInstallments,
            installmentAmount: inst.installmentAmount,
            startDate: new Date(inst.startDate),
            origin: inst.origin,
            userId,
          }
        });
      }
      console.log(`✓ Migrated ${installments.length} installments`);

      // 6. Migrate Recurring Expenses
      const recurring = sqlite.prepare("SELECT * FROM RecurringExpense WHERE userId = ?").all(OLD_USER_ID) as any[];
      console.log(`\nMigrating ${recurring.length} recurring expenses...`);

      for (const rec of recurring) {
        await tx.recurringExpense.create({
          data: {
            id: rec.id,
            description: rec.description,
            defaultAmount: rec.defaultAmount,
            dayOfMonth: rec.dayOfMonth,
            type: rec.type,
            origin: rec.origin,
            categoryId: rec.categoryId,
            isActive: Boolean(rec.isActive),
            autoGenerate: Boolean(rec.autoGenerate),
            createdAt: new Date(rec.createdAt),
            updatedAt: new Date(rec.updatedAt),
            userId,
          }
        });
      }
      console.log(`✓ Migrated ${recurring.length} recurring expenses`);

      // 7. Migrate Transactions
      const transactions = sqlite.prepare("SELECT * FROM \"Transaction\" WHERE userId = ?").all(OLD_USER_ID) as any[];
      console.log(`\nMigrating ${transactions.length} transactions...`);

      for (const txn of transactions) {
        await tx.transaction.create({
          data: {
            id: txn.id,
            description: txn.description,
            amount: txn.amount,
            date: new Date(txn.date),
            type: txn.type,
            origin: txn.origin,
            categoryId: txn.categoryId,
            isFixed: Boolean(txn.isFixed),
            isInstallment: Boolean(txn.isInstallment),
            installmentId: txn.installmentId,
            currentInstallment: txn.currentInstallment,
            totalInstallments: txn.totalInstallments,
            recurringExpenseId: txn.recurringExpenseId,
            tags: txn.tags,
            deletedAt: txn.deletedAt ? new Date(txn.deletedAt) : null,
            createdAt: new Date(txn.createdAt),
            updatedAt: new Date(txn.updatedAt),
            userId,
          }
        });
      }
      console.log(`✓ Migrated ${transactions.length} transactions`);

      // 8. Migrate Category Rules
      const rules = sqlite.prepare("SELECT * FROM CategoryRule WHERE userId = ?").all(OLD_USER_ID) as any[];
      console.log(`\nMigrating ${rules.length} category rules...`);

      for (const rule of rules) {
        await tx.categoryRule.create({
          data: {
            id: rule.id,
            keyword: rule.keyword,
            categoryId: rule.categoryId,
            userId,
          }
        });
      }
      console.log(`✓ Migrated ${rules.length} category rules`);

      // 9. Migrate Budgets
      const budgets = sqlite.prepare("SELECT * FROM Budget WHERE userId = ?").all(OLD_USER_ID) as any[];
      console.log(`\nMigrating ${budgets.length} budgets...`);

      for (const budget of budgets) {
        await tx.budget.create({
          data: {
            id: budget.id,
            categoryId: budget.categoryId,
            amount: budget.amount,
            isActive: Boolean(budget.isActive),
            userId,
          }
        });
      }
      console.log(`✓ Migrated ${budgets.length} budgets`);

      // 10. Migrate Settings
      const settings = sqlite.prepare("SELECT * FROM Settings WHERE userId = ?").all(OLD_USER_ID) as any[];
      console.log(`\nMigrating ${settings.length} settings...`);

      for (const setting of settings) {
        await tx.settings.create({
          data: {
            id: setting.id,
            key: setting.key,
            value: setting.value,
            updatedAt: new Date(setting.updatedAt),
            userId,
          }
        });
      }
      console.log(`✓ Migrated ${settings.length} settings`);

      // 11. Migrate Savings History
      const savingsHistory = sqlite.prepare("SELECT * FROM SavingsHistory WHERE userId = ?").all(OLD_USER_ID) as any[];
      console.log(`\nMigrating ${savingsHistory.length} savings history records...`);

      for (const history of savingsHistory) {
        await tx.savingsHistory.create({
          data: {
            id: history.id,
            month: history.month,
            year: history.year,
            goal: history.goal,
            actual: history.actual,
            isAchieved: Boolean(history.isAchieved),
            percentage: history.percentage,
            createdAt: new Date(history.createdAt),
            userId,
          }
        });
      }
      console.log(`✓ Migrated ${savingsHistory.length} savings history records`);
    });

    console.log("\n✅ Migration completed successfully!");

  } catch (error) {
    console.error("Migration failed:", error);
    throw error;
  } finally {
    sqlite.close();
    await prisma.$disconnect();
  }
}

migrate();
