import { createTRPCProxyClient, httpBatchLink } from '@trpc/client';
import { retrieveRawInitData } from '@tma.js/sdk-svelte';
import type { Router } from '$lib/trpc/router';

export const telegramTrpc = createTRPCProxyClient<Router>({
	links: [
		httpBatchLink({
			url: '/trpc',
			headers: () => {
				let initDataRaw: string | undefined;
				try {
					initDataRaw = retrieveRawInitData();
				} catch {
					initDataRaw = undefined;
				}
				return initDataRaw ? { 'x-tma-init-data': initDataRaw } : {};
			},
		}),
	],
});
