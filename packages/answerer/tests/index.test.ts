import { test, expect, describe } from "bun:test";
import { isPermanentSendError, extractRetryAfter } from "../error";

describe("isPermanentSendError", () => {
  test("matches by code 403", () => {
    expect(isPermanentSendError({ code: 403, message: "Forbidden" })).toBe(true);
  });

  test("matches 'not enough rights' even without code 403", () => {
    expect(isPermanentSendError({ message: "Bad Request: not enough rights to send photos to the chat" })).toBe(true);
  });

  test("matches 'kicked from the supergroup' even without code 403", () => {
    expect(isPermanentSendError({ message: "Forbidden: bot was kicked from the supergroup chat" })).toBe(true);
  });

  test("matches 'blocked by the user'", () => {
    expect(isPermanentSendError({ message: "Forbidden: bot was blocked by the user" })).toBe(true);
  });

  test("matches 'message is not modified'", () => {
    expect(isPermanentSendError({ message: "Bad Request: message is not modified: specified new message content and reply markup are exactly the same as a current content and reply markup of the message" })).toBe(true);
  });

  test("matches 'message to be replied not found'", () => {
    expect(isPermanentSendError({ message: "Bad Request: message to be replied not found" })).toBe(true);
  });

  test("matches 'message to edit not found'", () => {
    expect(isPermanentSendError({ message: "Bad Request: message to edit not found" })).toBe(true);
  });

  test("does not match a transient error", () => {
    expect(isPermanentSendError({ message: "Failed to send request to discord." })).toBe(false);
  });

  test("does not throw on a missing/malformed error", () => {
    expect(isPermanentSendError(undefined)).toBe(false);
    expect(isPermanentSendError({})).toBe(false);
  });
});

describe("extractRetryAfter", () => {
  test("prefers the structured parameters.retry_after", () => {
    expect(extractRetryAfter({ parameters: { retry_after: 12 } })).toBe(12);
  });

  test("falls back to parsing the message when parameters is missing", () => {
    expect(extractRetryAfter({ message: "Bad Request: Too Many Requests: retry after 29" })).toBe(29);
  });

  test("falls back to parsing the message when parameters.retry_after is missing", () => {
    expect(extractRetryAfter({ parameters: {}, message: "Too Many Requests: retry after 41" })).toBe(41);
  });

  test("returns undefined when neither is present", () => {
    expect(extractRetryAfter({ message: "Forbidden: bot was blocked by the user" })).toBeUndefined();
    expect(extractRetryAfter(undefined)).toBeUndefined();
  });
});
