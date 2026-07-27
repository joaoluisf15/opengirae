import { Command, CommandArgument, CommandArgumentType, Subcommand } from '@girae/common/commands'
import { reply } from '@girae/common/dbos/messaging'
import { CardsDB } from '@girae/database/cards'
import { UsersDB } from '@girae/database/users'
import type { IncomingCommand } from '@girae/common/commands/types'
import { escapeMarkdown } from '@girae/common/utilities/markdown'
import { cativeiroEligibilityGuard, validateCustomEmoji } from '../../services/cards/cativeiro'

type CardDetails = NonNullable<Awaited<ReturnType<typeof CardsDB.getCardWithDetails>>>

export default class EmojicardCommand extends Command {
  static override info = {
    name: 'emojicard',
    description: 'Personaliza um card elegível para cativeiro com um emoji',
    usage: '/emojicard <id do card> <emoji>',
  }

  @CommandArgument([
    { name: 'card', type: CommandArgumentType.CARD, guard: cativeiroEligibilityGuard },
    { name: 'emoji', type: CommandArgumentType.EMOJI, guard: validateCustomEmoji },
  ])
  static override async execute(ctx: IncomingCommand, args: { card: CardDetails; emoji: string }) {
    const user = await UsersDB.getUserByPlatformAccount(ctx.message.platform as 'telegram' | 'discord', ctx.message.author.id)
    if (!user) return

    const emoji = args.emoji.trim()
    const result = await CardsDB.setUserCardCustomEmoji(user.id, args.card.id, emoji)
    if (!result.ok) {
      await reply(ctx, `😔 Você não tem mais cópias suficientes desse card para personalizá-lo. Confira com /cativeiros!`)
      return
    }

    await reply(ctx, `✨ Prontinho! Seu card agora aparece como ${emoji} \`${args.card.id}\`. **${escapeMarkdown(args.card.name)}**.`)
  }

  @Subcommand({ name: 'remover', description: 'Remove o emoji personalizado de um card' })
  @CommandArgument([{ name: 'card', type: CommandArgumentType.CARD }])
  static async remover(ctx: IncomingCommand, args: { card: CardDetails }) {
    const user = await UsersDB.getUserByPlatformAccount(ctx.message.platform as 'telegram' | 'discord', ctx.message.author.id)
    if (!user) return

    const result = await CardsDB.clearUserCardCustomEmoji(user.id, args.card.id)
    if (!result.ok) {
      await reply(ctx, `😅 Você não tem esse card.`)
      return
    }

    await reply(ctx, `🧹 Prontinho! Removi o emoji personalizado de \`${args.card.id}\`. **${escapeMarkdown(args.card.name)}**.`)
  }
}
