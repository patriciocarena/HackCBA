import { describe, expect, it } from 'bun:test'
import { readUpdate } from '@/telegram/update'

function message(fields: Record<string, unknown>) {
  return { update_id: 70, message: { message_id: 1, chat: { id: -100, type: 'private' }, from: { id: 42, is_bot: false }, ...fields } }
}

describe('readUpdate', () => {
  it('reads the ids as strings and the text of a plain message', () => {
    expect(readUpdate(message({ text: 'cuánto 1000 tarjetas' }))).toEqual({
      updateId: 70,
      chatId: '-100',
      senderId: '42',
      text: 'cuánto 1000 tarjetas',
      mediaId: null,
    })
  })

  it('takes the voice file as the media id', () => {
    const parsed = readUpdate(message({ voice: { file_id: 'voice-1', duration: 3 } }))

    expect(parsed).toMatchObject({ text: null, mediaId: 'voice-1' })
  })

  it('takes the largest photo and reads its caption as the text', () => {
    const parsed = readUpdate(
      message({ caption: 'la lista nueva', photo: [{ file_id: 'small' }, { file_id: 'large' }] }),
    )

    expect(parsed).toMatchObject({ text: 'la lista nueva', mediaId: 'large' })
  })

  it('refuses an update with no sender, because there is no id to place a role against', () => {
    expect(readUpdate({ update_id: 70, message: { chat: { id: -100 }, text: 'hola' } })).toBeNull()
  })

  it('refuses a message carrying neither text nor media', () => {
    expect(readUpdate(message({ sticker: { file_id: 's' } }))).toBeNull()
  })

  it('refuses a body that is not an update', () => {
    expect(readUpdate({ hello: 'world' })).toBeNull()
    expect(readUpdate(null)).toBeNull()
  })
})
