import { test, expect, describe } from "bun:test";
import { buildApplicationCommands, fromDiscordSubcommandName } from "../registerCommands";

// discord subcommand/option names must match ^[-_\p{L}\p{N}]{1,32}$
const DISCORD_NAME_RE = /^[-_\p{L}\p{N}]{1,32}$/u;

function collectNames(commands: ReturnType<typeof buildApplicationCommands>): string[] {
  const names: string[] = [];
  for (const c of commands) {
    names.push(c.name);
    for (const o of c.options ?? []) {
      names.push(o.name);
      for (const oo of (o as any).options ?? []) names.push(oo.name);
    }
  }
  return names;
}

describe("buildApplicationCommands", () => {
  test("includes public commands and excludes guarded (staff-only) commands", () => {
    const commands = buildApplicationCommands();
    const names = commands.map(c => c.name);

    expect(commands.length).toBeGreaterThan(0);
    expect(names).toContain("girar");
    expect(names).not.toContain("addcard");
  });

  test("every command/option/subcommand name is valid for discord's API", () => {
    const commands = buildApplicationCommands();
    for (const name of collectNames(commands)) {
      expect(name).toMatch(DISCORD_NAME_RE);
    }
  });
});

describe("fromDiscordSubcommandName", () => {
  test("maps girar's discord-safe subcommand name back to the internal '*' name", () => {
    expect(fromDiscordSubcommandName("tudo")).toBe("*");
  });

  test("passes through names with no override", () => {
    expect(fromDiscordSubcommandName("edit")).toBe("edit");
  });
});
