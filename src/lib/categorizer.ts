import prisma from "./db";
import type { Category, CategoryRule } from "@/types";

interface RuleWithCategory extends CategoryRule {
  category: Category;
}

// Cache rules per user
const rulesCacheByUser: Map<string, RuleWithCategory[]> = new Map();

export async function getRules(userId?: string): Promise<RuleWithCategory[]> {
  const cacheKey = userId || "_global";
  const cached = rulesCacheByUser.get(cacheKey);
  if (cached) return cached;

  const rules = await prisma.categoryRule.findMany({
    where: userId ? { userId } : undefined,
    include: { category: true },
  });

  rulesCacheByUser.set(cacheKey, rules as RuleWithCategory[]);
  return rules as RuleWithCategory[];
}

export function invalidateRulesCache(userId?: string) {
  if (userId) {
    rulesCacheByUser.delete(userId);
  } else {
    rulesCacheByUser.clear();
  }
}

export async function suggestCategory(
  description: string,
  userId?: string
): Promise<Category | null> {
  const rules = await getRules(userId);
  const upperDesc = description.toUpperCase();

  for (const rule of rules) {
    if (upperDesc.includes(rule.keyword.toUpperCase())) {
      return rule.category;
    }
  }

  return null;
}

export async function addRule(
  keyword: string,
  categoryId: string
): Promise<CategoryRule> {
  const rule = await prisma.categoryRule.create({
    data: {
      keyword: keyword.toUpperCase(),
      categoryId,
    },
  });

  invalidateRulesCache();
  return rule;
}

export async function deleteRule(ruleId: string): Promise<void> {
  await prisma.categoryRule.delete({
    where: { id: ruleId },
  });

  invalidateRulesCache();
}

// Recurring transaction patterns (subscriptions and regular services)
const RECURRING_PATTERNS: { pattern: RegExp; name: string }[] = [
  { pattern: /NETFLIX/i, name: "Netflix" },
  { pattern: /SPOTIFY/i, name: "Spotify" },
  { pattern: /AMAZON\s*PRIME/i, name: "Amazon Prime" },
  { pattern: /PRIME\s*VIDEO/i, name: "Prime Video" },
  { pattern: /DISNEY\s*\+?/i, name: "Disney+" },
  { pattern: /HBO\s*MAX/i, name: "HBO Max" },
  { pattern: /IFOOD\s*(?:CLUB|BENEFICIOS)?/i, name: "iFood" },
  { pattern: /SEM\s*PARAR/i, name: "Sem Parar" },
  { pattern: /VELOE/i, name: "Veloe" },
  { pattern: /CLARO\s*(?:TV|FIXO|MOVEL)?/i, name: "Claro" },
  { pattern: /VIVO\s*(?:FIXO|MOVEL)?/i, name: "Vivo" },
  { pattern: /TIM\s*(?:FIXO|MOVEL)?/i, name: "Tim" },
  { pattern: /\bOI\s*(?:FIXO|MOVEL)?\b/i, name: "Oi" },
  { pattern: /GOOGLE\s*(?:ONE|STORAGE|CLOUD)/i, name: "Google One" },
  { pattern: /APPLE\.COM\/BILL/i, name: "Apple" },
  { pattern: /APPLE\s*(?:MUSIC|TV|ARCADE|ICLOUD)/i, name: "Apple" },
  { pattern: /CHATGPT|OPENAI/i, name: "ChatGPT" },
  { pattern: /YOUTUBE\s*(?:PREMIUM|MUSIC)/i, name: "YouTube Premium" },
  { pattern: /DEEZER/i, name: "Deezer" },
  { pattern: /PARAMOUNT\s*\+?/i, name: "Paramount+" },
  { pattern: /GLOBOPLAY/i, name: "Globoplay" },
  { pattern: /STAR\s*\+?/i, name: "Star+" },
  { pattern: /TWITCH/i, name: "Twitch" },
  { pattern: /PLAYSTATION\s*(?:PLUS|NOW|NETWORK)/i, name: "PlayStation" },
  { pattern: /XBOX\s*(?:GAME\s*PASS|LIVE)/i, name: "Xbox" },
  { pattern: /NINTENDO/i, name: "Nintendo" },
  { pattern: /DROPBOX/i, name: "Dropbox" },
  { pattern: /MICROSOFT\s*(?:365|OFFICE)/i, name: "Microsoft 365" },
  { pattern: /ADOBE/i, name: "Adobe" },
  { pattern: /CANVA/i, name: "Canva" },
  { pattern: /NOTION/i, name: "Notion" },
  { pattern: /GITHUB/i, name: "GitHub" },
  { pattern: /HEADSPACE/i, name: "Headspace" },
  { pattern: /CALM/i, name: "Calm" },
  { pattern: /DUOLINGO/i, name: "Duolingo" },
  { pattern: /GYMPASS|WELLHUB/i, name: "Wellhub" },
  { pattern: /RAPPI\s*(?:PRIME|TURBO)/i, name: "Rappi Prime" },
  { pattern: /UBER\s*(?:ONE|PASS)/i, name: "Uber One" },
  { pattern: /NUBANK\s*VIDA/i, name: "Nubank Vida" },
  { pattern: /SEGURO\s*(?:AUTO|VIDA|RESIDENCIAL)/i, name: "Seguro" },
];

