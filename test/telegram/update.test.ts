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
      privateChat: true,
      senderId: '42',
      text: 'cuánto 1000 tarjetas',
      media: null,
    })
  })

  it('takes the voice file as the media id', () => {
    const parsed = readUpdate(message({ voice: { file_id: 'voice-1', duration: 3 } }))

    expect(parsed).toMatchObject({ text: null, media: { kind: 'voice', id: 'voice-1' } })
  })

  it('takes the largest photo and reads its caption as the text', () => {
    const parsed = readUpdate(
      message({ caption: 'la lista nueva', photo: [{ file_id: 'small' }, { file_id: 'large' }] }),
    )

    expect(parsed).toMatchObject({ text: 'la lista nueva', media: { kind: 'photo', id: 'large' } })
  })

  it('keeps a photo apart from a voice note, because only one of the two can be transcribed', () => {
    const photo = readUpdate(message({ photo: [{ file_id: 'large' }], voice: undefined }))
    const voice = readUpdate(message({ voice: { file_id: 'voice-1' } }))

    expect(photo).toMatchObject({ media: { kind: 'photo' } })
    expect(voice).toMatchObject({ media: { kind: 'voice' } })
  })

  it('reports a group chat as not private, so a role decision can see it', () => {
    const parsed = readUpdate({
      update_id: 70,
      message: { chat: { id: -100, type: 'supergroup' }, from: { id: 42 }, text: 'hola' },
    })

    expect(parsed).toMatchObject({ privateChat: false })
  })

  it('refuses an update with no sender, because there is no id to place a role against', () => {
    expect(readUpdate({ update_id: 70, message: { chat: { id: -100, type: 'private' }, text: 'hola' } })).toBeNull()
  })

  it('refuses a message carrying neither text nor media', () => {
    expect(readUpdate(message({ sticker: { file_id: 's' } }))).toBeNull()
  })

  it('refuses a body that is not an update', () => {
    expect(readUpdate({ hello: 'world' })).toBeNull()
    expect(readUpdate(null)).toBeNull()
  })
})
