/**
 * Script de Migração de Dados para Usuário
 *
 * Este script associa todos os dados existentes (sem userId) ao usuário especificado.
 * Execute após criar sua conta pessoal no sistema.
 *
 * Uso:
 *   npx tsx scripts/migrate-data-to-user.ts <email-do-usuario>
 *
 * Exemplo:
 *   npx tsx scripts/migrate-data-to-user.ts victor@email.com
 */

import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function migrateDataToUser(userEmail: string) {
  console.log("\n🔄 Iniciando migração de dados...")
  console.log(`📧 Email do usuário: ${userEmail}\n`)

  // Encontrar o usuário pelo email
  const user = await prisma.user.findUnique({
    where: { email: userEmail.toLowerCase() },
  })

  if (!user) {
    console.error(`❌ Usuário com email "${userEmail}" não encontrado.`)
    console.log("   Certifique-se de criar a conta primeiro em /auth/register")
    process.exit(1)
  }

  console.log(`✅ Usuário encontrado: ${user.name || user.email} (ID: ${user.id})\n`)

  const results = {
    transactions: 0,
    categories: 0,
    recurringExpenses: 0,
    installments: 0,
    origins: 0,
    budgets: 0,
    categoryRules: 0,
    settings: 0,
    savingsHistory: 0,
  }

  // Migrar Transactions
  const transactionsResult = await prisma.transaction.updateMany({
    where: { userId: null },
    data: { userId: user.id },
  })
  results.transactions = transactionsResult.count
  console.log(`📝 Transações migradas: ${results.transactions}`)

  // Migrar Categories
  const categoriesResult = await prisma.category.updateMany({
    where: { userId: null },
    data: { userId: user.id },
  })
  results.categories = categoriesResult.count
  console.log(`📁 Categorias migradas: ${results.categories}`)

  // Migrar RecurringExpenses
  const recurringResult = await prisma.recurringExpense.updateMany({
    where: { userId: null },
    data: { userId: user.id },
  })
  results.recurringExpenses = recurringResult.count
  console.log(`🔄 Despesas recorrentes migradas: ${results.recurringExpenses}`)

  // Migrar Installments
  const installmentsResult = await prisma.installment.updateMany({
    where: { userId: null },
    data: { userId: user.id },
  })
  results.installments = installmentsResult.count
  console.log(`💳 Parcelamentos migrados: ${results.installments}`)

  // Migrar Origins
  const originsResult = await prisma.origin.updateMany({
    where: { userId: null },
    data: { userId: user.id },
  })
  results.origins = originsResult.count
  console.log(`🏦 Origens migradas: ${results.origins}`)

  // Migrar Budgets
  const budgetsResult = await prisma.budget.updateMany({
    where: { userId: null },
    data: { userId: user.id },
  })
  results.budgets = budgetsResult.count
  console.log(`📊 Orçamentos migrados: ${results.budgets}`)

  // Migrar CategoryRules
  const rulesResult = await prisma.categoryRule.updateMany({
    where: { userId: null },
    data: { userId: user.id },
  })
  results.categoryRules = rulesResult.count
  console.log(`📋 Regras de categoria migradas: ${results.categoryRules}`)

  // Migrar Settings
  const settingsResult = await prisma.settings.updateMany({
    where: { userId: null },
    data: { userId: user.id },
  })
  results.settings = settingsResult.count
  console.log(`⚙️  Configurações migradas: ${results.settings}`)

  // Migrar SavingsHistory
  const savingsResult = await prisma.savingsHistory.updateMany({
    where: { userId: null },
    data: { userId: user.id },
  })
  results.savingsHistory = savingsResult.count
  console.log(`💰 Histórico de economia migrado: ${results.savingsHistory}`)

  // Resumo
  const total = Object.values(results).reduce((a, b) => a + b, 0)
  console.log("\n" + "=".repeat(50))
  console.log(`✅ Migração concluída!`)
  console.log(`📊 Total de registros migrados: ${total}`)
  console.log("=".repeat(50) + "\n")

  return results
}

// Execução
const email = process.argv[2]

if (!email) {
  console.log("\n❌ Erro: Email do usuário não fornecido.")
  console.log("\nUso: npx tsx scripts/migrate-data-to-user.ts <email>")
  console.log("Exemplo: npx tsx scripts/migrate-data-to-user.ts victor@email.com\n")
  process.exit(1)
}

migrateDataToUser(email)
  .then(() => {
    console.log("✅ Script finalizado com sucesso!")
  })
  .catch((error) => {
    console.error("❌ Erro durante a migração:", error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