/**
 * Detect if a transaction is likely a recurring subscription
 */
export function detectRecurringTransaction(description: string): {
  isRecurring: boolean;
  recurringName?: string;
} {
  const upperDesc = description.toUpperCase();

  for (const { pattern, name } of RECURRING_PATTERNS) {
    if (pattern.test(upperDesc)) {
      return { isRecurring: true, recurringName: name };
    }
  }

  return { isRecurring: false };
}

// Patterns for credit card bill payments and internal transfers
const TRANSFER_PATTERNS: RegExp[] = [
  // Credit card bill payments
  /PAGTO?\s*(DE\s*)?(FATURA|CARTAO|CART[AÃ]O)/i,
  /PAGAMENTO\s*(DE\s*)?(FATURA|CARTAO|CART[AÃ]O)/i,
  /FATURA\s*(CARTAO|CART[AÃ]O|C6|ITAU|ITAÚ|BTG|NUBANK|BRADESCO|SANTANDER|BB|CAIXA|INTER|NEXT|ORIGINAL|PAN|NEON|DIGIO|WILL|XP)/i,
  /PAG\s*FAT/i,
  /(C6|ITAU|ITAÚ|BTG|NUBANK|BRADESCO|SANTANDER|BB|CAIXA|INTER|NEXT)\s*(CARTAO|CART[AÃ]O|FATURA)/i,
  /DEBITO\s*AUTO(MATICO)?\s*(CARTAO|CART[AÃ]O|FATURA)/i,
  // Internal transfers (between own accounts)
  /TRANSF\s*(ENTRE\s*)?(CONTAS?|PROPRIA|PRÓPRIA)/i,
  /TRANSFERENCIA\s*(ENTRE\s*)?(CONTAS?|PROPRIA|PRÓPRIA)/i,
  /APLICACAO|APLICAÇÃO|RESGATE/i,
  /INVEST(IMENTO)?\s*(CDB|LCI|LCA|TESOURO|POUPANCA|POUPANÇA)/i,
];

/**
 * Detect if a transaction is a transfer (credit card payment, internal transfer)
 */
export function detectTransfer(description: string): boolean {
  const upperDesc = description.toUpperCase();

  for (const pattern of TRANSFER_PATTERNS) {
    if (pattern.test(upperDesc)) {
      return true;
    }
  }

  return false;
}

export function detectInstallment(description: string): {
  isInstallment: boolean;
  currentInstallment?: number;
  totalInstallments?: number;
} {
  // Patterns for Brazilian credit card statements
  // Examples:
  // "EC *DEBORAEXCURSOES - Parcela 5/6"
  // "MP *MOBYDICK - Parcela 4/5"
  // "MERCADO*MULTIXIMPORTA - Parcela 4/12"
  // "SALLES TENIS SQUASH L - Parcela 4/6"
  // "RAIA DROGASIL SA - Parcela 2/3"

  const numberedPatterns = [
    // "- Parcela X/Y" or "– Parcela X/Y" (most common in Brazilian card statements)
    /[-–]\s*Parcela\s+(\d+)\s*[\/\\]\s*(\d+)/i,
    // "Parcela X/Y" anywhere
    /Parcela\s+(\d+)\s*[\/\\]\s*(\d+)/i,
    // "PARC X/Y" or "PARC X DE Y"
    /PARC(?:ELA)?\s*(\d+)\s*(?:[\/\\]|DE)\s*(\d+)/i,
    // "X/Y" format (generic, check last)
    /(\d+)\s*[\/\\]\s*(\d+)/,
    // "X DE Y" format
    /(\d+)\s*DE\s*(\d+)/i,
  ];

  for (const pattern of numberedPatterns) {
    const match = description.match(pattern);
    if (match) {
      const current = parseInt(match[1], 10);
      const total = parseInt(match[2], 10);

      // Validate: current must be <= total, total must be > 1 (at least 2 installments)
      // and total should be reasonable (max 48 installments is common in Brazil)
      if (current > 0 && total > 1 && current <= total && total <= 48) {
        return {
          isInstallment: true,
          currentInstallment: current,
          totalInstallments: total,
        };
      }
    }
  }

  // Detect "- Parcela" without number (common in C6 credit card statements)
  // This marks it as installment but without knowing which one
  if (/[-–]\s*Parcela\s*$/i.test(description) || /\bParcela\s*$/i.test(description)) {
    return { isInstallment: true };
  }

  return { isInstallment: false };
}

