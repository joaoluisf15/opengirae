import { Command, Page, CommandArgument, CommandArgumentType } from '@girae/common/commands'
import { reply, pageNavRow } from '@girae/common/dbos/messaging'
import { DiscotecaDB } from '@girae/database/discoteca'
import { CardsDB } from '@girae/database/cards'
import { UsersDB } from '@girae/database/users'
import { escapeMarkdown } from '@girae/common/utilities/markdown'
import { mention } from '@girae/common/utilities/mention'
import type { IncomingCommand } from '@girae/common/commands/types'
import { EMOJI } from '../../constants'

const PAGE_SIZE = 20
export type EntryDetails = NonNullable<Awaited<ReturnType<typeof DiscotecaDB.getEntryWithDetails>>>

export const TYPE_EMOJI: Record<'album' | 'single', string> = { album: '💽', single: '🎵' }
export const TYPE_LABEL: Record<'album' | 'single', string> = { album: 'Álbuns', single: 'Singles' }

export function renderCollectionMarker(total: number, owned: number, label: string): string {
  const pct = total > 0 ? Math.round((owned / total) * 100) : 0
  return `${EMOJI.dice} **${total}** ${label} no total, \`${owned}\` na sua coleção.\n${EMOJI.progress} Coleção ${pct}% completa`
}

export function renderEntryLine(e: { id: number; name: string; artistName: string; categoryEmoji: string | null; rarityEmoji: string; ownedCount: number }): string {
  const countSuffix = e.ownedCount > 0 ? ` \`${e.ownedCount}x\`` : ''
  return `${e.rarityEmoji} \`${e.id}\`. **${escapeMarkdown(e.name)}** ${e.categoryEmoji ?? '🎧'} _${escapeMarkdown(e.artistName)}_${countSuffix}`
}

// shared list-page renderer for /albuns and /singles - the two commands only differ by type
export async function renderEntriesByTypePage(type: 'album' | 'single', userId: number, page: number) {
  const offset = page * PAGE_SIZE
  const { rows, total, owned } = await DiscotecaDB.getEntriesByType(type, userId, PAGE_SIZE, offset)
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const lines = rows.length > 0
    ? rows.map(renderEntryLine).join('\n')
    : `_Nenhum ${type === 'album' ? 'álbum' : 'single'} catalogado ainda._`
  const pageInfo = totalPages > 1 ? `\n\n📃 Página \`${page + 1}\` de **${totalPages}**` : ''
  const marker = renderCollectionMarker(total, owned, TYPE_LABEL[type].toLowerCase())

  return { content: `${TYPE_EMOJI[type]} ${TYPE_LABEL[type]} da discoteca:\n${marker}\n\n${lines}${pageInfo}`, hasNext: offset + rows.length < total, totalPages }
}

async function renderArtistsPage(userId: number, page: number) {
  const offset = page * PAGE_SIZE
  const [{ rows, total }, overall] = await Promise.all([
    DiscotecaDB.getArtistsPage(userId, PAGE_SIZE, offset),
    DiscotecaDB.getOverallCounts(userId),
  ])
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const lines = rows.map(a => {
    const emoji = a.rarityEmoji ?? '🎧'
    const pct = a.totalWorks > 0 ? Math.round((a.ownedWorks / a.totalWorks) * 100) : 0
    return `${emoji} \`${a.id}\`. **${escapeMarkdown(a.name)}** (${a.ownedWorks}/${a.totalWorks}) _${pct}%_`
  }).join('\n')
  const pageInfo = totalPages > 1 ? `\n\n📃 Página \`${page + 1}\` de **${totalPages}**` : ''
  const marker = renderCollectionMarker(overall.total, overall.owned, 'álbuns e singles')

  return { content: `💿 Sua discoteca:\n${marker}\n\n${lines}${pageInfo}`, hasNext: offset + rows.length < total, totalPages }
}

function joinPortugueseList(names: string[]): string {
  if (names.length === 1) return names[0]!
  return `${names.slice(0, -1).join(', ')}${names.length > 2 ? ',' : ''} e ${names[names.length - 1]}`
}

async function artistCardLine(artistId: number, artistName: string, userId: number | undefined): Promise<string> {
  const artist = await DiscotecaDB.getArtist(artistId)
  if (!artist?.cardId) return `🎧 **${escapeMarkdown(artistName)}**`

  const card = await CardsDB.getCardWithDetails(artist.cardId)
  if (!card) return `🎧 **${escapeMarkdown(artistName)}**`

  const owned = userId ? await CardsDB.getUserCard(userId, card.id) : undefined
  const countSuffix = owned?.count ? ` \`x${owned.count}\`` : ''
  return `${card.categoryEmoji ?? '🎧'} \`${card.id}\`. **${escapeMarkdown(card.name)}**${countSuffix}`
}

