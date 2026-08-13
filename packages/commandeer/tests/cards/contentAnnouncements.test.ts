import { test, expect, describe } from "bun:test";
import {
  buildSubcategoryAnnouncement,
  buildCardsAnnouncement,
  groupCardsBySubcategory,
} from "../../services/cards/contentAnnouncements";

describe("buildSubcategoryAnnouncement", () => {
  test("formats the new-collection message with header, count, date, and card lines", () => {
    const { content, photoUrl } = buildSubcategoryAnnouncement({
      id: 11775,
      name: "aespa",
      categoryEmoji: "🎤",
      imageUrl: "https://example.com/banner.png",
      createdAt: new Date("2024-05-15T12:00:00Z"),
      cards: [
        { id: 163089, name: "Savage", rarityEmoji: "🥇" },
        { id: 163090, name: "Next Level", rarityEmoji: "🥈" },
      ],
    });

    expect(content).toBe(
      "➕ Adição de coleção nova\n" +
      "🎤 `11775`. **aespa**\n\n" +
      "🎲 **2 cards** adicionados no total.\n" +
      "📅 **15/05/2024**\n\n" +
      "🥇 `163089`. **Savage**\n" +
      "🥈 `163090`. **Next Level**"
    );
    expect(photoUrl).toBe("https://example.com/banner.png");
  });

  test("omits photoUrl when there's no banner", () => {
    const { photoUrl } = buildSubcategoryAnnouncement({
      id: 1, name: "Sem banner", categoryEmoji: "🎤", imageUrl: null, createdAt: new Date(), cards: [],
    });
    expect(photoUrl).toBeUndefined();
  });

  test("escapes markdown in the subcategory/card names", () => {
    const { content } = buildSubcategoryAnnouncement({
      id: 1, name: "Nome*Estranho", categoryEmoji: "🎤", imageUrl: null, createdAt: new Date(),
      cards: [{ id: 2, name: "Card_Nome", rarityEmoji: "🥇" }],
    });
    expect(content).toContain("Nome\\*Estranho");
    expect(content).toContain("Card\\_Nome");
  });

  test("caps the card list and notes the remainder past the limit", () => {
    const cards = Array.from({ length: 32 }, (_, i) => ({ id: i, name: `Card ${i}`, rarityEmoji: "🥇" }));
    const { content } = buildSubcategoryAnnouncement({
      id: 1, name: "Grande", categoryEmoji: "🎤", imageUrl: null, createdAt: new Date(), cards,
    });
    expect(content).toContain("**32 cards** adicionados no total.");
    expect(content).toContain("...e mais 2 cards.");
    expect(content.match(/🥇 `\d+`/g)).toHaveLength(30);
  });
});

describe("buildCardsAnnouncement", () => {
  test("formats the new-cards message with the 'cards novos' header", () => {
    const { content, photoUrl } = buildCardsAnnouncement({
      subcategoryId: 11775,
      subcategoryName: "aespa",
      subcategoryEmoji: "🎤",
      subcategoryImageUrl: "https://example.com/banner.png",
      cards: [{ id: 163091, name: "Drama", rarityEmoji: "🥉" }],
    }, new Date("2024-05-15T12:00:00Z"));

    expect(content).toBe(
      "➕ Adição de cards novos\n" +
      "🎤 `11775`. **aespa**\n\n" +
      "🎲 **1 cards** adicionados no total.\n" +
      "📅 **15/05/2024**\n\n" +
      "🥉 `163091`. **Drama**"
    );
    expect(photoUrl).toBe("https://example.com/banner.png");
  });
});

describe("groupCardsBySubcategory", () => {
  test("groups pre-ordered rows into one entry per subcategory, preserving card order", () => {
    const groups = groupCardsBySubcategory([
      { id: 1, name: "A", rarityEmoji: "🥇", subcategoryId: 10, subcategoryName: "Sub A", subcategoryEmoji: "🎤", subcategoryImageUrl: null },
      { id: 2, name: "B", rarityEmoji: "🥈", subcategoryId: 10, subcategoryName: "Sub A", subcategoryEmoji: "🎤", subcategoryImageUrl: null },
      { id: 3, name: "C", rarityEmoji: "🥇", subcategoryId: 20, subcategoryName: "Sub B", subcategoryEmoji: "🎸", subcategoryImageUrl: "https://x/y.png" },
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ subcategoryId: 10, subcategoryName: "Sub A" });
    expect(groups[0]?.cards.map(c => c.id)).toEqual([1, 2]);
    expect(groups[1]).toMatchObject({ subcategoryId: 20, subcategoryImageUrl: "https://x/y.png" });
    expect(groups[1]?.cards.map(c => c.id)).toEqual([3]);
  });
});
