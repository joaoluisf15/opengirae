import { test, expect, describe, afterAll } from "bun:test";
import { GachaLogic, type SubcategoryForDraw, type CardForDraw } from "./gacha";
import { TestFixtures } from "@girae/tests";
import { DiscotecaDB } from "./discoteca";

describe("Gacha Logic - Subcategory Selection", () => {
  const mockSubcategories: SubcategoryForDraw[] = [
    { id: 1, name: "Common Sub", rarityModifier: 100 },
    { id: 2, name: "Rare Sub", rarityModifier: 10 },
    { id: 3, name: "Legendary Sub", rarityModifier: 1 },
  ];

  test("selectSubcategories returns exact count requested without duplicates", () => {
    const selected = GachaLogic.selectSubcategories(mockSubcategories, 2, 100);
    expect(selected.length).toBe(2);
    expect(selected[0]!.id).not.toBe(selected[1]!.id);
  });

  test("high luck boosts chance of rare subcategories", () => {
    const iterations = 10000;
    
    // Normal luck (100)
    let rareCountNormal = 0;
    for (let i = 0; i < iterations; i++) {
      const selected = GachaLogic.selectSubcategories(mockSubcategories, 1, 100);
      if (selected[0]!.id === 2 || selected[0]!.id === 3) rareCountNormal++;
    }

    // High luck (200) - doubles weight of <100 rarities
    let rareCountHighLuck = 0;
    for (let i = 0; i < iterations; i++) {
      const selected = GachaLogic.selectSubcategories(mockSubcategories, 1, 200);
      if (selected[0]!.id === 2 || selected[0]!.id === 3) rareCountHighLuck++;
    }

    // High luck should result in more rare draws
    expect(rareCountHighLuck).toBeGreaterThan(rareCountNormal);
  });
});

describe("Gacha Logic - Card Selection", () => {
  const mockCards: CardForDraw[] = [
    { id: 1, name: "Common Card", rarityModifier: 100, rarityWeight: 1000, rarityEmoji: '⚪', imageUrl: null, rank: 0 },
    { id: 2, name: "Rare Card", rarityModifier: 100, rarityWeight: 100, rarityEmoji: '🔵', imageUrl: null, rank: 1 },
    { id: 3, name: "Legendary Card", rarityModifier: 100, rarityWeight: 10, rarityEmoji: '🟡', imageUrl: null, rank: 2 },
  ];

  test("selectCard returns a card based on weighted probability", () => {
    const iterations = 50000;
    let counts = { 1: 0, 2: 0, 3: 0 };

    for (let i = 0; i < iterations; i++) {
      const card = GachaLogic.selectCard(mockCards, 100);
      counts[card!.id as keyof typeof counts]++;
    }

    // Common (1000) > Rare (100) > Legendary (10)
    expect(counts[1]).toBeGreaterThan(counts[2]);
    expect(counts[2]).toBeGreaterThan(counts[3]);

    // Theoretical probabilities:
    // Total weight = 1110
    // Common = 1000/1110 = 90.09%
    // Rare = 100/1110 = 9.01%
    // Legendary = 10/1110 = 0.90%
    
    const legendaryPercent = counts[3] / iterations;
    
    // Legendary should be extremely rare, but possible. Assert it's around ~1%
    expect(legendaryPercent).toBeGreaterThan(0.005);
    expect(legendaryPercent).toBeLessThan(0.015);
  });

  test("card.rarityModifier boosts specific card drop rate", () => {
    const cards: CardForDraw[] = [
      { id: 1, name: "Normal Rare", rarityModifier: 100, rarityWeight: 100, rarityEmoji: '🔵', imageUrl: null, rank: 0 },
      { id: 2, name: "Boosted Rare", rarityModifier: 200, rarityWeight: 100, rarityEmoji: '🔵', imageUrl: null, rank: 0 },
    ];

    const iterations = 10000;
    let counts = { 1: 0, 2: 0 };

    for (let i = 0; i < iterations; i++) {
      const card = GachaLogic.selectCard(cards, 100);
      counts[card!.id as keyof typeof counts]++;
    }

    // Boosted Rare should be roughly double Normal Rare
    expect(counts[2]).toBeGreaterThan(counts[1] * 1.5);
  });
});

describe("Gacha Logic - Discoteca Draw Queries", () => {
  const fx = new TestFixtures();

  test("getDiscotecaSubcategoriesForDraw only returns genres with at least one entry, filtered by isAlbum", async () => {
    const genreId = (await fx.discotecaGenre({ name: `Test Gacha Genre ${Date.now()}` })).id;
    const albumSubId = (await fx.discotecaSubcategory({ genreId, isAlbum: true, name: `Test Gacha Albums ${Date.now()}` })).id;
    const singleSubId = (await fx.discotecaSubcategory({ genreId, isAlbum: false, name: `Test Gacha Singles ${Date.now()}` })).id;
    const artistId = (await fx.discotecaArtist()).id;
    const entryId = (await fx.discotecaEntry({ artistId, type: 'album' })).id;
    await DiscotecaDB.setEntryGenres(entryId, [albumSubId]);

    const albumPool = await GachaLogic.getDiscotecaSubcategoriesForDraw(true);
    expect(albumPool.map(s => s.id)).toContain(albumSubId);

    const singlePool = await GachaLogic.getDiscotecaSubcategoriesForDraw(false);
    expect(singlePool.map(s => s.id)).not.toContain(singleSubId);
  });

  test("getDiscotecaEntriesForDraw returns entries linked to the subcategory in CardForDraw shape", async () => {
    const genreId = (await fx.discotecaGenre({ name: `Test Gacha Genre2 ${Date.now()}` })).id;
    const subId = (await fx.discotecaSubcategory({ genreId, isAlbum: true, name: `Test Gacha Albums2 ${Date.now()}` })).id;
    const artistId = (await fx.discotecaArtist()).id;
    const entryId = (await fx.discotecaEntry({ artistId, type: 'album', name: `Test Gacha Entry ${Date.now()}` })).id;
    await DiscotecaDB.setEntryGenres(entryId, [subId]);

    const pool = await GachaLogic.getDiscotecaEntriesForDraw(subId);
    const found = pool.find(e => e.id === entryId);
    expect(found).toBeDefined();
    expect(found!.rarityModifier).toBe(100);
    expect(typeof found!.rarityWeight).toBe('number');
    expect(typeof found!.rarityEmoji).toBe('string');
    expect(typeof found!.rank).toBe('number');
  });

  afterAll(() => fx.cleanup());
});
