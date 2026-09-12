import { describe, expect, it } from 'bun:test'
import { conversationId } from '@/domain/types'
import { fence } from '@/security/fence'
import { inMemoryInboundLog, type InboundMessage } from '@/telegram/inbound'

const message: InboundMessage = {
  updateId: 70,
  conversationId: conversationId('telegram', '-100', 'customer'),
  role: 'customer',
  chatId: '-100',
  senderId: '42',
  text: fence('hola', 'message'),
  mediaId: null,
  receivedAt: '2026-09-12T09:30:00.000Z',
}

describe('inMemoryInboundLog', () => {
  it('records what it was handed, in order', async () => {
    const log = inMemoryInboundLog()

    await log.record(message)
    await log.record({ ...message, updateId: 71 })

    expect(log.messages.map((recorded) => recorded.updateId)).toEqual([70, 71])
    expect(log.messages[0]?.conversationId).toBe(conversationId('telegram', '-100', 'customer'))
  })
})
