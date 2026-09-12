import { z } from 'zod'

const fileSchema = z.object({ file_id: z.string() })

const messageSchema = z.object({
  chat: z.object({ id: z.number().int() }),
  from: z.object({ id: z.number().int() }).optional(),
  text: z.string().optional(),
  caption: z.string().optional(),
  voice: fileSchema.optional(),
  photo: z.array(fileSchema).optional(),
})

const updateSchema = z.object({
  update_id: z.number().int(),
  message: messageSchema.optional(),
})

type Update = {
  updateId: number
  chatId: string
  senderId: string
  text: string | null
  mediaId: string | null
}

export function readUpdate(body: unknown): Update | null {
  const update = updateSchema.safeParse(body)
  if (!update.success) return null

  const message = update.data.message
  if (message?.from === undefined) return null

  const text = message.text ?? message.caption ?? null
  const mediaId = message.voice?.file_id ?? message.photo?.at(-1)?.file_id ?? null
  if (text === null && mediaId === null) return null

  return {
    updateId: update.data.update_id,
    chatId: String(message.chat.id),
    senderId: String(message.from.id),
    text,
    mediaId,
  }
}
