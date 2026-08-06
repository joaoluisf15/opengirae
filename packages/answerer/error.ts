export const isPermanentSendError = (err: any) =>
  err?.code === 403 || /not enough rights|kicked from the (?:super)?group|bot was blocked by the user|message is not modified|message to (?:be replied|edit) not found|query is too old|canceled by new edit message request|wrong type of the web page content|message caption is too long|chat not found/i.test(err?.message ?? '')

export const extractRetryAfter = (err: any): number | undefined => {
  const structured = err?.parameters?.retry_after
  if (typeof structured === 'number') return structured
  const parsed = Number(err?.message?.match(/retry after (\d+)/i)?.[1])
  return isNaN(parsed) ? undefined : parsed
}
