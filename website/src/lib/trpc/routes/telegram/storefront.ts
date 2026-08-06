import { z } from 'zod';
import { telegramProcedure, requireUser } from '$lib/trpc/middleware/telegramAuth';
import { t } from '$lib/trpc/t';
import { StorefrontDB } from '@girae/database/storefront';
import { CardsDB } from '@girae/database/cards';
import { db } from '@girae/database/index';
import { storefrontPurchases } from '@girae/database/schemas/storefront';
import { and, eq, inArray } from 'drizzle-orm';
import { EconomyDB } from '@girae/database/economy';
import { nextRefreshUTC } from './storefrontReset';

const STOREFRONT_BASE_PRICE = 30000;

async function buildOfferedCards(userId: number) {
	const state = await StorefrontDB.getState();
	const rate = await EconomyDB.getInflationRate();
	const details = await CardsDB.getCardsWithDetailsByIds(state.cardIds);

	const boughtRows = await db
		.select({ cardId: storefrontPurchases.cardId })
		.from(storefrontPurchases)
		.where(and(eq(storefrontPurchases.userId, userId), eq(storefrontPurchases.storefrontId, state.id), inArray(storefrontPurchases.cardId, state.cardIds)));
	const boughtIds = new Set(boughtRows.map(r => r.cardId));

	const cardsOut = details.map(card => ({
		...card,
		price: Math.round(STOREFRONT_BASE_PRICE * rate),
		alreadyBought: boughtIds.has(card.id),
	}));

	return { state, cardsOut, resetsAt: nextRefreshUTC().toISOString() };
}

export const telegramStorefrontRouter = t.router({
	list: telegramProcedure.query(async ({ ctx }) => {
		const user = await requireUser(ctx.tgUser.id.toString());
		const { cardsOut, resetsAt } = await buildOfferedCards(user.id);
		return { cards: cardsOut, resetsAt };
	}),

	card: telegramProcedure
		.input(z.object({ cardId: z.number().int().positive() }))
		.query(async ({ ctx, input }) => {
			const user = await requireUser(ctx.tgUser.id.toString());
			const { cardsOut } = await buildOfferedCards(user.id);
			return cardsOut.find(c => c.id === input.cardId) ?? null;
		}),

	buy: telegramProcedure
		.input(z.object({ cardId: z.number().int().positive() }))
		.mutation(async ({ ctx, input }) => {
			const user = await requireUser(ctx.tgUser.id.toString());
			const state = await StorefrontDB.getState();
			if (!state.cardIds.includes(input.cardId)) return { ok: false as const, reason: 'unavailable' as const };

			const rate = await EconomyDB.getInflationRate();
			const price = Math.round(STOREFRONT_BASE_PRICE * rate);
			const incomeRate = await EconomyDB.getIncomeInflationRate();

			try {
				const result = await StorefrontDB.buyCard(user.id, input.cardId, state.id, price, incomeRate);
				if (!result.ok) return result;
				return { ok: true as const };
			} catch {
				return { ok: false as const, reason: 'unavailable' as const };
			}
		}),
});
