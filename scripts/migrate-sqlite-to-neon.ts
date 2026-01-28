import Database from "better-sqlite3";
import { PrismaClient } from "@prisma/client";

const SQLITE_PATH = "./prisma/data/expense-control.db";
const OLD_USER_ID = "cmky3h5vt000096d66lp3v2ul";

async function migrate() {
  // Connect to SQLite
  const sqlite = new Database(SQLITE_PATH, { readonly: true });

  // Connect to PostgreSQL (Neon) via Prisma
  const prisma = new PrismaClient();

  try {
    console.log("Starting migration...\n");

    // 1. Get or create user in Neon
    const oldUser = sqlite.prepare("SELECT * FROM User WHERE id = ?").get(OLD_USER_ID) as any;
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

    // 2. Clear existing seed data for this user (if any)
    console.log("\nClearing any existing data for user...");
    await prisma.transaction.deleteMany({ where: { userId } });
    await prisma.categoryRule.deleteMany({ where: { userId } });
    await prisma.budget.deleteMany({ where: { userId } });
    await prisma.installment.deleteMany({ where: { userId } });
    await prisma.recurringExpense.deleteMany({ where: { userId } });
    await prisma.category.deleteMany({ where: { userId } });
    await prisma.origin.deleteMany({ where: { userId } });
    await prisma.settings.deleteMany({ where: { userId } });

    // 3. Migrate Categories
    const categories = sqlite.prepare("SELECT * FROM Category WHERE userId = ?").all(OLD_USER_ID) as any[];
    console.log(`\nMigrating ${categories.length} categories...`);

    const categoryIdMap = new Map<string, string>();
    for (const cat of categories) {
      const created = await prisma.category.create({
        data: {
          id: cat.id,
          name: cat.name,
          color: cat.color,
          icon: cat.icon,
          userId,
        }
      });
      categoryIdMap.set(cat.id, created.id);
    }
    console.log(`✓ Migrated ${categories.length} categories`);

    // 4. Migrate Origins
    const origins = sqlite.prepare("SELECT * FROM Origin WHERE userId = ?").all(OLD_USER_ID) as any[];
    console.log(`\nMigrating ${origins.length} origins...`);

    for (const origin of origins) {
      await prisma.origin.create({
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
      await prisma.installment.create({
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
      await prisma.recurringExpense.create({
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

    for (const tx of transactions) {
      await prisma.transaction.create({
        data: {
          id: tx.id,
          description: tx.description,
          amount: tx.amount,
          date: new Date(tx.date),
          type: tx.type,
          origin: tx.origin,
          categoryId: tx.categoryId,
          isFixed: Boolean(tx.isFixed),
          isInstallment: Boolean(tx.isInstallment),
          installmentId: tx.installmentId,
          currentInstallment: tx.currentInstallment,
          totalInstallments: tx.totalInstallments,
          recurringExpenseId: tx.recurringExpenseId,
          tags: tx.tags,
          deletedAt: tx.deletedAt ? new Date(tx.deletedAt) : null,
          createdAt: new Date(tx.createdAt),
          updatedAt: new Date(tx.updatedAt),
          userId,
        }
      });
    }
    console.log(`✓ Migrated ${transactions.length} transactions`);

    // 8. Migrate Category Rules
    const rules = sqlite.prepare("SELECT * FROM CategoryRule WHERE userId = ?").all(OLD_USER_ID) as any[];
    console.log(`\nMigrating ${rules.length} category rules...`);

    for (const rule of rules) {
      await prisma.categoryRule.create({
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
      await prisma.budget.create({
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
      await prisma.settings.create({
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
