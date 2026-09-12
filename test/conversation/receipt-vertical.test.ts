import { describe, expect, test } from 'bun:test'
import { catalogRows, baseConfig } from '@/catalog/business-cards'
import { customerTurn } from '@/conversation/customer-turn'
import { receiptTurn } from '@/conversation/receipt-path'
import { inMemorySale } from '@/conversation/sale'
import type { TurnDeps } from '@/conversation/turn'
import type { Receipt, ReceiptStore } from '@/domain/deposit'
import { conversationId } from '@/domain/types'
import { adminAllowlist } from '@/security/allowlist'
import type { Send } from '@/telegram/send'
import { telegramWebhook } from '@/telegram/webhook'
import { OFFSET_1000 } from '@test/support/fixtures'

const SECRET = 'a-long-random-string'
const NOW = '2026-09-12T18:00:00.000Z'
const ADMIN = '77'
const CUSTOMER_CHAT = '-100'
const conversation = conversationId('telegram', CUSTOMER_CHAT, 'customer')

const QUOTE = {
  kind: 'quote',
  family: 'business_cards',
  attributes: OFFSET_1000,
  size: null,
  addOns: [],
  factKey: null,
}

const ACCEPT = { kind: 'accept', family: null, attributes: {}, size: null, addOns: [], factKey: null }

/**
 * The composition route.ts builds, with the two model calls replaced and nothing else. The
 * sale port is built once, and the receipt path is handed its `orderFor` rather than a store
 * of its own: that is the whole point of the test.
 */
function vertical() {
  const written: Receipt[] = []
  const notices: string[] = []
  const replies: { chatId: string; text: string }[] = []
  const answers: unknown[] = [QUOTE, ACCEPT]

  const sale = inMemorySale({ alias: 'dante.imprenta.mp', now: () => NOW, id: sequence('id') })
  const store: ReceiptStore = { async record(receipt) { written.push(receipt) } }
  const send: Send = async (chatId, text) => void replies.push({ chatId, text })

  const deps: TurnDeps = {
    rows: () => catalogRows,
    config: baseConfig,
    facts: [],
    extract: async () => answers.shift() ?? { kind: 'other', family: null, attributes: {}, size: null, addOns: [], factKey: null },
    write: async (request) => passThrough(request.user),
    sale,
  }

  const webhook = telegramWebhook({
    secret: SECRET,
    turn: receiptTurn(
      { findOrder: sale.orderFor, store, notify: async (text) => void notices.push(text) },
      customerTurn(deps, send),
    ),
    onCallback: async () => {},
  })

  return { webhook, sale, written, notices, replies }
}

/** The writer copies the answer block it was handed, which is all the amount check allows. */
function passThrough(user: string): string {
  const blocks = user.split('\n\n')

  return blocks[blocks.length - 1]!.split('\n').slice(1, -1).join('\n')
}

function sequence(prefix: string): () => string {
  let n = 0

  return () => `${prefix}_${(n += 1)}`
}

function says(updateId: number, text: string): Request {
  return delivery(updateId, { text })
}

function sendsAPhoto(updateId: number, fileId: string): Request {
  return delivery(updateId, { photo: [{ file_id: fileId }] })
}

function delivery(updateId: number, message: Record<string, unknown>): Request {
  return new Request('https://dante.example/telegram/webhook', {
    method: 'POST',
    headers: { 'X-Telegram-Bot-Api-Secret-Token': SECRET, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      update_id: updateId,
      message: { chat: { id: Number(CUSTOMER_CHAT), type: 'supergroup' }, from: { id: 42 }, ...message },
    }),
  })
}

describe('the receipt attaches to the order the confirmation moves', () => {
  test('quote, accept, photo, confirm, and the order reaches deposit_confirmed', async () => {
    const { webhook, sale, written, notices } = vertical()

    await webhook(says(1, 'hola, cuánto 1000 tarjetas'))
    await webhook(says(2, 'dale, la quiero'))

    const ordered = sale.orderFor(conversation)
    expect(ordered?.state).toBe('deposit_pending')

    await webhook(sendsAPhoto(3, 'AgACtransfer'))

    // One store, one order. The receipt names the order the sale port is holding, and the
    // confirmation below moves that same one.
    expect(written).toHaveLength(1)
    expect(written[0]?.orderId).toBe(ordered!.id)
    expect(notices).toHaveLength(1)
    expect(notices[0]).toContain(ordered!.id)

    const confirmed = sale.confirmDeposit(conversation, { kind: 'person', id: ADMIN }, adminAllowlist({ ids: ADMIN }))
    if (!confirmed.ok) throw new Error(`expected a confirmation, got ${confirmed.reason}`)

    expect(confirmed.order.id).toBe(written[0]!.orderId)
    expect(confirmed.order.state).toBe('deposit_confirmed')
    expect(confirmed.order.depositConfirmedBy).toBe(ADMIN)
  })

  test('a second photo after the confirmation writes nothing', async () => {
    const { webhook, sale, written, notices } = vertical()

    await webhook(says(1, 'hola, cuánto 1000 tarjetas'))
    await webhook(says(2, 'dale, la quiero'))
    await webhook(sendsAPhoto(3, 'AgACtransfer'))

    sale.confirmDeposit(conversation, { kind: 'person', id: ADMIN }, adminAllowlist({ ids: ADMIN }))

    await webhook(sendsAPhoto(4, 'AgACsecond'))

    // The state has to be read back from the sale port on every message. A copy taken when
    // the first receipt arrived would still read deposit_pending and record this one.
    expect(written).toHaveLength(1)
    expect(notices).toHaveLength(1)
    expect(sale.orderFor(conversation)?.state).toBe('deposit_confirmed')
  })
})