export const defaultCategories = [
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

export const defaultInvestmentCategories = [
  { name: "Renda Fixa", color: "#3B82F6", icon: "landmark" },
  { name: "Renda Variável", color: "#8B5CF6", icon: "trending-up" },
  { name: "Cripto", color: "#F97316", icon: "bitcoin" },
  { name: "Previdência", color: "#10B981", icon: "shield" },
];

export const defaultRules = [
  { keyword: "UBER", category: "Transporte" },
  { keyword: "99", category: "Transporte" },
  { keyword: "CABIFY", category: "Transporte" },
  { keyword: "IFOOD", category: "Alimentacao" },
  { keyword: "RAPPI", category: "Alimentacao" },
  { keyword: "AIQFOME", category: "Alimentacao" },
  { keyword: "ZDELIVERY", category: "Alimentacao" },
  { keyword: "MERCADOLIVRE", category: "Compras" },
  { keyword: "MERCADO LIVRE", category: "Compras" },
  { keyword: "MERCADOPAGO", category: "Compras" },
  { keyword: "SUPERMERCADO", category: "Mercado" },
  { keyword: "CARREFOUR", category: "Mercado" },
  { keyword: "EXTRA", category: "Mercado" },
  { keyword: "PAO DE ACUCAR", category: "Mercado" },
  { keyword: "ASSAI", category: "Mercado" },
  { keyword: "ATACADAO", category: "Mercado" },
  { keyword: "MERCADO", category: "Mercado" },
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
  { keyword: "MAGAZINE LUIZA", category: "Compras" },
  { keyword: "MAGALU", category: "Compras" },
  { keyword: "CASAS BAHIA", category: "Compras" },
];

/**
 * Initialize default categories and rules for a new user.
 * This should be called after user registration.
 */
export async function initializeUserDefaults(userId: string): Promise<void> {
  // Check if user already has categories
  const existingCategories = await prisma.category.count({
    where: { userId },
  });

  if (existingCategories > 0) {
    return; // User already has categories, skip initialization
  }

  // Create a map to store category name -> id for rule creation
  const categoryMap = new Map<string, string>();

  // Create default categories for the user
  for (const category of defaultCategories) {
    const created = await prisma.category.create({
      data: {
        name: category.name,
        color: category.color,
        icon: category.icon,
        userId,
      },
    });
    categoryMap.set(category.name, created.id);
  }

  // Create default rules for the user
  for (const rule of defaultRules) {
    const categoryId = categoryMap.get(rule.category);
    if (categoryId) {
      await prisma.categoryRule.create({
        data: {
          keyword: rule.keyword.toUpperCase(),
          categoryId,
          userId,
        },
      });
    }
  }

  // Create default investment categories for the user
  for (const category of defaultInvestmentCategories) {
    await prisma.investmentCategory.create({
      data: {
        name: category.name,
        color: category.color,
        icon: category.icon,
        isDefault: false,
        userId,
      },
    });
  }

  // Invalidate cache for this user
  invalidateRulesCache(userId);
}

// Cache flag to avoid repeated database checks
let investmentCategoriesInitialized = false;

/**
 * Ensure global default investment categories exist.
 * This is called on first access to ensure defaults are available.
 * Uses in-memory caching to run only once per server instance.
 * Fails silently to not break the app if there are database issues.
 */
export async function ensureDefaultInvestmentCategories(): Promise<void> {
  if (investmentCategoriesInitialized) return;

  try {
    // Single query to get all existing default categories
    const existing = await prisma.investmentCategory.findMany({
      where: { userId: null, isDefault: true },
      select: { name: true },
    });

    const existingNames = new Set(existing.map((c) => c.name));
    const toCreate = defaultInvestmentCategories.filter(
      (c) => !existingNames.has(c.name)
    );

    if (toCreate.length > 0) {
      await prisma.investmentCategory.createMany({
        data: toCreate.map((c) => ({
          name: c.name,
          color: c.color,
          icon: c.icon,
          isDefault: true,
          userId: null,
        })),
        skipDuplicates: true,
      });
    }

    investmentCategoriesInitialized = true;
  } catch (error) {
    // Log but don't throw - categories can be fetched without defaults
    console.error("Failed to ensure default investment categories:", error);
    // Still mark as initialized to avoid repeated attempts
    investmentCategoriesInitialized = true;
  }
}
