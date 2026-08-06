import { maybeTransaction } from "./decorators";
import { storefront, storefrontPurchases } from "./schemas/storefront";
import { cards, rarities } from "./schemas/cards";
import { db } from "./index";
import { eq, sql } from "drizzle-orm";
import { CardsDB, HIPOTECA_RARITY_NAME } from "./cards";
import { EconomyDB } from "./economy";

export class StorefrontCardUnavailableError extends Error {
  constructor(public userId: number, public cardId: number) {
    super(`card ${cardId} is not currently available in the storefront for user ${userId} (rotation moved on, or already bought this rotation)`);
  }
}

export class StorefrontDB {
  static refresh = maybeTransaction('refresh', async (client) => {
    const picked = await client
      .select({ id: cards.id })
      .from(cards)
      .innerJoin(rarities, eq(rarities.id, cards.rarityId))
      .where(eq(rarities.name, HIPOTECA_RARITY_NAME))
      .orderBy(sql`random()`)
      .limit(6);
    const cardIds = picked.map(row => row.id);

    await client.update(storefront).set({ cardIds, refreshedAt: new Date() });
    await client.delete(storefrontPurchases);
  })

  // storefront is seeded once by its migration (INSERT ... SELECT 6 random legendary cards),
  // same pattern EconomyDB's singleton row uses - not lazily created here. A lazy
  // check-then-insert on first read would race two concurrent callers into inserting two rows.
  static getState = async (): Promise<{ id: number; cardIds: number[]; refreshedAt: Date }> => {
    const [row] = await db.select().from(storefront).limit(1);
    return row!;
  }

  // spend-then-guard ordering: insufficient funds is the common path (clean early return, nothing
  // to roll back); the guarded insert failing (stale rotation or already bought) is the rare path,
  // worth paying for a transaction rollback via throw.
  static buyCard = maybeTransaction('buyCard', async (
    client, userId: number, cardId: number, expectedStorefrontId: number, price: number, incomeInflationRate: number
  ): Promise<{ ok: true } | { ok: false; reason: 'insufficient_funds' }> => {
    const paid = await EconomyDB.deductCoinsToTreasury(client, userId, price);
    if (!paid) return { ok: false, reason: 'insufficient_funds' };

    const result = await client.execute<{ id: number }>(sql`
      INSERT INTO ${storefrontPurchases}
        (${sql.identifier(storefrontPurchases.userId.name)}, ${sql.identifier(storefrontPurchases.cardId.name)}, ${sql.identifier(storefrontPurchases.storefrontId.name)})
      SELECT ${userId}, ${cardId}, s.id
      FROM ${storefront} s
      WHERE s.id = ${expectedStorefrontId} AND ${cardId} = ANY(s.${sql.identifier(storefront.cardIds.name)})
      ON CONFLICT (${sql.identifier(storefrontPurchases.userId.name)}, ${sql.identifier(storefrontPurchases.cardId.name)}, ${sql.identifier(storefrontPurchases.storefrontId.name)}) DO NOTHING
      RETURNING ${sql.identifier(storefrontPurchases.id.name)}
    `);
    if (!result.rows[0]) throw new StorefrontCardUnavailableError(userId, cardId);

    await CardsDB.addUserCardWithClient(client, userId, cardId, incomeInflationRate);
    return { ok: true };
  })
}
