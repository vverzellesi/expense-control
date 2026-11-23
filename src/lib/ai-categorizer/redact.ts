/**
 * Minimização do que sai do servidor para o provedor de IA (pura, sem I/O).
 *
 * A descrição do banco é dado não confiável e pode carregar identificadores
 * pessoais. Antes de qualquer envio: remove CPF/CNPJ, telefones, e-mails,
 * sequências de 6 ou mais dígitos, valores com centavos e dia/mês, normaliza
 * espaços e trunca. Descrição que não puder ser minimizada com segurança
 * (transferência ou carteira de pagamento entre pessoas, onde costuma vir nome
 * de pessoa) ou que fique com menos de 3 letras não vai para a IA.
 */

export const MAX_DESCRIPTION_LENGTH = 80;
const MIN_LETTERS = 3;

// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u001f\u007f]/g;
const EMAIL_RE = /[^\s@]+@[^\s@]+\.[^\s@]+/g;
const CNPJ_RE = /\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/g;
const CPF_RE = /\d{3}\.?\d{3}\.?\d{3}-?\d{2}/g;
const PHONE_RE = /(?:\+?\d{2}[\s.-]?)?\(\d{2}\)[\s.-]?9?\d{4}[\s.-]?\d{4}/g;
/** Valor com centavos (37,42 ou 1.234,56) e o símbolo da moeda. */
const DECIMAL_RE = /\d+(?:\.\d{3})*,\d{2}/g;
const CURRENCY_RE = /R\$/gi;
/** Qualquer sequência de 6+ dígitos, mesmo separada por espaço, ponto, hífen ou barra. */
const LONG_DIGITS_RE = /\+?\d(?:[\s./-]?\d){5,}/g;
/** Dia/mês (12/03) ou marcador de parcela (3/10): irrelevante para a categoria. */
const DAY_MONTH_RE = /\d{1,2}\/\d{1,2}/g;
/** Letras latinas, com acento (o tsconfig não permite a flag "u"). */
const LETTER = "A-Za-z\u00c0-\u00d6\u00d8-\u00f6\u00f8-\u00ff";
const LETTERS_RE = new RegExp("[" + LETTER + "]", "g");
/** Referências de transferência costumam trazer o nome da contraparte: ficam fora da IA. */
const TRANSFER_RE = new RegExp(
  "(?:^|[^" + LETTER + "])(?:PIX|TED|DOC|TRANSF[" + LETTER + "]*)(?:[^" + LETTER + "]|$)",
  "i"
);
/** Carteira usada sobretudo para pagar pessoas: o texto depois do prefixo costuma ser um nome. */
const PERSON_WALLET_RE = /^\s*PIC\s*PAY/i;

/** Descrição minimizada, ou null quando o item deve ficar fora da IA. */
export function minimizeDescription(raw: string): string | null {
  if (typeof raw !== "string") return null;
  if (TRANSFER_RE.test(raw)) return null;
  if (PERSON_WALLET_RE.test(raw)) return null;
  const cleaned = raw
    .replace(CONTROL_RE, " ")
    .replace(EMAIL_RE, " ")
    .replace(CNPJ_RE, " ")
    .replace(CPF_RE, " ")
    .replace(PHONE_RE, " ")
    .replace(DECIMAL_RE, " ")
    .replace(LONG_DIGITS_RE, " ")
    .replace(DAY_MONTH_RE, " ")
    .replace(CURRENCY_RE, " ")
    .replace(/\s+/g, " ")
    .trim();
  const truncated = Array.from(cleaned).slice(0, MAX_DESCRIPTION_LENGTH).join("").trim();
  const letters = truncated.match(LETTERS_RE)?.length ?? 0;
  return letters >= MIN_LETTERS ? truncated : null;
}

export type AmountRange = "até 50" | "50 a 200" | "200 a 1000" | "acima de 1000";

/** Faixa de valor em reais (o valor exato nunca sai do servidor). */
export function amountRange(amountCents: number): AmountRange {
  const cents = Math.abs(amountCents);
  if (cents <= 5_000) return "até 50";
  if (cents <= 20_000) return "50 a 200";
  if (cents <= 100_000) return "200 a 1000";
  return "acima de 1000";
}
