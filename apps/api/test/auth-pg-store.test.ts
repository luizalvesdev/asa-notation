import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { applyMigrations } from "./migrations.js";
import { PgAuthStore } from "../src/auth/pg-store.js";

describe("PgAuthStore", () => {
  let db: PGlite;
  let store: PgAuthStore;

  beforeAll(async () => {
    db = new PGlite();
    await applyMigrations(db);
    store = new PgAuthStore({
      query: async (text, params) => (await db.query(text, params)).rows as Record<string, unknown>[],
    });
  });

  afterAll(async () => {
    await db.close();
  });

  beforeEach(async () => {
    await db.exec("delete from passkeys; delete from device_tokens");
  });

  describe("passkeys", () => {
    it("round-trips every byte of the public key", async () => {
      const publicKey = new Uint8Array(256).map((_, i) => i);
      await store.addPasskey({ credentialId: "cred-1", publicKey, counter: 0, transports: ["internal", "hybrid"], name: "laptop" });
      const [stored] = await store.listPasskeys();
      expect(Array.from(stored!.publicKey)).toEqual(Array.from(publicKey));
      expect(stored).toMatchObject({ credentialId: "cred-1", counter: 0, transports: ["internal", "hybrid"], name: "laptop" });
      expect(stored!.createdAt).toMatch(/Z$/);
    });

    it("keeps an empty transports list empty", async () => {
      await store.addPasskey({ credentialId: "c", publicKey: new Uint8Array([1]), counter: 0, transports: [], name: "n" });
      expect((await store.listPasskeys())[0]?.transports).toEqual([]);
    });

    it("updates the counter", async () => {
      await store.addPasskey({ credentialId: "c", publicKey: new Uint8Array([1]), counter: 0, transports: [], name: "n" });
      await store.updatePasskeyCounter("c", 7);
      expect((await store.listPasskeys())[0]?.counter).toBe(7);
    });

    it("refuses a duplicate credential id", async () => {
      const input = { credentialId: "c", publicKey: new Uint8Array([1]), counter: 0, transports: [], name: "n" };
      await store.addPasskey(input);
      await expect(store.addPasskey(input)).rejects.toThrow();
    });
  });

  describe("device tokens", () => {
    it("creates, finds, lists and revokes", async () => {
      const created = await store.createDeviceToken({ name: "daemon", scope: "sync", tokenHash: "hash-1" });
      expect(created).toMatchObject({ name: "daemon", scope: "sync", lastUsedAt: null, revokedAt: null });

      const found = await store.findActiveDeviceToken("hash-1");
      expect(found?.id).toBe(created.id);
      expect(await store.findActiveDeviceToken("nope")).toBeNull();

      expect(await store.revokeDeviceToken(created.id)).toBe(true);
      expect(await store.findActiveDeviceToken("hash-1")).toBeNull();
      expect(await store.revokeDeviceToken(created.id)).toBe(false);
      expect((await store.listDeviceTokens())[0]?.revokedAt).toMatch(/Z$/);
    });

    it("records last use on the first lookup but not on every poll", async () => {
      const created = await store.createDeviceToken({ name: "d", scope: "sync", tokenHash: "h" });
      await store.findActiveDeviceToken("h");
      const first = (await store.listDeviceTokens()).find((t) => t.id === created.id)!.lastUsedAt;
      expect(first).toMatch(/Z$/);
      await store.findActiveDeviceToken("h");
      const second = (await store.listDeviceTokens()).find((t) => t.id === created.id)!.lastUsedAt;
      expect(second).toBe(first);
    });

    it("rejects an unknown scope at the database level", async () => {
      await expect(store.createDeviceToken({ name: "d", scope: "root" as never, tokenHash: "h" })).rejects.toThrow();
    });
  });
});
