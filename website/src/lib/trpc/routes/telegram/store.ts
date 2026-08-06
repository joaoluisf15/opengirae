import { z } from 'zod';
import { telegramProcedure, requireUser } from '$lib/trpc/middleware/telegramAuth';
import { t } from '$lib/trpc/t';
import { VanitiesDB } from '@girae/database/vanities';
import { UsersDB, GIRO_PACKAGE_TIERS } from '@girae/database/users';
import { EconomyDB } from '@girae/database/economy';
import { previewItem } from '@girae/common/ditto';

const typeInput = z.enum(['background', 'sticker']);
const pageInput = z.object({
	type: typeInput,
	query: z.string().optional(),
	limit: z.number().int().positive().max(100).optional(),
	offset: z.number().int().nonnegative().optional(),
});

async function withInflatedPrices<T extends { price: number }>(result: { rows: T[]; total: number }) {
	const rate = await EconomyDB.getInflationRate();
	return { ...result, rows: result.rows.map(row => ({ ...row, price: Math.round(row.price * rate) })) };
}

// same 03:00 UTC boundary CronJobs.runMidnightReset runs on (packages/commandeer/index.ts)
function nextMidnightUTC(): Date {
	const now = new Date();
	const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 3, 0, 0, 0));
	if (now.getUTCHours() >= 3) next.setUTCDate(next.getUTCDate() + 1);
	return next;
}

export const telegramStoreRouter = t.router({
	popular: telegramProcedure.input(pageInput).query(async ({ input }) =>
		withInflatedPrices(await VanitiesDB.listStoreItemsByPopularity(input.type, input))
	),

	recent: telegramProcedure.input(pageInput).query(async ({ input }) =>
		withInflatedPrices(await VanitiesDB.listStoreItemsByRecency(input.type, input))
	),

	cheapest: telegramProcedure.input(pageInput).query(async ({ input }) =>
		withInflatedPrices(await VanitiesDB.listStoreItemsByPrice(input.type, input))
	),

	search: telegramProcedure.input(pageInput).query(async ({ input }) =>
		withInflatedPrices(await VanitiesDB.listStoreItemsByRecency(input.type, input))
	),

	ownedItemIds: telegramProcedure.query(async ({ ctx }) => {
		const user = await requireUser(ctx.tgUser.id.toString());
		return VanitiesDB.getBoughtItemIds(user.id);
	}),

	equippedItemIds: telegramProcedure.query(async ({ ctx }) => {
		const profileRow = await UsersDB.getUserProfileByPlatformAccount('telegram', ctx.tgUser.id.toString());
		return UsersDB.getEquippedItemIds(profileRow?.user_profiles);
	}),

	balance: telegramProcedure.query(async ({ ctx }) => {
		const user = await requireUser(ctx.tgUser.id.toString());
		return user.coins;
	}),

	preview: telegramProcedure
		.input(z.object({ itemId: z.number().int().positive() }))
		.query(({ ctx, input }) => previewItem('telegram', ctx.tgUser.id.toString(), input.itemId)),

	buy: telegramProcedure
		.input(z.object({ itemId: z.number().int().positive() }))
		.mutation(async ({ ctx, input }) => {
			const user = await requireUser(ctx.tgUser.id.toString());
			return VanitiesDB.buyItem(user.id, input.itemId);
		}),

	equip: telegramProcedure
		.input(z.object({ itemId: z.number().int().positive(), type: typeInput }))
		.mutation(async ({ ctx, input }) => {
			const user = await requireUser(ctx.tgUser.id.toString());
			return VanitiesDB.equipItem(user.id, input.type, input.itemId);
		}),

	giroTier: telegramProcedure.query(async ({ ctx }) => {
		const user = await requireUser(ctx.tgUser.id.toString());
		const tier = GIRO_PACKAGE_TIERS[user.giroPackagesBoughtToday];
		const rate = tier ? await EconomyDB.getInflationRate() : 1;
		return {
			tierIndex: user.giroPackagesBoughtToday,
			exhausted: !tier,
			giros: tier?.giros ?? null,
			price: tier ? Math.round(tier.price * rate) : null,
			resetsAt: nextMidnightUTC().toISOString(),
		};
	}),

	buyGiroTier: telegramProcedure.mutation(async ({ ctx }) => {
		const user = await requireUser(ctx.tgUser.id.toString());
		const tier = GIRO_PACKAGE_TIERS[user.giroPackagesBoughtToday];
		if (!tier) return { ok: false as const, reason: 'exhausted' as const };

		const rate = await EconomyDB.getInflationRate();
		const price = Math.round(tier.price * rate);

		const result = await UsersDB.buyGiroPackage(user.id, user.giroPackagesBoughtToday, price, tier.giros);
		if (!result.ok) {
			const fresh = await requireUser(ctx.tgUser.id.toString());
			if (fresh.coins < price) return { ok: false as const, reason: 'insufficient_funds' as const };
			if (!GIRO_PACKAGE_TIERS[fresh.giroPackagesBoughtToday]) return { ok: false as const, reason: 'exhausted' as const };
			return { ok: false as const, reason: 'race' as const };
		}
		return { ok: true as const, giros: tier.giros, price };
	}),
});
