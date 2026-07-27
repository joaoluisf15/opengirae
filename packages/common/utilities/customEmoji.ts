export const FALLBACK_EMOJI = '👾'

const CUSTOM_EMOJI_TAG_REGEX = /^<tg-emoji emoji-id="\d+">.+<\/tg-emoji>$/

export function isCustomEmojiTag(value: string): boolean {
  return CUSTOM_EMOJI_TAG_REGEX.test(value.trim())
}

export function resolveDisplayEmoji<F>(customEmoji: string | null | undefined, fallback: F, supportsTag: boolean): string | F {
  if (!customEmoji) return fallback
  if (!isCustomEmojiTag(customEmoji)) return customEmoji
  return supportsTag ? customEmoji : FALLBACK_EMOJI
}