export async function resolveEntryMedia(platform: string, entry: EntryDetails): Promise<
  | { kind: 'audio'; audioFileId?: string; audioUrl?: string; thumbnailUrl?: string }
  | { kind: 'photo'; photoUrl?: string }
> {
  const hasAudio = entry.type === 'single' && platform === 'telegram' && (entry.previewUrl || entry.telegramFileId)
  if (hasAudio) {
    return {
      kind: 'audio',
      audioFileId: entry.telegramFileId ?? undefined,
      audioUrl: entry.telegramFileId ? undefined : entry.previewUrl ?? undefined,
      thumbnailUrl: entry.artworkUrl ?? undefined,
    }
  }

  if (entry.type === 'album') return { kind: 'photo', photoUrl: entry.animatedArtworkUrl ?? entry.artworkUrl ?? undefined }

  if (entry.albumId) {
    const album = await DiscotecaDB.getEntry(entry.albumId)
    return { kind: 'photo', photoUrl: album?.artworkUrl ?? entry.artworkUrl ?? undefined }
  }
  return { kind: 'photo', photoUrl: entry.artworkUrl ?? undefined }
}

export async function showEntry(ctx: IncomingCommand, entry: EntryDetails) {
  const user = await UsersDB.getUserByPlatformAccount(ctx.message.platform as 'telegram' | 'discord', ctx.message.author.id)
  const [owned, genres, linkedSingles, cardLine] = await Promise.all([
    user ? DiscotecaDB.getUserDiscoteca(user.id, entry.id) : null,
    DiscotecaDB.getGenresForEntry(entry.id),
    entry.type === 'album' ? DiscotecaDB.getLinkedSingles(entry.id, user?.id ?? 0) : Promise.resolve([]),
    artistCardLine(entry.artistId, entry.artistName, user?.id),
  ])
  const count = owned?.count ?? 0
  const typeEmoji = TYPE_EMOJI[entry.type]
  const countSuffix = entry.type === 'single' && count > 0 ? ` \`x${count}\`` : ''
  const genrePrefix = `${TYPE_LABEL[entry.type]} de`
  const genresLines = genres.length > 0
    ? `${typeEmoji} *${genrePrefix} ${joinPortugueseList(genres.map(g => escapeMarkdown(g.name)))}*`
    : `${typeEmoji} *nenhum gênero mapeado*`

  const linkedSinglesBlock = entry.type === 'album' && linkedSingles.length > 0
    ? '\n\n' + linkedSingles.map(renderEntryLine).join('\n')
    : ''

  const text = `${entry.rarityEmoji} \`${entry.id}\`. **${escapeMarkdown(entry.name)}**${countSuffix}
${cardLine}

${genresLines}${linkedSinglesBlock}

👾 \`${user?.id ?? '?'}\`. ${mention(ctx.message.platform, ctx.message.author.id, ctx.message.author.name)}`

  const buttons = entry.appleMusicUrl ? [[{ text: '🎧 Escute no Apple Music', url: entry.appleMusicUrl }]] : undefined
  const media = await resolveEntryMedia(ctx.message.platform, entry)

  if (media.kind === 'audio') {
    await reply(ctx, {
      content: text,
      audioFileId: media.audioFileId,
      audioUrl: media.audioUrl,
      audio: { entryId: entry.id, performer: entry.artistName, title: entry.name, thumbnailUrl: media.thumbnailUrl },
      buttonRows: buttons,
    })
    return
  }

  await reply(ctx, { content: text, photoUrl: media.photoUrl, buttonRows: buttons })
}

export default class DiscoCommand extends Command {
  static override info = {
    name: 'disco',
    description: 'Mostra sua discoteca, ou busca um álbum/single específico',
    usage: '/disco [busca]',
    aliases: ['mydisco', 'minhadisco', 'minhadiscografia', 'discoteca'],
  }

  @CommandArgument([{ name: 'query', type: CommandArgumentType.DISCOTECA_ENTRY, nullable: true }])
  static override async execute(ctx: IncomingCommand, args: { query?: EntryDetails }) {
    if (args.query) {
      await showEntry(ctx, args.query)
      return
    }

    const user = await UsersDB.getUserByPlatformAccount(ctx.message.platform as 'telegram' | 'discord', ctx.message.author.id)
    if (!user) return

    const hasAny = await DiscotecaDB.hasAnyUserDiscoteca(user.id)
    if (!hasAny) {
      await reply(ctx, 'Você ainda não girou nada da discoteca! 😔')
      return
    }

    const page = await renderArtistsPage(user.id, 0)
    const navRow = pageNavRow('disco', String(user.id), 0, page.hasNext, page.totalPages)
    await reply(ctx, { content: page.content, buttonRows: navRow.length ? [navRow] : undefined })
  }

  @Page({ name: 'disco', restricted: true })
  static async discoPage(arg: string, page: number) {
    return renderArtistsPage(parseInt(arg, 10), page)
  }
}
