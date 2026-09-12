import { describe, expect, test } from 'bun:test'
import { recordReceipt, requestDeposit, type Receipt, type ReceiptStore } from '../../src/domain/deposit'
import { acceptQuote, advanceOrder, quoteFrom, type Actor } from '../../src/domain/order'
import { priceFor } from '../../src/domain/price-for'
import { conversationId, type Order, type Resolution, type UntrustedText } from '../../src/domain/types'
import { baseConfig, catalogRows, intent, OFFSET_1000 } from '../support/catalog'

const now = '2026-09-12T13:00:00.000Z'
const conversation = conversationId('telegram', '55512345', 'customer')
const customer: Actor = { kind: 'person', id: 'telegram:55512345' }
const ALIAS = 'dante.imprenta.mp'

const priced: Resolution = priceFor(intent({ attributes: OFFSET_1000 }), catalogRows, baseConfig)

function anOrder(): Order {
  const quoted = quoteFrom({ id: 'qt_1', conversationId: conversation, resolution: priced, now })
  if (!quoted.ok) throw new Error(`expected a quote, got ${quoted.reason}`)

  const accepted = acceptQuote(quoted.quote, { id: 'ord_1', now })
  if (!accepted.ok) throw new Error(`expected an order, got ${accepted.reason}`)

  return accepted.order
}

function awaitingDeposit(): Order {
  const asked = requestDeposit(anOrder(), { alias: ALIAS, by: customer, now })
  if (!asked.ok) throw new Error(`expected a deposit request, got ${asked.reason}`)

  return asked.order
}

describe('the alias is sent once, by a person, on an order that is still quoted', () => {
  test('it moves the order to deposit_pending and stamps the alias it sent', () => {
    const asked = requestDeposit(anOrder(), { alias: ALIAS, by: customer, now })

    if (!asked.ok) throw new Error(`expected a deposit request, got ${asked.reason}`)
    expect(asked.order.state).toBe('deposit_pending')
    expect(asked.order.depositAlias).toBe(ALIAS)
  })

  test('an alias that is missing or blank is refused, because it would send money nowhere', () => {
    for (const alias of ['', '   ']) {
      const asked = requestDeposit(anOrder(), { alias, by: customer, now })

      expect(asked).toEqual({ ok: false, reason: 'no_alias' })
    }
  })

  test('asking twice is refused, because the state machine allows the edge once', () => {
    const asked = requestDeposit(awaitingDeposit(), { alias: ALIAS, by: customer, now })

    expect(asked).toEqual({ ok: false, reason: 'not_a_transition' })
  })

  test('the agent cannot ask on its own, the same refusal every other edge gives', () => {
    const asked = requestDeposit(anOrder(), { alias: ALIAS, by: { kind: 'agent' }, now })

    expect(asked).toEqual({ ok: false, reason: 'not_a_person' })
  })
})

function aStore(): ReceiptStore & { written: Receipt[] } {
  const written: Receipt[] = []

  return {
    written,
    async record(receipt) {
      written.push(receipt)
    },
  }
}

const fenced = (text: string) => text as UntrustedText

describe('a receipt is evidence, not a transition', () => {
  test('it is written through the store and the order does not move', async () => {
    const order = awaitingDeposit()
    const store = aStore()

    const got = await recordReceipt(order, { mediaId: 'AgACphoto', text: null, receivedAt: now }, store)

    if (!got.ok) throw new Error(`expected a receipt, got ${got.reason}`)
    expect(store.written).toEqual([{ orderId: 'ord_1', mediaId: 'AgACphoto', text: null, receivedAt: now }])
    expect(order.state).toBe('deposit_pending')
  })

  test('a typed transfer is a receipt too, and arrives already fenced', async () => {
    const store = aStore()

    const got = await recordReceipt(
      awaitingDeposit(),
      { mediaId: null, text: fenced('ya transferí, operación 4471'), receivedAt: now },
      store,
    )

    expect(got.ok).toBe(true)
    expect(store.written[0]?.text).toBe(fenced('ya transferí, operación 4471'))
  })

  test('an order that is not awaiting a deposit writes nothing', async () => {
    const store = aStore()

    const got = await recordReceipt(anOrder(), { mediaId: 'AgACphoto', text: null, receivedAt: now }, store)

    expect(got).toEqual({ ok: false, reason: 'no_deposit_pending' })
    expect(store.written).toEqual([])
  })

  test('a message carrying neither a photo nor text is not a receipt', async () => {
    const store = aStore()

    const got = await recordReceipt(awaitingDeposit(), { mediaId: null, text: null, receivedAt: now }, store)

    expect(got).toEqual({ ok: false, reason: 'empty_receipt' })
    expect(store.written).toEqual([])
  })

  test('the notice the admin reads names the order and sends them to the bank', async () => {
    const got = await recordReceipt(
      awaitingDeposit(),
      { mediaId: 'AgACphoto', text: fenced('mirá el comprobante'), receivedAt: now },
      aStore(),
    )

    if (!got.ok) throw new Error(`expected a receipt, got ${got.reason}`)
    expect(got.notice).toContain('ord_1')
    expect(got.notice).toContain('banco')
  })
})
