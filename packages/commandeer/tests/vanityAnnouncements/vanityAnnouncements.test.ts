import { test, expect, describe } from "bun:test";
import { renderVanityAnnouncementContent } from "../../services/vanity/vanityAnnouncements";

describe("renderVanityAnnouncementContent", () => {
  test("formats the header, count, date, and one line per item", () => {
    const content = renderVanityAnnouncementContent(
      'sticker',
      [
        { id: 1, title: "Sticker A", itemURL: "https://example.com/a.png" },
        { id: 2, title: "Sticker B", itemURL: "https://example.com/b.png" },
      ],
      new Date("2024-05-15T12:00:00Z"),
    );

    expect(content).toBe(
      "➕ Adição de sticker novos\n\n" +
      "🎲 **2 sticker** adicionados no total.\n" +
      "📅 **15/05/2024**\n\n" +
      "🛍 `1`. **Sticker A**\n" +
      "🛍 `2`. **Sticker B**"
    );
  });

  test("lists every item with no cap, however many are in the batch", () => {
    const items = Array.from({ length: 47 }, (_, i) => ({ id: i, title: `Item ${i}`, itemURL: "https://x/y.png" }));
    const content = renderVanityAnnouncementContent('background', items, new Date());

    expect(content).toContain("**47 papel de parede** adicionados no total.");
    expect(content.match(/🛍 `\d+`/g)).toHaveLength(47);
  });

  test("escapes markdown in item titles", () => {
    const content = renderVanityAnnouncementContent(
      'background',
      [{ id: 1, title: "Nome*Estranho", itemURL: "https://x/y.png" }],
      new Date(),
    );
    expect(content).toContain("Nome\\*Estranho");
  });
});
