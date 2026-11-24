/**
 * Categorização assistida dos lançamentos da Pluggy que as regras não resolveram.
 * Quem decide é a rotina do Claude Code do dono (skill .claude/skills/mypocket-categorizar),
 * fora do app; este script só exporta os pendentes e aplica as decisões validadas.
 *
 * Uso (da raiz do repositório):
 *   npx tsx --tsconfig tsconfig.json scripts/pluggy/categorize.ts --export [--incluir-conta] [--incluir-pessoas] [--refazer-tentadas] [--limite 150] [--prod]
 *   npx tsx --tsconfig tsconfig.json scripts/pluggy/categorize.ts --apply-decisions <arquivo> [--apply] [--prod]
 *
 *   --export            somente leitura no banco; grava personal/pluggy/categorizar-pendentes.json (o que a rotina lê)
 *                       e personal/pluggy/categorizar-mapa.json (mapa privado chave → id, que a rotina não precisa ler)
 *   --incluir-conta     inclui a conta corrente além do cartão
 *   --incluir-pessoas   inclui transferências e carteiras entre pessoas (PIX, TED, PicPay...); documentos,
 *                       telefones, e-mails e sequências longas de dígitos continuam removidos
 *   --refazer-tentadas  reexporta o que a rotina já tentou sem resultado nos últimos 30 dias
 *   --limite N          máximo de itens por exportação (padrão 150, mais recentes primeiro)
 *   --apply-decisions   valida o arquivo de decisões contra o mapa da última exportação;
 *                       SIMULAÇÃO por padrão, grava só com --apply (confiança "alta")
 *   --prod              usa DATABASE_URL_PROD em vez de DATABASE_URL
 *
 * Arquivos ficam em personal/ (conferido com git check-ignore). No terminal saem só contagens.
 */
import { readFileSync } from "fs";
import { applyDecisions, buildExport, DEFAULT_EXPORT_LIMIT, type PrivateMap } from "@/lib/category-assist";
import { argValue, assertPersonalPath, fail, hasFlag, openDatabase, requireOwner, writePersonalReport } from "./cli";

const PENDING_PATH = "personal/pluggy/categorizar-pendentes.json";
const MAP_PATH = "personal/pluggy/categorizar-mapa.json";

function readJson(path: string, label: string): unknown {
  const absolute = assertPersonalPath(path);
  try {
    return JSON.parse(readFileSync(absolute, "utf8"));
  } catch {
    fail("Não foi possível ler " + label + " (" + path + "). Nada foi feito.");
  }
}

function parseLimit(): number {
  const raw = argValue("limite");
  if (raw === undefined) {
    if (hasFlag("limite")) fail("--limite precisa de um número.");
    return DEFAULT_EXPORT_LIMIT;
  }
  if (!/^\d+$/.test(raw) || Number(raw) < 1) fail("--limite precisa ser um número inteiro positivo.");
  return Number(raw);
}

async function main(): Promise<void> {
  const doExport = hasFlag("export");
  const decisionsPath = argValue("apply-decisions");
  if (hasFlag("apply-decisions") && !decisionsPath) fail("--apply-decisions precisa do caminho do arquivo de decisões.");
  if (doExport === Boolean(decisionsPath)) fail("Use --export ou --apply-decisions <arquivo> (um dos dois).");
  if (doExport && hasFlag("apply")) fail("--apply só vale com --apply-decisions.");
  for (const flag of ["incluir-conta", "incluir-pessoas", "refazer-tentadas", "limite"]) {
    if (!doExport && hasFlag(flag)) fail("--" + flag + " só vale com --export.");
  }

  const owner = requireOwner();
  // Confere os caminhos antes de abrir o banco.
  assertPersonalPath(PENDING_PATH);
  assertPersonalPath(MAP_PATH);
  const limit = doExport ? parseLimit() : DEFAULT_EXPORT_LIMIT;
  const decisions = decisionsPath ? readJson(decisionsPath, "o arquivo de decisões") : null;
  const map = decisionsPath ? (readJson(MAP_PATH, "o mapa da última exportação") as PrivateMap) : null;

  const target = await openDatabase();
  try {
    if (doExport) {
      const includeBank = hasFlag("incluir-conta");
      const includePeople = hasFlag("incluir-pessoas");
      const retryAttempted = hasFlag("refazer-tentadas");
      const { pending, map: privateMap, counts } = await buildExport(target.db, {
        ownerUserId: owner,
        includeBank,
        includePeople,
        retryAttempted,
        limit,
      });
      // Mapa antes dos pendentes: se a segunda escrita falhar, a aplicação recusa por exportação diferente.
      writePersonalReport(MAP_PATH, JSON.stringify(privateMap, null, 2) + "\n");
      writePersonalReport(PENDING_PATH, JSON.stringify(pending, null, 2) + "\n");
      console.log(
        "Banco: " + target.label + " | exportação (somente leitura) | " + (includeBank ? "cartão e conta corrente" : "só cartão") +
          (includePeople ? " | com pessoas" : "") + (retryAttempted ? " | refazendo tentadas" : "")
      );
      console.log(Object.entries(counts).map(([name, n]) => name + "=" + n).join(" "));
      console.log("Pendentes para a rotina: " + PENDING_PATH);
      return;
    }

    const apply = hasFlag("apply");
    const result = await applyDecisions(target.db, { ownerUserId: owner, mode: apply ? "apply" : "simulate", map: map!, decisions });
    const c = result.counts;
    console.log("Banco: " + target.label + " | modo: " + (apply ? "gravação" : "simulação") + (result.error ? " | erro: " + result.error : ""));
    console.log(
      (apply ? "aplicadas=" : "aplicariam=") + c.aplicadas + " abstenções=" + c.abstencoes + " baixaConfiança=" + c.baixaConfianca +
        " descartadas=" + c.descartadas + " conflitos=" + c.conflitos + " semDecisão=" + c.semDecisao
    );
    if (result.error) process.exitCode = 1;
  } finally {
    await target.db.$disconnect();
  }
}

main().catch((error) => {
  console.error("categorize.ts falhou: " + (error instanceof Error ? error.name : typeof error));
  process.exit(1);
});
