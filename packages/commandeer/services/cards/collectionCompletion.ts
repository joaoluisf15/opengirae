import { CardsDB } from '@girae/database/cards'
import { reply } from '@girae/common/dbos/messaging'
import { escapeMarkdown } from '@girae/common/utilities/markdown'
import { error } from '@girae/common/logger'
import type { Platform } from '@girae/common/commands/types'
import { buildCtx } from '../syntheticCtx'

// claims the reward and DMs on a fresh claim - used by /clc and /clcimg, which have no cards:new event to react to. Never throws.
export async function attemptSubcategoryCompletionReward(
  userId: number, subcategoryId: number, telegramId: string, displayName: string, platform: Platform,
): Promise<void> {
  try {
    const result = await CardsDB.claimSubcategoryCompletionReward(userId, subcategoryId)
    if (!result.ok) return

    const subcategory = await CardsDB.getSubcategory(subcategoryId)
    if (!subcategory) return

    const dm = buildCtx(platform, telegramId, displayName, telegramId)
    await reply(dm, `🎉 Parabéns! Você completou a coleção **${escapeMarkdown(subcategory.name)}** e recebeu **${result.coinsAwarded}** moedas.`)
  } catch (e) {
    error('commandeer', `attemptSubcategoryCompletionReward(${userId}, ${subcategoryId}) failed: ${e}`)
  }
}
