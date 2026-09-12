import { describe, expect, it } from 'bun:test'
import { readCallback } from '../../src/telegram/callback'

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
})
