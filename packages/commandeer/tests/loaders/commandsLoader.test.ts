import { test, expect, describe } from "bun:test";
import { findCommand } from "../../loaders/commands";

describe("CommandsLoader category/guards wiring after the folder reorg", () => {
  test("a plain command has no guards and its category is its top-level folder", () => {
    const cmd = findCommand("girar");
    expect(cmd?.guards).toEqual([]);
    expect(cmd?.category).toBe("main");
  });

  test("a staff-only command carries the isAdmin guard from its own info", () => {
    const cmd = findCommand("addcard");
    expect(cmd?.guards).toEqual(["isAdmin"]);
    expect(cmd?.category).toBe("admin");
  });

  test("doar carries the isSpecial guard and the cards category, even though it used to live in a different guard folder than its category folder", () => {
    const cmd = findCommand("doar");
    expect(cmd?.guards).toEqual(["isSpecial"]);
    expect(cmd?.category).toBe("cards");
  });
});
