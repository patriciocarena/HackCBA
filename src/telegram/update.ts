import { z } from 'zod'

const fileSchema = z.object({ file_id: z.string() })

const messageSchema = z.object({
  chat: z.object({ id: z.number().int(), type: z.string() }),
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

export type Media = { kind: 'voice'; id: string } | { kind: 'photo'; id: string }

type Update = {
  updateId: number
  chatId: string
  privateChat: boolean
  senderId: string
  text: string | null
  media: Media | null
}

export function readUpdate(body: unknown): Update | null {
  const update = updateSchema.safeParse(body)
  if (!update.success) return null

  const message = update.data.message
  if (message?.from === undefined) return null

  const text = message.text ?? message.caption ?? null
  const media = mediaOf(message)
  if (text === null && media === null) return null

  return {
    updateId: update.data.update_id,
    chatId: String(message.chat.id),
    privateChat: message.chat.type === 'private',
    senderId: String(message.from.id),
    text,
    media,
  }
}

function mediaOf(message: z.infer<typeof messageSchema>): Media | null {
  if (message.voice !== undefined) return { kind: 'voice', id: message.voice.file_id }

  const largest = message.photo?.at(-1)
  if (largest !== undefined) return { kind: 'photo', id: largest.file_id }

  return null
}
