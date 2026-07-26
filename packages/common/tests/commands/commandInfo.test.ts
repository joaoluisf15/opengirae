import { test, expect, describe } from "bun:test";
import { Command } from "../../commands/index";

describe("CommandInfo.guards", () => {
  test("the base Command class declares no guards", () => {
    expect(Command.info.guards).toBeUndefined();
  });

  test("a subclass can declare guards, readable off its own info", () => {
    class Guarded extends Command {
      static override info = { ...Command.info, name: "guarded-test", guards: ["isAdmin"] };
    }
    expect(Guarded.info.guards).toEqual(["isAdmin"]);
  });
});
