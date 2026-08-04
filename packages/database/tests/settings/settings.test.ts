import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { SettingsDB } from "../../settings";

describe("SettingsDB", () => {
  let originalEnableDiscoteca: boolean;

  beforeAll(async () => {
    const state = await SettingsDB.getState();
    originalEnableDiscoteca = state.enableDiscoteca;
  });

  afterAll(async () => {
    await SettingsDB.setDiscotecaEnabled(originalEnableDiscoteca);
  });

  test("getState returns the singleton row", async () => {
    const state = await SettingsDB.getState();
    expect(state.id).toBeDefined();
    expect(typeof state.enableDiscoteca).toBe('boolean');
  });

  test("setDiscotecaEnabled toggles isDiscotecaEnabled", async () => {
    await SettingsDB.setDiscotecaEnabled(false);
    expect(await SettingsDB.isDiscotecaEnabled()).toBe(false);

    await SettingsDB.setDiscotecaEnabled(true);
    expect(await SettingsDB.isDiscotecaEnabled()).toBe(true);
  });
});
