import { describe, expect, test } from 'bun:test'
import {
  confirmDeposit,
  recordReceipt,
  requestDeposit,
  type Receipt,
  type ReceiptStore,
} from '../../src/domain/deposit'
import { acceptQuote, advanceOrder, quoteFrom, type Actor } from '../../src/domain/order'
import { priceFor } from '../../src/domain/price-for'
import type { IsAdmin } from '../../src/security/allowlist'
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

  // Pins the second half of the `mediaId === null && text === null` guard. Drop this and a
  // mutant that keeps only the mediaId clause refuses every typed transfer, with nothing red.
  test('text with no photo is a receipt', async () => {
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

const admin = { kind: 'person', id: '99900011' } as const
const onlyAdmin: IsAdmin = (id) => id === admin.id

describe('only an admin confirms, and confirming never shows the receipt', () => {
  test('it records who confirmed and when', () => {
    const confirmed = confirmDeposit(awaitingDeposit(), { by: admin, now }, onlyAdmin)

    if (!confirmed.ok) throw new Error(`expected a confirmation, got ${confirmed.reason}`)
    expect(confirmed.order.state).toBe('deposit_confirmed')
    expect(confirmed.order.depositConfirmedBy).toBe('99900011')
    expect(confirmed.order.depositConfirmedAt).toBe(now)
  })

  test('a sender who is not on the allowlist confirms nothing', () => {
    const confirmed = confirmDeposit(awaitingDeposit(), { by: customer, now }, onlyAdmin)

    expect(confirmed).toEqual({ ok: false, reason: 'not_an_admin' })
  })

  test('an unwired caller confirms nobody, because the default denies everyone', () => {
    const confirmed = confirmDeposit(awaitingDeposit(), { by: admin, now })

    expect(confirmed).toEqual({ ok: false, reason: 'not_an_admin' })
  })

  test('a blank alias is no alias, the same refusal the asking end already gives', () => {
    for (const depositAlias of ['', '   ']) {
      const confirmed = confirmDeposit({ ...awaitingDeposit(), depositAlias }, { by: admin, now }, onlyAdmin)

      expect(confirmed).toEqual({ ok: false, reason: 'no_alias' })
    }
  })

  test('the confirmation path cannot reach the receipt it is confirming', async () => {
    const FORGED = 'AgACforged-receipt-that-looks-right'
    const store = aStore()
    const order = awaitingDeposit()

    const got = await recordReceipt(order, { mediaId: FORGED, text: fenced(FORGED), receivedAt: now }, store)
    if (!got.ok) throw new Error(`expected a receipt, got ${got.reason}`)

    const confirmed = confirmDeposit(order, { by: admin, now }, onlyAdmin)
    if (!confirmed.ok) throw new Error(`expected a confirmation, got ${confirmed.reason}`)

    // The receipt reached the store and nothing else. Not the notice the admin reads, not the
    // order they act on, and there is no third thing: confirmDeposit takes no store.
    expect(store.written[0]?.mediaId).toBe(FORGED)
    expect(got.notice).not.toContain(FORGED)
    expect(JSON.stringify(confirmed.order)).not.toContain(FORGED)
  })

  test('the store type has one member, so no reader can be added without failing typecheck', () => {
    // Compile time, not runtime. Naming a key would only guard that name; this fails on any
    // added member whatever it is called, which is what ADR 0012 claims.
    const writeOnly: keyof ReceiptStore extends 'record' ? true : never = true

    expect(writeOnly).toBe(true)
  })
})

describe('the id the caller hands in is the id the allowlist sees', () => {
  test('nothing is stripped or rewritten on the way to the predicate', () => {
    const seen: string[] = []
    const spy: IsAdmin = (id) => {
      seen.push(id)
      return false
    }

    confirmDeposit(awaitingDeposit(), { by: { kind: 'person', id: 'telegram:99900011' }, now }, spy)

    expect(seen).toEqual(['telegram:99900011'])
  })
})

describe('a deposit nobody was given an alias for is not confirmable', () => {
  test('an order walked to deposit_pending around requestDeposit is refused', () => {
    // advanceOrder is public. Reaching deposit_pending through it never names a destination,
    // and confirming that would confirm a transfer to nothing.
    const walked = advanceOrder(anOrder(), { to: 'deposit_pending', by: customer, now })
    if (!walked.ok) throw new Error(`expected deposit_pending, got ${walked.reason}`)

    expect(walked.order.depositAlias).toBeNull()
    expect(confirmDeposit(walked.order, { by: admin, now }, onlyAdmin)).toEqual({
      ok: false,
      reason: 'no_alias',
    })
  })
})
