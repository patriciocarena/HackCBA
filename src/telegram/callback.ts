import { z } from 'zod'

const callbackSchema = z.object({
  update_id: z.number().int(),
  callback_query: z.object({
    id: z.string(),
    from: z.object({ id: z.number().int() }),
    message: z.object({ chat: z.object({ id: z.number().int(), type: z.string() }) }),
    data: z.string(),
  }),
})

export type Callback = {
  updateId: number
  callbackId: string
  chatId: string
  privateChat: boolean
  senderId: string
  proposalId: string
  accepted: boolean
}

export type OnCallback = (callback: Callback) => Promise<void>

const KIND = 'edit'
const SEPARATOR = ':'

/**
 * The other half of readCallback, kept in this file so the two cannot drift. The end that
 * mints a button and the end that reads one are written by different people on this board,
 * and a disagreement here is invisible: every unit test on both sides passes and the owner's
 * press finds nothing.
 */
export function confirmData(proposalId: string, accepted: boolean): string {
  if (proposalId.length === 0 || proposalId.includes(SEPARATOR)) {
    throw new Error(`proposal id ${JSON.stringify(proposalId)} cannot go in callback data`)
  }

  return [KIND, proposalId, accepted ? 'yes' : 'no'].join(SEPARATOR)
}

export function readCallback(body: unknown): Callback | null {
  const update = callbackSchema.safeParse(body)
  if (!update.success) return null

  const query = update.data.callback_query
  const parts = query.data.split(SEPARATOR)
  if (parts.length !== 3) return null

  const [kind, proposalId, answer] = parts
  if (kind !== KIND) return null
  if (proposalId === undefined || proposalId.length === 0) return null
  if (answer !== 'yes' && answer !== 'no') return null

  return {
    updateId: update.data.update_id,
    callbackId: query.id,
    chatId: String(query.message.chat.id),
    privateChat: query.message.chat.type === 'private',
    senderId: String(query.from.id),
    proposalId,
    accepted: answer === 'yes',
  }
}
