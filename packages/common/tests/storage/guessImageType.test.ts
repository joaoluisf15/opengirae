import { test, expect, describe } from "bun:test";
import { guessImageType } from "../../utilities/storage";

describe("guessImageType", () => {
  test("prefers the response content-type header when it's image/video", () => {
    expect(guessImageType("video/mp4", "https://example.com/whatever")).toEqual({ contentType: "video/mp4", ext: "mp4" });
    expect(guessImageType("image/jpeg", "https://example.com/whatever")).toEqual({ contentType: "image/jpeg", ext: "jpeg" });
  });

  test("falls back to a known extension on the last path segment when the header is generic", () => {
    expect(guessImageType("application/octet-stream", "https://example.com/photos/pic.jpg")).toEqual({ contentType: "image/jpeg", ext: "jpg" });
  });

  test("query strings and fragments on the URL don't leak into the extension guess", () => {
    expect(guessImageType(null, "https://example.com/videos/clip.mp4?token=abc#frag")).toEqual({ contentType: "video/mp4", ext: "mp4" });
  });

  // regression: a Telegram file URL with no extension used to leak the whole url tail (bot token included) as the "extension"
  test("a path segment with no dot at all never falls back to splitting the whole URL", () => {
    const result = guessImageType("application/octet-stream", "https://api.telegram.org/file/bot123:SECRET/videos/file_37808");
    expect(result.ext).toBe("bin");
    expect(result.ext).not.toContain("/");
    expect(result.ext).not.toContain(":");
    expect(result.ext).not.toContain("SECRET");
  });

  test("an unrecognized real extension still falls back to bin, not the raw extension", () => {
    const result = guessImageType(null, "https://example.com/file.xyz");
    expect(result.ext).toBe("bin");
  });
});
