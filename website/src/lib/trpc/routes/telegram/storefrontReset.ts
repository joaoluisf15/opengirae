export function nextRefreshUTC(now: Date = new Date()): Date {
	const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), Math.floor(now.getUTCHours() / 6) * 6, 0, 0, 0));
	while (next.getTime() <= now.getTime()) next.setUTCHours(next.getUTCHours() + 6);
	return next;
}
