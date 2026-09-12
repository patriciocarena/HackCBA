import { describe, expect, it } from 'bun:test'
import { confirmData, readCallback } from '../../src/telegram/callback'

function anUpdate(data: string) {
  return {
    update_id: 9001,
    callback_query: {
      id: 'cbq_1',
      from: { id: 99900011 },
      message: { chat: { id: 55512345, type: 'private' } },
      data,
    },
  }
}

describe('readCallback', () => {
  it('reads a button press as the two strings it carries and nothing else', () => {
    expect(readCallback(anUpdate('edit:edit_1:yes'))).toEqual({
      updateId: 9001,
      callbackId: 'cbq_1',
      chatId: '55512345',
      privateChat: true,
      senderId: '99900011',
      proposalId: 'edit_1',
      accepted: true,
    })
  })

  it('reads no as a refusal rather than as an absent yes', () => {
    expect(readCallback(anUpdate('edit:edit_1:no'))?.accepted).toBe(false)
  })

  it('refuses data carrying anything beyond the two strings, so a price cannot ride along', () => {
    for (const data of ['edit:edit_1:yes:14520', 'edit:edit_1:yes:', 'edit:edit_1']) {
      expect(readCallback(anUpdate(data))).toBeNull()
    }
  })

  it('refuses an answer it does not know, because an unknown word is not consent', () => {
    for (const data of ['edit:edit_1:si', 'edit:edit_1:YES', 'edit:edit_1:true', 'edit::yes']) {
      expect(readCallback(anUpdate(data))).toBeNull()
    }
  })

  it('refuses an update that is not a button press at all', () => {
    expect(readCallback({ update_id: 1, message: { chat: { id: 1, type: 'private' }, text: 'hola' } })).toBeNull()
    expect(readCallback(null)).toBeNull()
    expect(readCallback({})).toBeNull()
  })
})

describe('confirmData, the other half of readCallback', () => {
  it('mints data that readCallback reads back as the same press', () => {
    for (const accepted of [true, false]) {
      const data = confirmData('018f2c7a-1d4e-7b3f-9a21-0c5e6f7a8b90', accepted)

      expect(readCallback(anUpdate(data))).toMatchObject({
        proposalId: '018f2c7a-1d4e-7b3f-9a21-0c5e6f7a8b90',
        accepted,
      })
    }
  })

  it('refuses an id that would smuggle a fourth segment past the parser', () => {
    expect(() => confirmData('edit_1:14520', true)).toThrow('cannot go in callback data')
    expect(() => confirmData('', true)).toThrow('cannot go in callback data')
  })
})
