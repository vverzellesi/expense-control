/**
 * Datas de calendário da integração Pluggy, sempre no fuso de negócio
 * America/Sao_Paulo e sem depender do fuso do processo (a Vercel roda em UTC;
 * a máquina local pode estar em qualquer outro).
 *
 * Todas as funções trabalham com strings "YYYY-MM-DD" para não haver
 * conversão implícita para o fuso local.
 */

export const BUSINESS_TIME_ZONE = "America/Sao_Paulo";

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
// Meia-noite UTC explícita ("...T00:00:00Z", "...T00:00:00.000+00:00"):
// a fonte está informando só o dia, e não um instante às 21h do dia anterior.
const UTC_MIDNIGHT = /^(\d{4}-\d{2}-\d{2})T00:00(?::00(?:\.0+)?)?(?:Z|[+-]00:?00)$/;
// Data e hora sem fuso: hora de parede, vale o dia escrito.
const FLOATING = /^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/;

const formatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: BUSINESS_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1) return false;
  return day <= daysInMonth(year, month);
}

/**
 * Converte uma data da Pluggy para o dia de calendário em São Paulo.
 * Devolve null se a entrada não for uma data reconhecível.
 */
export function toBusinessDate(value: string): string | null {
  const trimmed = value.trim();
  const dateOnly = DATE_ONLY.exec(trimmed);
  if (dateOnly) {
    const [, y, m, d] = dateOnly;
    return isValidCalendarDate(Number(y), Number(m), Number(d)) ? trimmed : null;
  }
  const utcMidnight = UTC_MIDNIGHT.exec(trimmed);
  if (utcMidnight) return toBusinessDate(utcMidnight[1]);
  const floating = FLOATING.exec(trimmed);
  if (floating) return toBusinessDate(floating[1]);

  const ms = Date.parse(trimmed);
  if (Number.isNaN(ms)) return null;
  return formatter.format(new Date(ms));
}

/**
 * Soma meses a uma data "YYYY-MM-DD" sem transbordar o fim do mês:
 * 31/01 + 1 mês = 28/02 (ou 29/02 em ano bissexto), nunca 03/03.
 */
export function addMonthsToDate(date: string, months: number): string {
  const match = DATE_ONLY.exec(date);
  if (!match || !Number.isInteger(months)) {
    throw new Error("addMonthsToDate: data ou quantidade de meses inválida");
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!isValidCalendarDate(year, month, day)) {
    throw new Error("addMonthsToDate: data ou quantidade de meses inválida");
  }
  const monthIndex = year * 12 + (month - 1) + months;
  const targetYear = Math.floor(monthIndex / 12);
  const targetMonth = (monthIndex % 12) + 1;
  const targetDay = Math.min(day, daysInMonth(targetYear, targetMonth));
  return [
    String(targetYear).padStart(4, "0"),
    String(targetMonth).padStart(2, "0"),
    String(targetDay).padStart(2, "0"),
  ].join("-");
}
