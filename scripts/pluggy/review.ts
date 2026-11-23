/**
 * Revisão dos registros da Pluggy em needs_review. SIMULAÇÃO por padrão: só grava com --apply.
 * Banco: DATABASE_URL; produção só com --prod. Os dados aparecem só no terminal.
 *
 * Uso (da raiz do repositório):
 *   npx tsx --tsconfig tsconfig.json scripts/pluggy/review.ts [--prod]
 *       Lista os itens em revisão.
 *   ... review.ts --id <vínculo> --action create --type EXPENSE|INCOME|TRANSFER [--category <id>] [--amount 12.34] [--apply]
 *       Cria o lançamento (categoria informada, ou sugerida pelas regras do dono). Registro em
 *       moeda estrangeira exige --amount com o valor em reais. Parcela entra como lançamento avulso.
 *   ... review.ts --id <vínculo> --action link --transaction <id> [--apply]
 *       Vincula a um lançamento já existente do mesmo origin, ainda sem vínculo.
 *   ... review.ts --id <vínculo> --action restore [--apply]
 *       Restaura o lançamento já vinculado que foi apagado (ex.: exclusion_reverted).
 *   ... review.ts --id <vínculo> --action ignore [--apply]
 *       Ignora o registro de vez (não volta para revisão nas próximas sincronizações).
 *
 * A gravação toma o lease da sincronização: se uma sincronização estiver rodando, espere
 * ela terminar e rode de novo.
 */
import type { Prisma } from "@prisma/client";
import { acquirePluggyLease, assertPluggyLeaseHeld, lockUserForPluggy, releasePluggyLease } from "@/lib/pluggy/lease";
import {
  businessDayKey,
  loadAccountContext,
  loadPersonalRules,
  signedCents,
  suggestPersonalCategory,
} from "@/lib/pluggy/store";
import { describeSyncError } from "@/lib/pluggy/sync";
import { formatCurrency } from "@/lib/utils";
import { abort, argValue, hasFlag, openDatabase, requireOwner, ScriptAbort, type ScriptDatabase } from "./cli";

/** Destino de "ignorar": superseded não é reavaliado pela sincronização. */
export const MANUAL_IGNORE = { disposition: "superseded", reasonCode: "manual_ignore" } as const;
const MANUAL_REASON = "manual_review";
const REVIEW_LEASE_TTL_MS = 2 * 60 * 1000;

type LinkWithAccount = Prisma.PluggyTransactionLinkGetPayload<{ include: { accountLink: { include: { origin: true } } } }>;

function formatDay(date: Date): string {
  const [y, m, d] = businessDayKey(date).split("-");
  return d + "/" + m + "/" + y;
}

function printLink(link: LinkWithAccount, index?: number, local?: { deleted: boolean } | null): void {
  const cents = link.direction === "DEBIT" ? -link.sourceAmountCents : link.sourceAmountCents;
  const installment = link.installmentNumber ? " (" + link.installmentNumber + "/" + link.totalInstallments + ")" : "";
  const amount = link.currencyCode === "BRL" ? formatCurrency(cents / 100) : link.currencyCode + " " + (cents / 100).toFixed(2);
  console.log(
    (index !== undefined ? String(index + 1).padStart(3) + ". " : "") +
      formatDay(link.ledgerDate) + "  " + amount.padStart(14) + "  " +
      link.accountLink.accountType + " → " + link.accountLink.origin.name + "  [" + (link.reasonCode ?? "—") + "]"
  );
  const attached = link.transactionId
    ? "  lançamento vinculado " + (local === undefined ? "" : local === null ? "(não encontrado)" : local.deleted ? "(apagado)" : "(ativo)")
    : "";
  console.log("       " + link.sourceDescription + installment + "  vínculo: " + link.id + attached);
}

