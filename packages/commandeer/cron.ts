import { DBOS } from '@dbos-inc/dbos-sdk'
import { UsersDB } from '@girae/database/users'
import { EconomyDB } from '@girae/database/economy'
import { StorefrontDB } from '@girae/database/storefront'
import { CardsDB } from '@girae/database/cards'
import { VanitiesDB } from '@girae/database/vanities'
import { info } from '@girae/common/logger'
import { announceNewSubcategory, announceNewCardsGroup, groupCardsBySubcategory } from './services/cards/contentAnnouncements'
import { announceNewVanityItems } from './services/vanity/vanityAnnouncements'

const ANNOUNCEMENT_LOOKBACK_MS = 60 * 60 * 1000

export class CronJobs {
  @DBOS.workflow()
  static async runMidnightReset(schedTime: Date) {
    info('cron', `Running midnight reset for ${schedTime.toISOString()}`)
    await UsersDB.resetMidnightStats()
  }

  @DBOS.workflow()
  static async runHourlyDrawDecay(schedTime: Date) {
    info('cron', `Running hourly draw decay for ${schedTime.toISOString()}`)
    await UsersDB.decrementUsedDraws(2)
    await EconomyDB.syncAllocations()
  }

  @DBOS.workflow()
  static async runStorefrontRefresh(schedTime: Date) {
    info('cron', `Running storefront refresh for ${schedTime.toISOString()}`)
    await StorefrontDB.refresh()
    await CronJobs.announceNewContent(schedTime)
  }

  // piggybacks on the storefront-refresh 6h tick (see 04-dbos.md) rather than registering a second schedule.
  static async announceNewContent(schedTime: Date) {
    const chatId = process.env.ANNOUNCEMENT_CHAT_ID
    if (!chatId) return // optional infra, degrades gracefully like Ditto/S3/Mistral

    const threadId = process.env.ANNOUNCEMENT_THREAD_ID
    // schedTime, not `new Date()` - stays deterministic across a DBOS replay of this workflow.
    const cutoff = new Date(schedTime.getTime() - ANNOUNCEMENT_LOOKBACK_MS)

    const newSubcategories = await CardsDB.claimUnannouncedSubcategories(cutoff)
    for (const subcategory of newSubcategories) {
      await announceNewSubcategory(chatId, threadId, subcategory)
    }

    const newCards = await CardsDB.claimUnannouncedCards(cutoff)
    for (const group of groupCardsBySubcategory(newCards)) {
      await announceNewCardsGroup(chatId, threadId, group, schedTime)
    }

    for (const type of ['background', 'sticker'] as const) {
      const claimed = await VanitiesDB.claimUnannouncedStoreItems(type, schedTime, cutoff)
      if (claimed.length > 0) await announceNewVanityItems(chatId, threadId, type, schedTime)
    }
  }
}
