import { t } from '$lib/trpc/t';
import { z } from 'zod';
import { adminProcedure } from '$lib/trpc/middleware/auth';
import { SettingsDB } from '@girae/database/settings';

export const settingsRouter = t.router({
	get: adminProcedure.query(() => SettingsDB.getState()),

	setDiscotecaEnabled: adminProcedure
		.input(z.object({ enabled: z.boolean() }))
		.mutation(({ input }) => SettingsDB.setDiscotecaEnabled(input.enabled)),
});