async function listPending(target: ScriptDatabase, owner: string): Promise<void> {
  const links = await target.db.pluggyTransactionLink.findMany({
    where: { disposition: "needs_review", accountLink: { userId: owner } },
    include: { accountLink: { include: { origin: true } } },
    orderBy: [{ ledgerDate: "asc" }, { id: "asc" }],
  });
  const ids = links.map((l) => l.transactionId).filter((id): id is string => !!id);
  const locals = new Map(
    (await target.db.transaction.findMany({ where: { id: { in: ids }, userId: owner }, select: { id: true, deletedAt: true } })).map((t) => [
      t.id,
      { deleted: t.deletedAt !== null },
    ])
  );
  console.log("Banco: " + target.label);
  console.log("Itens em revisão: " + links.length + "\n");
  links.forEach((link, index) => printLink(link, index, link.transactionId ? locals.get(link.transactionId) ?? null : undefined));
}

type Action =
  | { kind: "create"; type: "EXPENSE" | "INCOME" | "TRANSFER"; categoryId: string | null; amountCents: number | null }
  | { kind: "link"; transactionId: string }
  | { kind: "restore" }
  | { kind: "ignore" };

function parseAction(): Action {
  const action = argValue("action");
  if (action === "create") {
    const type = argValue("type");
    if (type !== "EXPENSE" && type !== "INCOME" && type !== "TRANSFER") abort("--type precisa ser EXPENSE, INCOME ou TRANSFER.");
    const amount = argValue("amount");
    let amountCents: number | null = null;
    if (amount !== undefined) {
      if (!/^\d{1,9}(?:\.\d{1,2})?$/.test(amount)) abort("--amount precisa ser um valor positivo em reais, como 12.34.");
      amountCents = Math.round(Number(amount) * 100);
      if (amountCents <= 0) abort("--amount precisa ser maior que zero.");
    }
    return { kind: "create", type, categoryId: argValue("category") ?? null, amountCents };
  }
  if (action === "link") {
    const transactionId = argValue("transaction");
    if (!transactionId) abort("Informe --transaction <id>.");
    return { kind: "link", transactionId };
  }
  if (action === "restore") return { kind: "restore" };
  if (action === "ignore") return { kind: "ignore" };
  return abort("--action precisa ser create, link, restore ou ignore.");
}

async function loadReviewLink(client: Prisma.TransactionClient | ScriptDatabase["db"], owner: string, id: string) {
  const link = await client.pluggyTransactionLink.findFirst({
    where: { id, accountLink: { userId: owner } },
    include: { accountLink: { include: { origin: true } } },
  });
  if (!link) abort("Vínculo não encontrado entre os do dono.");
  if (link.disposition !== "needs_review") abort("Este vínculo não está mais em revisão.");
  return link;
}

