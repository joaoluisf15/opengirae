import { test, expect, describe } from "bun:test";
import { withCustomEmojiTags } from "../customEmoji";

function entities(list: { offset: number; length: number; customEmojiId: string }[]) {
  return { customEmoji: { size: list.length, values: () => list } };
}

describe("withCustomEmojiTags", () => {
  test("returns text unchanged when there are no custom emoji entities", () => {
    expect(withCustomEmojiTags("hello 🎉", entities([]))).toBe("hello 🎉");
  });

  test("returns text unchanged when entities is undefined", () => {
    expect(withCustomEmojiTags("hello", undefined)).toBe("hello");
  });

  test("passes through undefined text unchanged", () => {
    expect(withCustomEmojiTags(undefined, undefined)).toBeUndefined();
  });

  test("wraps a single custom emoji at the given offset", () => {
    const text = "/emojicard 5 🎉";
    const result = withCustomEmojiTags(text, entities([{ offset: 13, length: 2, customEmojiId: "111" }]));
    expect(result).toBe('/emojicard 5 <tg-emoji:111>🎉</tg-emoji>');
  });

  test("wraps multiple custom emojis without corrupting offsets (processed back-to-front)", () => {
    const text = "🎉 and 🔥";
    const result = withCustomEmojiTags(text, entities([
      { offset: 0, length: 2, customEmojiId: "111" },
      { offset: 7, length: 2, customEmojiId: "222" },
    ]));
    expect(result).toBe('<tg-emoji:111>🎉</tg-emoji> and <tg-emoji:222>🔥</tg-emoji>');
  });
});
