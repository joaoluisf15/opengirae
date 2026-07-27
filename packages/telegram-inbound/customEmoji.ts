export function withCustomEmojiTags(text: string | undefined, entities: any): string | undefined {
  if (!text || !entities?.customEmoji?.size) return text

  const sorted = [...entities.customEmoji.values()].sort((a: any, b: any) => b.offset - a.offset)
  let result = text
  for (const entity of sorted as { offset: number; length: number; customEmojiId: string }[]) {
    const glyph = result.slice(entity.offset, entity.offset + entity.length)

    const tag = `<tg-emoji:${entity.customEmojiId}>${glyph}</tg-emoji>`
    result = result.slice(0, entity.offset) + tag + result.slice(entity.offset + entity.length)
  }
  return result
}
