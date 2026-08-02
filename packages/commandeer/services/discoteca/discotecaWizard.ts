import { DBOS } from '@dbos-inc/dbos-sdk'
import { reply, deleteMsg, awaitTextReply } from '@girae/common/dbos/messaging'
import { escapeMarkdown } from '@girae/common/utilities/markdown'
import { CardsDB } from '@girae/database/cards'
import { UsersDB } from '@girae/database/users'
import { AuditDB } from '@girae/database/audit'
import { DiscotecaDB, type AlbumTrackData } from '@girae/database/discoteca'
import { searchAlbums, searchSongs, resolveArtworkUrl, type AppleMusicSearchCandidate } from '@girae/services/apple-music/search'
import { getAlbum, getSong } from '@girae/services/apple-music/resource'
import { getOrProcessPreview } from '@girae/services/apple-music/preview'
import { inferDiscotecaRarity } from './discotecaInference'
import { resolveCardByIdOrName } from '../commandArguments'
import type { IncomingCommand } from '@girae/common/commands/types'

const PICK_EVENT = 'discoteca:pick'
const CONFIRM_EVENT = 'discoteca:confirm'
const NAME_EVENT = 'discoteca:name'
const ADD_GENRE_EVENT = 'discoteca:addGenre'
const ARTIST_CARD_EVENT = 'discoteca:artistCard'
const MAX_CANDIDATES_SHOWN = 8

type PickAction = { index: number }
type ConfirmAction =
  | { action: 'rarity'; value: string }
  | { action: 'editName' }
  | { action: 'recheckGenres' }
  | { action: 'addGenre' }
  | { action: 'linkArtistCard' }
  | { action: 'confirm' }
  | { action: 'cancel' }
type Rarity = { id: number; name: string; emoji: string }
type ResolvedGenres = Awaited<ReturnType<typeof DiscotecaDB.resolveGenresByAliases>>
type Artist = { id: number; name: string; cardId: number | null }

// Apple Music tags almost everything with this generic top-level genre alongside the real one
function stripGenericMusicGenre(genreNames: string[]): string[] {
  return genreNames.filter(g => g.trim().toLowerCase() !== 'music')
}

export async function runAddFlow(ctx: IncomingCommand, resourceType: 'single' | 'album', query: string): Promise<void> {
  const candidates = resourceType === 'album' ? await searchAlbums(query) : await searchSongs(query)
  if (candidates.length === 0) {
    await reply(ctx, `😅 Não encontrei nada no Apple Music para "${escapeMarkdown(query)}".`)
    return
  }

  const shown = candidates.slice(0, MAX_CANDIDATES_SHOWN)
  const pickOptions = shown.map((c, i) => ({
    title: `${i + 1}. ${c.name} — ${c.artistName}${c.releaseDate ? ` (${c.releaseDate.slice(0, 4)})` : ''}`,
    data: { index: i } as PickAction,
  }))

  const pickMessageId = await reply(ctx, {
    content: `🔍 **${candidates.length}** resultado(s) no Apple Music${candidates.length > shown.length ? ` (mostrando os ${shown.length} primeiros)` : ''}:`,
    eventName: PICK_EVENT,
    restricted: 'author',
    options: [...pickOptions, { title: '❌ Cancelar', data: { index: -1 } as PickAction }],
    rows: [...shown.map(() => 1), 1],
  })

  const pick = await DBOS.recv<{ value: PickAction, messageId?: string }>(PICK_EVENT)
  if (!pick) return
  const messageId = pick.messageId ?? pickMessageId

  if (pick.value.index === -1) {
    if (messageId) await deleteMsg(ctx, messageId)
    await reply(ctx, 'Adição cancelada.')
    return
  }

  const chosen = shown[pick.value.index]
  if (!chosen) return

  if (resourceType === 'album') await runAlbumConfirm(ctx, chosen, messageId)
  else await runSingleConfirm(ctx, chosen, messageId)
}

