import { describe, expect, it } from "vitest";
import { authConfig } from "./auth.config";

function isAllowed(pathname: string, loggedIn = false): boolean {
  const authorized = authConfig.callbacks.authorized as (args: unknown) => boolean;
  return authorized({
    auth: loggedIn ? { user: { id: "user_test_1" } } : null,
    request: { nextUrl: new URL(pathname, "http://localhost") },
  });
}

describe("authConfig.authorized — rotas da Pluggy", () => {
  it("libera sem sessão exatamente o cron e o webhook da Pluggy", () => {
    expect(isAllowed("/api/cron/pluggy-sync")).toBe(true);
    expect(isAllowed("/webhooks/pluggy")).toBe(true);
  });

  it("não libera prefixos, variações nem outros caminhos vizinhos", () => {
    for (const path of [
      "/api/cron/pluggy-sync/",
      "/api/cron/pluggy-sync/extra",
      "/api/cron/pluggy-syncx",
      "/api/cron",
      "/api/cron/outro",
      "/webhooks/pluggy/",
      "/webhooks/pluggy/extra",
      "/webhooks/pluggyx",
      "/webhooks",
      "/webhooks/outro",
      "/api/webhooks/pluggy",
    ]) {
      expect(isAllowed(path)).toBe(false);
    }
  });

  it("mantém a regra existente para o resto", () => {
    expect(isAllowed("/dashboard")).toBe(false);
    expect(isAllowed("/dashboard", true)).toBe(true);
    expect(isAllowed("/api/telegram/webhook")).toBe(true);
  });
});

