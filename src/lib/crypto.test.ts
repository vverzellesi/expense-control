import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Store original env
const originalEnv = process.env.PDF_ENCRYPTION_KEY;

// Generate a valid 32-byte hex key for tests
const TEST_KEY = "a".repeat(64); // 32 bytes in hex

describe("crypto", () => {
  beforeEach(() => {
    process.env.PDF_ENCRYPTION_KEY = TEST_KEY;
    // Re-import to pick up env changes
    vi.resetModules();
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.PDF_ENCRYPTION_KEY = originalEnv;
    } else {
      delete process.env.PDF_ENCRYPTION_KEY;
    }
  });

  it("encrypts and decrypts a string correctly", async () => {
    const { encrypt, decrypt } = await import("./crypto");
    const plaintext = "12345678";
    const { encrypted, iv } = encrypt(plaintext);

    expect(encrypted).not.toBe(plaintext);
    expect(iv).toHaveLength(32); // 16 bytes = 32 hex chars

    const decrypted = decrypt(encrypted, iv);
    expect(decrypted).toBe(plaintext);
  });

  it("produces different ciphertexts for same plaintext (random IV)", async () => {
    const { encrypt } = await import("./crypto");
    const result1 = encrypt("same-text");
    const result2 = encrypt("same-text");

    expect(result1.encrypted).not.toBe(result2.encrypted);
    expect(result1.iv).not.toBe(result2.iv);
  });

  it("throws when PDF_ENCRYPTION_KEY is not set", async () => {
    delete process.env.PDF_ENCRYPTION_KEY;
    const { encrypt } = await import("./crypto");

    expect(() => encrypt("test")).toThrow("PDF_ENCRYPTION_KEY");
  });

  it("handles UTF-8 characters correctly", async () => {
    const { encrypt, decrypt } = await import("./crypto");
    const plaintext = "123.456.789-00 Ação!@#çÇ";
    const { encrypted, iv } = encrypt(plaintext);
    const decrypted = decrypt(encrypted, iv);
    expect(decrypted).toBe(plaintext);
  });

  it("throws on decryption with wrong key", async () => {
    const { encrypt } = await import("./crypto");
    const { encrypted, iv } = encrypt("secret");

    // Change key
    process.env.PDF_ENCRYPTION_KEY = "b".repeat(64);
    vi.resetModules();
    const { decrypt } = await import("./crypto");

    expect(() => decrypt(encrypted, iv)).toThrow();
  });
});