async function runConfirmLoop(
  ctx: IncomingCommand,
  messageId: string | undefined,
  photoUrl: string | undefined,
  buildPreview: (name: string, rarityName: string, rarityEmoji: string, genres: ResolvedGenres, artist: Artist) => Promise<string>,
  initialName: string,
  initialRarityName: string,
  rarities: Rarity[],
  initialGenres: ResolvedGenres,
  reresolveGenres: () => Promise<ResolvedGenres>,
  resolveGenre: (raw: string) => Promise<{ id: number; name: string } | null>,
  initialArtist: Artist,
): Promise<{ name: string; rarityId: number; genres: ResolvedGenres; artist: Artist; messageId?: string } | null> {
  let name = initialName
  let rarityName = initialRarityName
  let genres = initialGenres
  let artist = initialArtist
  let currentMessageId = messageId

  while (true) {
    const rarity = rarities.find(r => r.name === rarityName) ?? rarities[0]!
    const options = [
      ...rarities.map(r => ({ title: `${r.emoji} ${r.name}`, data: { action: 'rarity', value: r.name } as ConfirmAction })),
      { title: '✏️ Nome', data: { action: 'editName' } as ConfirmAction },
      { title: '🔁 Rever gêneros', data: { action: 'recheckGenres' } as ConfirmAction },
      { title: '➕ Adicionar gênero', data: { action: 'addGenre' } as ConfirmAction },
      { title: '🎴 Vincular card do artista', data: { action: 'linkArtistCard' } as ConfirmAction },
      { title: '✅ Salvar', data: { action: 'confirm' } as ConfirmAction },
      { title: '❌ Cancelar', data: { action: 'cancel' } as ConfirmAction },
    ]

    await reply(ctx, {
      content: await buildPreview(name, rarity.name, rarity.emoji, genres, artist),
      photoUrl,
      eventName: CONFIRM_EVENT,
      restricted: 'author',
      options,
      rows: [rarities.length, 1, 1, 1, 1, 1, 1],
      editMessageId: currentMessageId,
    })

    const selection = await DBOS.recv<{ value: ConfirmAction, messageId?: string }>(CONFIRM_EVENT)
    if (!selection) return null
    currentMessageId = selection.messageId ?? currentMessageId

    if (selection.value.action === 'cancel') {
      if (currentMessageId) await deleteMsg(ctx, currentMessageId)
      await reply(ctx, 'Adição cancelada.')
      return null
    }
    if (selection.value.action === 'rarity') { rarityName = selection.value.value; continue }
    if (selection.value.action === 'editName') {
      await reply(ctx, 'Envie o novo nome (texto simples).')
      await awaitTextReply(ctx, NAME_EVENT)
      const textReply = await DBOS.recv<{ value: string }>(NAME_EVENT)
      if (textReply?.value?.trim()) name = textReply.value.trim()
      continue
    }
    if (selection.value.action === 'recheckGenres') { genres = await reresolveGenres(); continue }
    if (selection.value.action === 'addGenre') {
      await reply(ctx, 'Envie o nome do gênero a adicionar (precisa já existir no catálogo).')
      await awaitTextReply(ctx, ADD_GENRE_EVENT)
      const textReply = await DBOS.recv<{ value: string }>(ADD_GENRE_EVENT)
      const genreName = textReply?.value?.trim()
      if (genreName) {
        const found = await resolveGenre(genreName)
        if (found && !genres.resolved.some(g => g.id === found.id)) {
          genres = { resolved: [...genres.resolved, { id: found.id, name: found.name }], unmapped: genres.unmapped }
        } else if (!found) {
          await reply(ctx, `Não encontrei um gênero chamado **${escapeMarkdown(genreName)}**.`)
        }
      }
      continue
    }
    if (selection.value.action === 'linkArtistCard') {
      await reply(ctx, 'Envie o ID ou nome do card do artista.')
      await awaitTextReply(ctx, ARTIST_CARD_EVENT)
      const textReply = await DBOS.recv<{ value: string }>(ARTIST_CARD_EVENT)
      const raw = textReply?.value?.trim()
      if (raw) {
        const cardOutcome = await resolveCardByIdOrName(raw)
        if (cardOutcome.ok) {
          const card = cardOutcome.value as { id: number }
          await DiscotecaDB.setArtistCard(artist.id, card.id)
          artist = { ...artist, cardId: card.id }
        } else if (cardOutcome.message) {
          await reply(ctx, cardOutcome.message)
        }
      }
      continue
    }
    if (selection.value.action === 'confirm') return { name, rarityId: rarity.id, genres, artist, messageId: currentMessageId }
  }
}

async function getStaffUser(ctx: IncomingCommand) {
  return UsersDB.getUserByPlatformAccount(ctx.message.platform as 'telegram' | 'discord', ctx.message.author.id)
}

async function artistCardLine(artist: Artist): Promise<string> {
  if (artist.cardId) {
    const card = await CardsDB.getCardWithDetails(artist.cardId)
    if (card) return `🎧 Card do artista: ${card.rarityEmoji} \`${card.id}\`. **${escapeMarkdown(card.name)}**`
  }
  return `🎧 Nenhum card de artista encontrado para **${escapeMarkdown(artist.name)}**.`
}

