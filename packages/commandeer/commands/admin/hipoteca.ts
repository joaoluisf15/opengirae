import { Command, CommandArgument, CommandArgumentType } from '@girae/common/commands'
import { DBOS } from '@dbos-inc/dbos-sdk'
import { CardsDB, HIPOTECA_RARITY_NAME } from '@girae/database/cards'
import { UsersDB } from '@girae/database/users'
import { AuditDB } from '@girae/database/audit'
import { reply, deleteMsg } from '@girae/common/dbos/messaging'
import { buildCtx } from '../../services/syntheticCtx'
import type { IncomingCommand } from '@girae/common/commands/types'
import { escapeMarkdown } from '@girae/common/utilities/markdown'

const CONFIRM_EVENT = 'hipoteca:confirm'
const CONFIRM_LIST_LIMIT = 20

type Target = { id: number; displayName: string }

// caps a rendered card list so the confirm message can't blow past Telegram's ~4096 char limit
function renderCardList(lines: string[]): string {
  if (lines.length <= CONFIRM_LIST_LIMIT) return lines.join('\n');
  return `${lines.slice(0, CONFIRM_LIST_LIMIT).join('\n')}\n…e mais ${lines.length - CONFIRM_LIST_LIMIT}`;
}

export default class HipotecaCommand extends Command {
  static override info = {
    guards: ['isAdmin'],
    name: 'hipoteca',
    description: 'Hipoteca (ou devolve) os cards lendários de um usuário (staff)',
    usage: '/hipoteca @usuário (ou em resposta ao usuário)',
    useWorkflow: true,
  }

  @DBOS.workflow()
  @CommandArgument([{ name: 'target', type: CommandArgumentType.USER_MENTION }])
  static override async execute(ctx: IncomingCommand, args: { target: string }) {
    const staff = await UsersDB.getUserByPlatformAccount(ctx.message.platform as 'telegram' | 'discord', ctx.message.author.id)
    if (!staff) return

    const target = await UsersDB.getUserByPlatformAccount(ctx.message.platform as 'telegram' | 'discord', args.target)
    if (!target) {
      await reply(ctx, 'Não encontrei esse usuário. Ele já usou a bot?')
      return
    }

    const activeSession = await CardsDB.getActiveHipotecaSession(target.id)
    if (activeSession) {
      await HipotecaCommand.confirmAndReturn(ctx, staff.id, target, args.target, activeSession)
      return
    }

    await HipotecaCommand.confirmAndApply(ctx, staff.id, target, args.target)
  }

  static async confirmAndApply(ctx: IncomingCommand, staffId: number, target: Target, targetPlatformId: string) {
    const owned = await CardsDB.getUserCardsByRarityName(target.id, HIPOTECA_RARITY_NAME)
    if (owned.length === 0) {
      await reply(ctx, `😅 **${escapeMarkdown(target.displayName)}** não tem nenhum card lendário para hipotecar.`)
      return
    }

    const list = renderCardList(owned.map(c => `${c.rarityEmoji} \`${c.cardId}\`. ${escapeMarkdown(c.name)} (\`${c.count}x\`)`))
    await reply(ctx, {
      content: `🔒 Hipotecar **${owned.length}** card(s) lendário(s) de **${escapeMarkdown(target.displayName)}**?\n\n${list}`,
      eventName: CONFIRM_EVENT,
      restricted: 'author',
      options: [{ title: '✅ Confirmar', data: true }, { title: '❌ Cancelar', data: false }],
    })

    const confirmSelection = await DBOS.recv<{ value: boolean, messageId?: string }>(CONFIRM_EVENT)
    if (confirmSelection?.messageId) await deleteMsg(ctx, confirmSelection.messageId)
    if (!confirmSelection?.value) return

    const result = await CardsDB.applyHipoteca(target.id, staffId)
    if (!result.ok) {
      await reply(ctx, '😅 Não deu certo — talvez já exista uma hipoteca ativa pra esse usuário. Tente de novo.')
      return
    }

    await AuditDB.log(staffId, 'user.hipotecaApply', { targetUserId: target.id, cardCount: result.cards.length })

    const dm = buildCtx(ctx.message.platform, targetPlatformId, target.displayName, targetPlatformId)
    await reply(dm, '🔒 Seus cards lendários foram hipotecados temporariamente pela staff. Você será avisado quando eles forem devolvidos.')

    await reply(ctx, `🔒 Pronto! **${result.cards.length}** card(s) lendário(s) de **${escapeMarkdown(target.displayName)}** foram hipotecados.`)
  }

  static async confirmAndReturn(
    ctx: IncomingCommand,
    staffId: number,
    target: Target,
    targetPlatformId: string,
    session: NonNullable<Awaited<ReturnType<typeof CardsDB.getActiveHipotecaSession>>>,
  ) {
    const list = renderCardList(session.holdings.map(c => `${c.rarityEmoji} \`${c.cardId}\`. ${escapeMarkdown(c.name)} (\`${c.count}x\`)`))
    await reply(ctx, {
      content: `🔓 Devolver **${session.holdings.length}** card(s) lendário(s) para **${escapeMarkdown(target.displayName)}**?\n\n${list}`,
      eventName: CONFIRM_EVENT,
      restricted: 'author',
      options: [{ title: '✅ Confirmar', data: true }, { title: '❌ Cancelar', data: false }],
    })

    const confirmSelection = await DBOS.recv<{ value: boolean, messageId?: string }>(CONFIRM_EVENT)
    if (confirmSelection?.messageId) await deleteMsg(ctx, confirmSelection.messageId)
    if (!confirmSelection?.value) return

    const result = await CardsDB.liftHipoteca(session.id)
    if (!result) {
      await reply(ctx, '😅 Não deu certo — essa hipoteca já não existe mais.')
      return
    }

    await AuditDB.log(staffId, 'user.hipotecaReturn', { targetUserId: target.id, cardCount: result.cards.length })

    const dm = buildCtx(ctx.message.platform, targetPlatformId, target.displayName, targetPlatformId)
    await reply(dm, '🔓 Seus cards lendários foram devolvidos! Já estão de volta na sua coleção.')

    await reply(ctx, `🔓 Pronto! **${result.cards.length}** card(s) lendário(s) foram devolvidos para **${escapeMarkdown(target.displayName)}**.`)
  }
}
