import { env } from '$env/dynamic/private';

export function load() {
	return { authBypassed: env.BYPASS_TELEGRAM_AUTH_DO_NOT_USE_THIS_IN_PROD_PRETTY_PLEASE === '1' };
}
