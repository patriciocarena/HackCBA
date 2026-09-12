import type { Client } from '@libsql/client'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { conversationId } from '@/domain/types'
import { sqliteInboundLog } from '@/storage/inbound-log'
import { migratedDb } from '@test/support/db'
import { fence } from '@/security/fence'
import type { InboundMessage } from '@/telegram/inbound'

const message: InboundMessage = {
  updateId: 70,
  conversationId: conversationId('telegram', '-100', 'customer'),
  role: 'customer',
  chatId: '-100',
  senderId: '42',
  text: fence('hola', 'message'),
  media: null,
  receivedAt: '2026-09-12T09:30:00.000Z',
}

let client: Client

beforeEach(async () => {
  client = await migratedDb()
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
      text: message.text,
      media_id: null,
      received_at: '2026-09-12T09:30:00.000Z',
    })
  })

  it('records a message that carried media and no text', async () => {
    await sqliteInboundLog(client).record({
      ...message,
      text: null,
      media: { kind: 'voice', id: 'file_42' },
    })

    const recorded = await client.execute('SELECT text, media_id FROM inbound_messages')

    expect(recorded.rows[0]).toMatchObject({ text: null, media_id: 'file_42' })
  })

  it('stores the id of either kind, because the column holds a locator and not a type', async () => {
    const log = sqliteInboundLog(client)

    await log.record({ ...message, text: null, media: { kind: 'voice', id: 'voice_1' } })
    await log.record({ ...message, updateId: 71, text: null, media: { kind: 'photo', id: 'photo_1' } })

    const recorded = await client.execute('SELECT media_id FROM inbound_messages ORDER BY update_id')

    expect(recorded.rows.map((row) => row.media_id)).toEqual(['voice_1', 'photo_1'])
  })

  it('refuses a role the domain does not declare', async () => {
    const log = sqliteInboundLog(client)

    await expect(
      log.record({ ...message, role: 'owner' as InboundMessage['role'] }),
    ).rejects.toThrow('CHECK constraint failed')
  })
})
