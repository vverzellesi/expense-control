/**
 * Desligamento da integração Pluggy. SIMULAÇÃO por padrão: só age com --apply.
 * Banco: DATABASE_URL; produção só com --prod.
 *
 * Uso (da raiz do repositório):
 *   npx tsx --tsconfig tsconfig.json scripts/pluggy/revoke.ts [--prod]
 *       Mostra o que seria feito.
 *   ... revoke.ts --apply [--prod]
 *       Pede confirmação digitada e então, nesta ordem:
 *       1. desativa todos os vínculos do dono (nenhuma escrita nova da sincronização);
 *       2. espera não haver sincronização em andamento e toma o lease, para impedir outra;
 *       3. apaga o item na Pluggy (dados e consentimento);
 *       4. confere com getItem que o item não existe mais;
 *       5. libera o lease.
 *   Os lançamentos já importados continuam no My Pocket.
 */
import { createPluggyClientFromEnv, missingPluggyEnv, PluggyApiError } from "@/lib/pluggy/client";
import { acquirePluggyLease, lockUserForPluggy, releasePluggyLease } from "@/lib/pluggy/lease";
import { describeSyncError } from "@/lib/pluggy/sync";
import { confirmTyped, fail, hasFlag, loadEnvVars, openDatabase, requireOwner } from "./cli";

const PLUGGY_VARS = ["PLUGGY_CLIENT_ID", "PLUGGY_CLIENT_SECRET", "PLUGGY_ITEM_ID"] as const;
const CONFIRMATION = "APAGAR CONEXAO";
const WAIT_TIMEOUT_MS = 10 * 60 * 1000;
const POLL_MS = 5_000;
const REVOKE_LEASE_TTL_MS = 5 * 60 * 1000;

const sleep = (ms: number) => new Promise<void>((resolveSleep) => setTimeout(resolveSleep, ms));

async function main(): Promise<void> {
  const apply = hasFlag("apply");
  loadEnvVars(PLUGGY_VARS);
  const missing = missingPluggyEnv(PLUGGY_VARS);
  if (missing.length > 0) fail("Faltam variáveis no .env: " + missing.join(", ") + ". Nada foi feito.");
  const owner = requireOwner();
  const target = await openDatabase();
  const itemId = process.env.PLUGGY_ITEM_ID!.trim();

  try {
    const links = await target.db.pluggyAccountLink.findMany({
      where: { userId: owner },
      select: { id: true, itemId: true, enabled: true },
    });
    const otherItems = new Set(links.filter((link) => link.itemId !== itemId).map((link) => link.itemId));
    const running = await target.db.pluggySyncRun.count({ where: { userId: owner, status: "running" } });
    console.log("Banco: " + target.label);
    console.log("Vínculos do dono: " + links.length + " (ativos: " + links.filter((l) => l.enabled).length + ")");
    console.log("Execuções marcadas como em andamento: " + running);
    if (otherItems.size > 0) {
      console.log("Atenção: " + otherItems.size + " vínculo(s) apontam para outro item; só o item de PLUGGY_ITEM_ID será apagado.");
    }
    console.log("\nSerá feito: desativar os vínculos, esperar a sincronização em andamento, apagar o item na Pluggy e conferir.");
    if (!apply) {
      console.log("Simulação: nada foi feito. Use --apply para executar.");
      return;
    }

    const confirmed = await confirmTyped('Para confirmar, digite "' + CONFIRMATION + '": ', CONFIRMATION);
    if (!confirmed) fail("Confirmação não conferiu. Nada foi feito.");

    await target.db.$transaction(async (tx) => {
      await lockUserForPluggy(tx, owner);
      await tx.pluggyAccountLink.updateMany({ where: { userId: owner, enabled: true }, data: { enabled: false } });
    });
    console.log("1/4 vínculos desativados.");

    const deadline = Date.now() + WAIT_TIMEOUT_MS;
    let token: string | null = null;
    while (!token) {
      token = await acquirePluggyLease(target.db, owner, REVOKE_LEASE_TTL_MS);
      if (token) break;
      if (Date.now() > deadline) fail("Uma sincronização segue em andamento após 10 minutos. O item NÃO foi apagado; rode de novo.");
      await sleep(POLL_MS);
    }
    console.log("2/4 nenhuma sincronização em andamento.");

    try {
      const client = createPluggyClientFromEnv();
      await client.deleteItem(itemId);
      console.log("3/4 item apagado na Pluggy.");
      try {
        await client.getItem(itemId);
        fail("4/4 o item ainda aparece na Pluggy. Confira no painel e rode de novo.");
      } catch (error) {
        if (error instanceof PluggyApiError && error.kind === "http" && error.status === 404) {
          console.log("4/4 conferido: o item não existe mais.");
        } else {
          throw error;
        }
      }
    } finally {
      await releasePluggyLease(target.db, owner, token).catch(() => undefined);
    }
  } finally {
    await target.db.$disconnect();
  }
}

main().catch((error) => {
  console.error("revoke.ts falhou: " + describeSyncError(error));
  process.exit(1);
});

