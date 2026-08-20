import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { escapeMarkdown } from '@girae/common/utilities/markdown'
import { reply } from '@girae/common/dbos/messaging'
import { VanitiesDB } from '@girae/database/vanities'
import { buildCtx } from '../syntheticCtx'
import { EMOJI } from '../../constants'
import { TYPE_LABEL, type VanityType } from './vanityBrowser'
import { ANNOUNCEMENT_AUTHOR_ID, ANNOUNCEMENT_AUTHOR_NAME } from '../cards/contentAnnouncements'

// caption cap is 1024 chars; same safety margin as cts.ts's MAX_CONTENT_LENGTH_FOR_PHOTO
const MAX_CONTENT_LENGTH_FOR_PHOTO = 950

interface AnnouncementItem {
  id: number
  title: string
  itemURL: string
}

const itemLine = (item: AnnouncementItem): string => `${EMOJI.shop} \`${item.id}\`. **${escapeMarkdown(item.title)}**`

export function renderVanityAnnouncementContent(type: VanityType, items: AnnouncementItem[], schedTime: Date): string {
  const date = format(schedTime, 'dd/MM/yyyy', { locale: ptBR })
  const label = TYPE_LABEL[type]
  return `${EMOJI.newContent} Adição de ${label} novos\n\n${EMOJI.dice} **${items.length} ${label}** adicionados no total.\n${EMOJI.date} **${date}**\n\n${items.map(itemLine).join('\n')}`.trim()
}

export async function announceNewVanityItems(chatId: string, threadId: string | undefined, type: VanityType, schedTime: Date): Promise<void> {
  const items = await VanitiesDB.getStoreItemsForAnnouncementBatch(type, schedTime)
  if (items.length === 0) return // batch no longer resolvable - shouldn't happen, announcedAt is never cleared

  const content = renderVanityAnnouncementContent(type, items, schedTime)
  // deterministic per batch - stays stable if this ever needs to be re-sent/edited
  const randomItem = items[schedTime.getTime() % items.length]!

  const ctx = buildCtx('telegram', ANNOUNCEMENT_AUTHOR_ID, ANNOUNCEMENT_AUTHOR_NAME, chatId, threadId)
  await reply(ctx, { content, photoUrl: content.length <= MAX_CONTENT_LENGTH_FOR_PHOTO ? randomItem.itemURL : undefined })
}