async function runAlbumConfirm(ctx: IncomingCommand, candidate: AppleMusicSearchCandidate, messageId: string | undefined): Promise<void> {
  const detail = await getAlbum(candidate.id)
  if (!detail) {
    await reply(ctx, { content: '😅 Não consegui buscar os detalhes desse álbum no Apple Music. Tente de novo.', editMessageId: messageId })
    return
  }

  const rarities = await CardsDB.getRarities()
  if (rarities.length === 0) { await reply(ctx, 'Não há raridades cadastradas ainda.'); return }

  const attrs = detail.attributes
  const apiArtist = detail.relationships?.artists?.data?.[0]
  const artist = await DiscotecaDB.getOrCreateArtist(
    apiArtist?.id ?? candidate.id,
    (apiArtist?.attributes as { name?: string } | undefined)?.name ?? attrs.artistName ?? candidate.artistName,
  )
  if (!artist) return

  const genreNames = stripGenericMusicGenre(attrs.genreNames ?? [])
  const initialGenres = await DiscotecaDB.resolveGenresByAliases(genreNames, true)
  const suggestedRarity = await inferDiscotecaRarity(attrs.name ?? candidate.name, artist.name, 'album', rarities.map(r => r.name))
  const artworkUrl = resolveArtworkUrl(attrs.artwork, 1000)

  const buildPreview = async (name: string, rarityName: string, rarityEmoji: string, genres: ResolvedGenres, artist: Artist) => {
    const genresLine = genres.resolved.length > 0 ? genres.resolved.map(g => escapeMarkdown(g.name)).join(', ') : '_nenhum gênero mapeado_'
    const unmappedWarning = genres.unmapped.length > 0 ? `\n⚠️ Gêneros não mapeados: ${genres.unmapped.map(escapeMarkdown).join(', ')}` : ''
    const artistLine = await artistCardLine(artist)
    return `💿 **${escapeMarkdown(name)}**\n${escapeMarkdown(artist.name)}\n\n🎼 ${genresLine}${unmappedWarning}\n${artistLine}\n${rarityEmoji} ${escapeMarkdown(rarityName)}`
  }

  const outcome = await runConfirmLoop(
    ctx, messageId, artworkUrl, buildPreview,
    attrs.name ?? candidate.name, suggestedRarity ?? rarities[0]!.name, rarities,
    initialGenres, () => DiscotecaDB.resolveGenresByAliases(genreNames, true),
    async raw => (await DiscotecaDB.resolveGenresByAliases([raw], true)).resolved[0] ?? null,
    artist,
  )
  if (!outcome) return

  const user = await getStaffUser(ctx)
  if (!user) return

  const tracks = detail.relationships?.tracks?.data ?? []
  const trackRows: AlbumTrackData[] = []
  for (const track of tracks) {
    const trackAttrs = track.attributes as {
      name?: string; trackNumber?: number; durationInMillis?: number; isrc?: string;
      previews?: { url: string }[]; artistName?: string; releaseDate?: string;
      genreNames?: string[]; artwork?: { url?: string };
    } | undefined
    if (!trackAttrs) continue

    const previewUrl = trackAttrs.previews?.[0]?.url
      ? await getOrProcessPreview({
          appleMusicTrackId: track.id,
          previewUrl: trackAttrs.previews[0].url,
          title: trackAttrs.name ?? '',
          artistName: trackAttrs.artistName ?? outcome.artist.name,
          albumName: outcome.name,
          releaseDate: trackAttrs.releaseDate ?? attrs.releaseDate,
          genre: trackAttrs.genreNames?.[0] ?? genreNames[0],
          artwork: trackAttrs.artwork ?? attrs.artwork,
        })
      : null

    trackRows.push({
      trackAppleMusicId: track.id,
      name: trackAttrs.name ?? '',
      trackNumber: trackAttrs.trackNumber ?? 0,
      durationInMillis: trackAttrs.durationInMillis ?? 0,
      isrc: trackAttrs.isrc,
      previewUrl: previewUrl ?? undefined,
    })
  }

  const entry = await DiscotecaDB.createEntry({
    name: outcome.name,
    artistId: outcome.artist.id,
    appleMusicId: candidate.id,
    type: 'album',
    rarityId: outcome.rarityId,
    artworkUrl,
    appleMusicUrl: attrs.url,
    releaseDate: attrs.releaseDate ? new Date(attrs.releaseDate) : undefined,
  })
  if (!entry) return

  await DiscotecaDB.setEntryGenres(entry.id, outcome.genres.resolved.map(g => g.id))
  if (trackRows.length > 0) await DiscotecaDB.cacheAlbumTracks(entry.id, trackRows)
  await AuditDB.log(user.id, 'discoteca.create', { entryId: entry.id, name: entry.name, type: 'album', appleMusicId: candidate.id, trackCount: trackRows.length })

  if (outcome.messageId) await deleteMsg(ctx, outcome.messageId)
  await reply(ctx, `💿 Álbum salvo: \`${entry.id}\`. **${escapeMarkdown(entry.name)}**`)
}

