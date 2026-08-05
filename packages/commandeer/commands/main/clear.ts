import { Command } from '@girae/common/commands'
import { rawClient } from '@girae/common/queue'
import { reply, deleteMsg } from '@girae/common/dbos/messaging'
import { DBOS } from '@dbos-inc/dbos-sdk'
import { CardsDB } from '@girae/database/cards'
import { UsersDB } from '@girae/database/users'
import { escapeMarkdown } from '@girae/common/utilities/markdown'
import { mention } from '@girae/common/utilities/mention'
import { buildCtx } from '../../services/syntheticCtx'
import { REVIEW_CHAT_ID, REVIEW_THREAD_ID } from '../cards/upload'
import type { IncomingCommand } from '@girae/common/commands/types'
import GirarCommand from './girar'
import { INVITE_EVENT, FINALIZE_EVENT, NEGOTIATION_TOPIC } from '../cards/trade'

const CATIVEIRO_CANCEL_EVENT = 'clear:cativeiroCancel'

export default class ClearCommand extends Command {
  static override info = {
    name: 'clear',
    description: 'Cancela giros, trocas ou uploads pendentes.',
    usage: '/clear',
    aliases: ['cancel', 'cancelar'],
    useWorkflow: true,
  }

  @DBOS.workflow()
  static override async execute(ctx: IncomingCommand) {
    // must match girarClaim.ts's claimKey - was pointing at a dead namespace nothing wrote to
    const lockKey = `girar:active:${ctx.message.author.id}:${ctx.message.chat.id}`;
    const existingLock = await rawClient.get(lockKey);

    if (existingLock) {
      const lockData = JSON.parse(existingLock);
      const workflowID = lockData.workflowID;

      await rawClient.del(lockKey);

      if (workflowID) {
        await rawClient.del(`workflow:${workflowID}`);

        try {
          await DBOS.send(workflowID, { value: null }, GirarCommand.CATEGORY_SELECTED_EVENT);
          await DBOS.send(workflowID, { value: null }, GirarCommand.SUBCATEGORY_SELECTED_EVENT);
        } catch (e) { }
      }

      await reply(ctx, "✅ Seu giro pendente foi cancelado com sucesso.");
      return;
    }

    const tradeLockKey = `trade:lock:${ctx.message.author.id}`;
    const existingTradeLock = await rawClient.get(tradeLockKey);

    if (existingTradeLock) {
      const { workflowID, partnerId } = JSON.parse(existingTradeLock);

      await rawClient.del(tradeLockKey);
      if (partnerId) await rawClient.del(`trade:lock:${partnerId}`);

      if (workflowID) {
        await rawClient.del(`trade:state:${workflowID}`);
        await rawClient.del(`workflow:${workflowID}`);

        try {
          await DBOS.send(workflowID, { value: 'decline', clickerUserId: ctx.message.author.id }, INVITE_EVENT);
          await DBOS.send(workflowID, { value: 'cancel', clickerUserId: ctx.message.author.id }, FINALIZE_EVENT);
          await DBOS.send(workflowID, { type: 'stateChanged', clickerUserId: ctx.message.author.id }, NEGOTIATION_TOPIC);
        } catch (e) { }
      }

      await reply(ctx, "✅ Sua troca pendente foi cancelada com sucesso.");
      return;
    }

    const user = await UsersDB.getUserByPlatformAccount(ctx.message.platform as 'telegram' | 'discord', ctx.message.author.id);
    const pendingSubmission = user ? await CardsDB.getPendingCativeiroSubmissionForUser(user.id) : undefined;

    if (!pendingSubmission) {
      await reply(ctx, "Você não tem nenhum giro, troca ou upload pendente.");
      return;
    }

    const card = await CardsDB.getCardWithDetails(pendingSubmission.cardId);
    const messageId = await reply(ctx, {
      content: `Você tem uma personalização pendente para o card ${card?.rarityEmoji ?? ''} \`${pendingSubmission.cardId}\`. **${escapeMarkdown(card?.name ?? '?')}**. Quer cancelá-la?`,
      eventName: CATIVEIRO_CANCEL_EVENT,
      restricted: 'author',
      options: [{ title: '✅ Sim, cancelar', data: true }, { title: '❌ Não', data: false }],
    });

    const selection = await DBOS.recv<{ value: boolean, messageId?: string }>(CATIVEIRO_CANCEL_EVENT);
    const confirmedMessageId = selection?.messageId ?? messageId;

    if (!selection?.value) {
      if (confirmedMessageId) await reply(ctx, { content: '❌ Ok, mantendo sua submissão pendente.', editMessageId: confirmedMessageId });
      return;
    }

    const result = await CardsDB.cancelCativeiroSubmission(pendingSubmission.id, user!.id);
    if (!result.ok) {
      await reply(ctx, { content: '⚠️ Essa submissão já foi revisada.', editMessageId: confirmedMessageId });
      return;
    }

    const { submission } = result;
    const reviewCtx = buildCtx('telegram', ctx.message.author.id, ctx.message.author.name, submission.reviewChatId ?? REVIEW_CHAT_ID, REVIEW_THREAD_ID);
    if (submission.reviewMessageId) await deleteMsg(reviewCtx, submission.reviewMessageId);
    await reply(reviewCtx, {
      content: `🚫 CANCELADO_PELO_USUÁRIO\n\n${mention(ctx.message.platform, ctx.message.author.id, ctx.message.author.name)} cancelou a submissão para o card ${card?.rarityEmoji ?? ''} \`${submission.cardId}\`. **${escapeMarkdown(card?.name ?? '?')}**.`,
      photoUrl: submission.mediaUrl,
      isVideo: submission.mediaType === 'video',
    });

    await reply(ctx, { content: '✅ Sua submissão pendente foi cancelada.', editMessageId: confirmedMessageId });
  }
}
