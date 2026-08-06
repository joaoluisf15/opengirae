import { test, expect, describe } from "bun:test";
import { nextRefreshUTC } from "./storefrontReset";

describe("nextRefreshUTC", () => {
	test("at exactly a 6h boundary, returns the following one, not the current one", () => {
		expect(nextRefreshUTC(new Date("2026-08-06T00:00:00.000Z")).toISOString()).toBe("2026-08-06T06:00:00.000Z");
		expect(nextRefreshUTC(new Date("2026-08-06T06:00:00.000Z")).toISOString()).toBe("2026-08-06T12:00:00.000Z");
		expect(nextRefreshUTC(new Date("2026-08-06T12:00:00.000Z")).toISOString()).toBe("2026-08-06T18:00:00.000Z");
		expect(nextRefreshUTC(new Date("2026-08-06T18:00:00.000Z")).toISOString()).toBe("2026-08-07T00:00:00.000Z");
	});

	test("mid-window, returns the boundary later in the same window", () => {
		expect(nextRefreshUTC(new Date("2026-08-06T00:00:00.001Z")).toISOString()).toBe("2026-08-06T06:00:00.000Z");
		expect(nextRefreshUTC(new Date("2026-08-06T05:59:59.999Z")).toISOString()).toBe("2026-08-06T06:00:00.000Z");
		expect(nextRefreshUTC(new Date("2026-08-06T09:23:11.000Z")).toISOString()).toBe("2026-08-06T12:00:00.000Z");
	});

	test("just before midnight rolls over into the next day", () => {
		expect(nextRefreshUTC(new Date("2026-08-06T23:59:59.999Z")).toISOString()).toBe("2026-08-07T00:00:00.000Z");
	});
});