async function runSingleConfirm(ctx: IncomingCommand, candidate: AppleMusicSearchCandidate, messageId: string | undefined): Promise<void> {
  const detail = await getSong(candidate.id)
  if (!detail) {
    await reply(ctx, { content: '😅 Não consegui buscar os detalhes desse single no Apple Music. Tente de novo.', editMessageId: messageId })
    return
  }

  const rarities = await CardsDB.getRarities()
  if (rarities.length === 0) { await reply(ctx, 'Não há raridades cadastradas ainda.'); return }

  const attrs = detail.attributes
  const apiArtist = detail.relationships?.artists?.data?.[0]
  const artist = await DiscotecaDB.getOrCreateArtist(
    apiArtist?.id ?? candidate.id,
    (apiArtist?.attributes as { name?: string } | undefined)?.name ?? attrs.artistName ?? candidate.artistName,
  )
  if (!artist) return

  const genreNames = stripGenericMusicGenre(attrs.genreNames ?? [])
  const initialGenres = await DiscotecaDB.resolveGenresByAliases(genreNames, false)
  const suggestedRarity = await inferDiscotecaRarity(attrs.name ?? candidate.name, artist.name, 'single', rarities.map(r => r.name))
  const artworkUrl = resolveArtworkUrl(attrs.artwork, 1000)

  const buildPreview = async (name: string, rarityName: string, rarityEmoji: string, genres: ResolvedGenres, artist: Artist) => {
    const genresLine = genres.resolved.length > 0 ? genres.resolved.map(g => escapeMarkdown(g.name)).join(', ') : '_nenhum gênero mapeado_'
    const unmappedWarning = genres.unmapped.length > 0 ? `\n⚠️ gêneros sem mapeamento ainda: ${genres.unmapped.map(escapeMarkdown).join(', ')} — vão salvar sem eles` : ''
    const artistLine = await artistCardLine(artist)
    return `🎵 **${escapeMarkdown(name)}**\n${escapeMarkdown(artist.name)}\n\n🎼 ${genresLine}${unmappedWarning}\n${artistLine}\n${rarityEmoji} ${escapeMarkdown(rarityName)}`
  }

  const outcome = await runConfirmLoop(
    ctx, messageId, artworkUrl, buildPreview,
    attrs.name ?? candidate.name, suggestedRarity ?? rarities[0]!.name, rarities,
    initialGenres, () => DiscotecaDB.resolveGenresByAliases(genreNames, false),
    async raw => (await DiscotecaDB.resolveGenresByAliases([raw], false)).resolved[0] ?? null,
    artist,
  )
  if (!outcome) return

  const user = await getStaffUser(ctx)
  if (!user) return

  const albumAppleMusicId = detail.relationships?.albums?.data?.[0]?.id
  const existingAlbum = albumAppleMusicId ? await DiscotecaDB.getEntryByAppleMusicId(albumAppleMusicId) : undefined

  const previewUrl = attrs.previews?.[0]?.url
    ? await getOrProcessPreview({
        appleMusicTrackId: candidate.id,
        previewUrl: attrs.previews[0].url,
        title: outcome.name,
        artistName: outcome.artist.name,
        albumName: attrs.albumName,
        releaseDate: attrs.releaseDate,
        genre: genreNames[0],
        artwork: attrs.artwork,
      })
    : null

  const entry = await DiscotecaDB.createEntry({
    name: outcome.name,
    artistId: outcome.artist.id,
    appleMusicId: candidate.id,
    type: 'single',
    rarityId: outcome.rarityId,
    artworkUrl,
    appleMusicUrl: attrs.url,
    releaseDate: attrs.releaseDate ? new Date(attrs.releaseDate) : undefined,
    previewUrl: previewUrl ?? undefined,
    albumAppleMusicId,
    albumId: existingAlbum?.id,
  })
  if (!entry) return

  await DiscotecaDB.setEntryGenres(entry.id, outcome.genres.resolved.map(g => g.id))
  await AuditDB.log(user.id, 'discoteca.create', { entryId: entry.id, name: entry.name, type: 'single', appleMusicId: candidate.id, linkedAlbumId: existingAlbum?.id })

  if (outcome.messageId) await deleteMsg(ctx, outcome.messageId)
  await reply(ctx, `🎵 Single salvo: \`${entry.id}\`. **${escapeMarkdown(entry.name)}**`)
}
