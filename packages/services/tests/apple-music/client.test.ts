import { test, expect, describe } from "bun:test";
import { mockAppleMusic } from "@girae/tests";

mockAppleMusic();

const { rawGet } = await import("../../apple-music/client");

describe("rawGet", () => {
  test("returns the parsed response body", async () => {
    const originalFetch = fetch;
    // @ts-expect-error bun-types declares fetch as a namespace, this reassignment is intentional
    fetch = (async () => new Response(JSON.stringify({ data: [{ id: "123", attributes: { name: "Test" } }] }), { status: 200 })) as unknown as typeof fetch;
    try {
      const result = await rawGet("/v1/catalog/us/albums/123?extend=editorialVideo");
      expect(result).toEqual({ data: [{ id: "123", attributes: { name: "Test" } }] });
    } finally {
      // @ts-expect-error bun-types declares fetch as a namespace, this reassignment is intentional
      fetch = originalFetch;
    }
  });

  test("throws when the response is not ok", async () => {
    const originalFetch = fetch;
    // @ts-expect-error bun-types declares fetch as a namespace, this reassignment is intentional
    fetch = (async () => new Response('', { status: 500 })) as unknown as typeof fetch;
    try {
      await expect(rawGet("/v1/catalog/us/albums/123")).rejects.toThrow();
    } finally {
      // @ts-expect-error bun-types declares fetch as a namespace, this reassignment is intentional
      fetch = originalFetch;
    }
  });
});
