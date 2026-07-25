import { Hook } from '@girae/common/hooks'
import type { CardsNewEvent } from '@girae/common/hooks/types'
import { reply } from '@girae/common/dbos/messaging'
import { escapeMarkdown } from '@girae/common/utilities/markdown'
import { buildCtx } from '../services/syntheticCtx'

export default class CollectionCompletionNotifyHook {
  // purely reactive - the *DB call that granted the card already claimed this atomically.
  @Hook('cards:new')
  static async onCardsNew(event: CardsNewEvent) {
    if (!event.completedSubcategories?.length) return

    for (const c of event.completedSubcategories) {
      const dm = buildCtx(event.platform, event.telegramId, event.displayName, event.telegramId)
      await reply(dm, `🎉 Parabéns! Você completou a coleção **${escapeMarkdown(c.subcategoryName)}** e recebeu **${c.coinsAwarded}** moedas.`)
    }
  }
}