async function resolve(target: ScriptDatabase, owner: string, id: string, apply: boolean): Promise<void> {
  const action = parseAction();
  const preview = await loadReviewLink(target.db, owner, id);
  console.log("Banco: " + target.label);
  printLink(preview);
  if (action.kind === "create" && preview.currencyCode !== "BRL" && action.amountCents === null) {
    abort("Registro em moeda estrangeira: informe --amount com o valor em reais.");
  }
  if (action.kind === "create" && preview.installmentNumber) {
    console.log("Atenção: parcela entra como lançamento avulso, sem grupo nem projeções das próximas parcelas.");
  }
  console.log(
    "\nAção: " +
      (action.kind === "create"
        ? "criar lançamento " + action.type + (action.categoryId ? " com a categoria informada" : " com categoria sugerida pelas regras")
        : action.kind === "link"
          ? "vincular ao lançamento existente informado"
          : action.kind === "restore"
            ? "restaurar o lançamento vinculado"
            : "ignorar de vez")
  );
  if (!apply) {
    console.log("Simulação: nada foi gravado. Use --apply para gravar.");
    return;
  }

  const token = await acquirePluggyLease(target.db, owner, REVIEW_LEASE_TTL_MS);
  if (!token) abort("Há uma sincronização em andamento. Espere ela terminar e rode de novo.");
  try {
    await target.db.$transaction(async (tx) => {
      await lockUserForPluggy(tx, owner);
      await assertPluggyLeaseHeld(tx, owner, token);
      const link = await loadReviewLink(tx, owner, id);
      const ctx = await loadAccountContext(tx, owner, link.accountLinkId);

      if (action.kind === "ignore") {
        await tx.pluggyTransactionLink.update({ where: { id: link.id }, data: { ...MANUAL_IGNORE } });
        return;
      }

      if (action.kind === "restore") {
        if (!link.transactionId) abort("Este vínculo não tem lançamento para restaurar.");
        const restored = await tx.transaction.updateMany({
          where: { id: link.transactionId, userId: owner, spaceId: null, deletedAt: { not: null } },
          data: { deletedAt: null },
        });
        if (restored.count !== 1) abort("O lançamento vinculado não está apagado (ou não é pessoal do dono).");
        // adopted: a sincronização nunca apaga sozinha um lançamento adotado.
        await tx.pluggyTransactionLink.update({ where: { id: link.id }, data: { disposition: "adopted", reasonCode: MANUAL_REASON } });
        return;
      }

      if (action.kind === "create" && link.transactionId) {
        const current = await tx.transaction.findFirst({ where: { id: link.transactionId, userId: owner, deletedAt: null }, select: { id: true } });
        if (current) abort("Este vínculo já tem lançamento ativo: use link, restore ou ignore.");
      }

      if (action.kind === "link") {
        const target_ = await tx.transaction.findFirst({
          where: {
            id: action.transactionId,
            userId: owner,
            spaceId: null,
            deletedAt: null,
            origin: { in: ctx.originNames },
            pluggyLinks: { none: { disposition: { not: "superseded" } } },
          },
          select: { id: true },
        });
        if (!target_) abort("Lançamento não encontrado: precisa ser pessoal do dono, do mesmo origin, não apagado e sem vínculo Pluggy.");
        await tx.pluggyTransactionLink.update({
          where: { id: link.id },
          data: { transactionId: target_.id, disposition: "adopted", reasonCode: MANUAL_REASON },
        });
        return;
      }

      let categoryId: string | null = null;
      let categorySource: string | null = null;
      if (action.categoryId) {
        const category = await tx.category.findFirst({ where: { id: action.categoryId, userId: owner, spaceId: null } });
        if (!category) abort("Categoria não encontrada entre as categorias pessoais do dono.");
        categoryId = category.id;
        categorySource = "manual";
      } else {
        categoryId = suggestPersonalCategory(link.sourceDescription, await loadPersonalRules(tx, owner));
        categorySource = categoryId ? "rule" : null;
      }
      const cents = signedCents({
        type: action.type,
        direction: link.direction as "DEBIT" | "CREDIT",
        amountCents: action.amountCents ?? link.sourceAmountCents,
      });
      const created = await tx.transaction.create({
        data: {
          userId: owner,
          spaceId: null,
          description: link.sourceDescription,
          amount: cents / 100,
          type: action.type,
          date: link.ledgerDate,
          origin: ctx.originName,
          categoryId,
          categorySource,
          isFixed: false,
          isInstallment: false,
        },
        select: { id: true },
      });
      await tx.pluggyTransactionLink.update({
        where: { id: link.id },
        data: { transactionId: created.id, disposition: "created", reasonCode: MANUAL_REASON },
      });
    });
  } finally {
    await releasePluggyLease(target.db, owner, token).catch(() => undefined);
  }
  console.log("Gravado.");
}

async function main(): Promise<void> {
  const apply = hasFlag("apply");
  const owner = requireOwner();
  const target = await openDatabase();
  try {
    const id = argValue("id");
    if (id) await resolve(target, owner, id, apply);
    else await listPending(target, owner);
  } finally {
    await target.db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof ScriptAbort ? error.message : "review.ts falhou: " + describeSyncError(error));
  process.exit(1);
});

