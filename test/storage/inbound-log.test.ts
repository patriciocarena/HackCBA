import { createClient, type Client } from '@libsql/client'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { conversationId } from '@/domain/types'
import { migrate } from '@/storage/migrate'
import { sqliteInboundLog } from '@/storage/inbound-log'
import { localFence, type InboundMessage } from '@/telegram/inbound'

const message: InboundMessage = {
  updateId: 70,
  conversationId: conversationId('telegram', '-100', 'customer'),
  role: 'customer',
  chatId: '-100',
  senderId: '42',
  text: localFence('hola'),
  mediaId: null,
  receivedAt: '2026-09-12T09:30:00.000Z',
}

let client: Client

beforeEach(async () => {
  client = createClient({ url: 'file::memory:' })
  await migrate(client)
})

afterEach(() => {
  client.close()
})

describe('sqliteInboundLog', () => {
  it('records what it was handed, in order', async () => {
    const log = sqliteInboundLog(client)

    await log.record(message)
    await log.record({ ...message, updateId: 71 })

    const recorded = await client.execute('SELECT update_id FROM inbound_messages ORDER BY update_id')

    expect(recorded.rows.map((row) => Number(row.update_id))).toEqual([70, 71])
  })

  it('keeps the conversation, the role and the text it was given', async () => {
    await sqliteInboundLog(client).record(message)

    const recorded = await client.execute('SELECT * FROM inbound_messages')

    expect(recorded.rows[0]).toMatchObject({
      conversation_id: conversationId('telegram', '-100', 'customer'),
      role: 'customer',
      chat_id: '-100',
      sender_id: '42',
      text: 'hola',
      media_id: null,
      received_at: '2026-09-12T09:30:00.000Z',
    })
  })

  it('records a message that carried media and no text', async () => {
    await sqliteInboundLog(client).record({ ...message, text: null, mediaId: 'file_42' })

    const recorded = await client.execute('SELECT text, media_id FROM inbound_messages')

    expect(recorded.rows[0]).toMatchObject({ text: null, media_id: 'file_42' })
  })

  it('refuses a role the domain does not declare', async () => {
    const log = sqliteInboundLog(client)

    await expect(
      log.record({ ...message, role: 'owner' as InboundMessage['role'] }),
    ).rejects.toThrow('CHECK constraint failed')
  })
})
