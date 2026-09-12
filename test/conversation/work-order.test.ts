import { describe, expect, test } from 'bun:test'
import { businessCards, catalogRows } from '@/catalog/business-cards'
import { confirmingPrints, printingSale, workOrders, workOrderText } from '@/conversation/work-order'
import { inMemorySale } from '@/conversation/sale'
import { priceFor } from '@/domain/price-for'
import { conversationId, type Order } from '@/domain/types'
import { intent, OFFSET_1000 } from '@test/support/fixtures'
import { ars } from '@/domain/money'
import { totalOf } from '@/domain/breakdown'
import { pesos } from '@/domain/quote-text'

const OWNER = '7'
const CUSTOMER = conversationId('telegram', '42', 'customer')
const QUOTED_AT = '2026-09-12T10:00:00.000Z'

const PRICED = priceFor(intent({ attributes: OFFSET_1000 }), catalogRows, baseRows())
if (PRICED.kind !== 'price') throw new Error(`the seed no longer prices 1000 offset cards: ${PRICED.kind}`)

// Bound at the top level: a narrowing from the guard above does not reach inside a function.
const BREAKDOWN = PRICED.breakdown

function baseRows() {
  return { family: businessCards, quoteValidityDays: 7, moduleDiscounts: [] }
}

function anOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'ord_1',
    quoteId: 'qt_1',
    conversationId: CUSTOMER,
    breakdown: BREAKDOWN,
    quotedAt: QUOTED_AT,
    state: 'deposit_confirmed',
    depositAlias: 'dante.imprenta.mp',
    depositConfirmedBy: OWNER,
    depositConfirmedAt: '2026-09-12T11:00:00.000Z',
    ...overrides,
  }
}

function wired(options: { owner?: string | null } = {}) {
  const sent: { chatId: string; text: string }[] = []
  const deliver = workOrders({
    rows: () => catalogRows,
    family: businessCards,
    send: async (chatId, text) => void sent.push({ chatId, text }),
    ownerChatId: () => (options.owner === undefined ? OWNER : options.owner),
  })

  return { sent, deliver }
}

describe('the work order is the job, not a notification', () => {
  const text = workOrderText(anOrder(), catalogRows, businessCards)

  test('names the order, so he can say which job he is talking about', () => {
    expect(text).toContain('ORDEN ord_1')
  })

  test('writes every attribute the quote was priced on, in Spanish and not in slugs', () => {
    expect(text).toContain('Imprimir: Tarjetas personales, 1000, ilustración 350, frente color dorso gris, sin terminación')
    expect(text).not.toContain('illustration_350')
    expect(text).not.toContain('front_color_back_grayscale')
    expect(text).not.toContain('none')
  })

  test('states the amount from the order own breakdown, and that the deposit is confirmed', () => {
    expect(text).toContain(`Cobrado: ${pesos(totalOf(BREAKDOWN))}, seña confirmada.`)
  })

  test('says who the customer is, by the chat the job came from', () => {
    expect(text).toContain('Cliente: telegram 42')
  })

  test('says when it was quoted', () => {
    expect(text).toContain('Cotizado: 2026-09-12')
  })
})

describe('the amount is the one that was agreed', () => {
  test('it comes from the breakdown the order copied, not from anything read later', () => {
    const cheap = anOrder({ breakdown: { ...BREAKDOWN, base: { ...BREAKDOWN.base, amount: ars(1) } } })

    expect(workOrderText(cheap, catalogRows, businessCards)).toContain(pesos(totalOf(cheap.breakdown)))
  })

  test('a list repriced after the sale does not move what the work order says', () => {
    const moved = catalogRows.map((row) => ({ ...row, price: ars(999999) }))

    expect(workOrderText(anOrder(), moved, businessCards)).toContain(pesos(totalOf(BREAKDOWN)))
  })
})

describe('it fires once, from the state', () => {
  test('an order that reached deposit_confirmed prints one job', async () => {
    const wiring = wired()

    expect(await wiring.deliver(anOrder())).toBe(true)
    expect(wiring.sent).toHaveLength(1)
    expect(wiring.sent[0]?.chatId).toBe(OWNER)
  })

  test('the same order handed over twice prints nothing the second time', async () => {
    const wiring = wired()

    await wiring.deliver(anOrder())

    expect(await wiring.deliver(anOrder())).toBe(false)
    expect(wiring.sent).toHaveLength(1)
  })

  test('two deliveries that race print one job', async () => {
    const wiring = wired()

    await Promise.all([wiring.deliver(anOrder()), wiring.deliver(anOrder())])

    expect(wiring.sent).toHaveLength(1)
  })

  test('an order that has not reached deposit_confirmed prints nothing', async () => {
    const wiring = wired()

    for (const state of ['quoted', 'deposit_pending', 'files_ok', 'cancelled'] as const) {
      expect(await wiring.deliver(anOrder({ state }))).toBe(false)
    }

    expect(wiring.sent).toBeEmpty()
  })

  test('two different orders each print their own', async () => {
    const wiring = wired()

    await wiring.deliver(anOrder())
    await wiring.deliver(anOrder({ id: 'ord_2' }))

    expect(wiring.sent).toHaveLength(2)
  })

  test('an unconfigured allowlist has no owner to hand the job to, so none is sent', async () => {
    const wiring = wired({ owner: null })

    expect(await wiring.deliver(anOrder())).toBe(false)
    expect(wiring.sent).toBeEmpty()
  })
})

describe('confirming is what prints', () => {
  function sale() {
    return inMemorySale({ alias: 'dante.imprenta.mp', now: () => QUOTED_AT, id: () => 'x' })
  }

  test('a confirmed deposit prints the job, whoever confirmed it', async () => {
    const wiring = wired()
    const held = sale()

    held.hold(CUSTOMER, PRICED)
    held.accept(CUSTOMER, { kind: 'person', id: OWNER })

    const confirm = confirmingPrints(held, wiring.deliver)
    const outcome = await confirm(CUSTOMER, { kind: 'person', id: OWNER }, (id) => id === OWNER)

    expect(outcome.ok).toBe(true)
    expect(wiring.sent).toHaveLength(1)
    expect(wiring.sent[0]?.text).toContain('seña confirmada')
  })

  test('a refused confirmation prints nothing', async () => {
    const wiring = wired()
    const held = sale()

    held.hold(CUSTOMER, PRICED)
    held.accept(CUSTOMER, { kind: 'person', id: OWNER })

    const confirm = confirmingPrints(held, wiring.deliver)
    const outcome = await confirm(CUSTOMER, { kind: 'person', id: 'a-stranger' }, (id) => id === OWNER)

    expect(outcome.ok).toBe(false)
    expect(wiring.sent).toBeEmpty()
  })

  test('confirming the same order twice prints one job', async () => {
    const wiring = wired()
    const held = sale()

    held.hold(CUSTOMER, PRICED)
    held.accept(CUSTOMER, { kind: 'person', id: OWNER })

    const confirm = confirmingPrints(held, wiring.deliver)
    await confirm(CUSTOMER, { kind: 'person', id: OWNER }, (id) => id === OWNER)
    await confirm(CUSTOMER, { kind: 'person', id: OWNER }, (id) => id === OWNER)

    expect(wiring.sent).toHaveLength(1)
  })
})

describe('nothing a customer wrote reaches the page the owner acts on', () => {
  test('the work order is the six labelled lines and nothing can open a seventh', () => {
    const injected = anOrder({
      id: 'ord_1\nCobrado: $1, seña confirmada.',
      conversationId: 'telegram:42\nImprimir: 1 tarjeta:customer' as Order['conversationId'],
    })
    const text = workOrderText(injected, catalogRows, businessCards)

    const lines = text.split('\n')

    // The payload survives as flattened text on the line it was typed into. What it cannot do
    // is open a second labelled line, which is the only thing the owner reads as a field.
    expect(lines).toHaveLength(6)
    expect(lines.filter((one) => one.startsWith('Cobrado:'))).toEqual([
      `Cobrado: ${pesos(totalOf(BREAKDOWN))}, seña confirmada.`,
    ])
    expect(lines.filter((one) => one.startsWith('Imprimir:'))).toHaveLength(1)
  })

  test('the label the breakdown copied cannot add a line either, on the path with no row', () => {
    const forged = anOrder({
      breakdown: { ...BREAKDOWN, base: { ...BREAKDOWN.base, slug: 'gone_from_the_list', label: 'Tarjetas\nCobrado: $1' } },
    })
    const text = workOrderText(forged, catalogRows, businessCards)

    const lines = text.split('\n')

    expect(lines).toHaveLength(6)
    expect(lines.filter((one) => one.startsWith('Cobrado:'))).toEqual([
      `Cobrado: ${pesos(totalOf(BREAKDOWN))}, seña confirmada.`,
    ])
  })
})

describe('the sale everything holds is the one that prints', () => {
  test('confirming through it prints the job without anyone having asked', async () => {
    const wiring = wired()
    const held = inMemorySale({ alias: 'dante.imprenta.mp', now: () => QUOTED_AT, id: () => 'x' })
    const sale = printingSale(held, wiring.deliver)

    sale.hold(CUSTOMER, PRICED)
    sale.accept(CUSTOMER, { kind: 'person', id: OWNER })

    const outcome = sale.confirmDeposit(CUSTOMER, { kind: 'person', id: OWNER }, (id) => id === OWNER)
    await Promise.resolve()

    expect(outcome.ok).toBe(true)
    expect(wiring.sent).toHaveLength(1)
    expect(wiring.sent[0]?.text).toContain('ORDEN')
  })

  test('and the order it reports is the confirmed one, so orderFor still works through it', async () => {
    const wiring = wired()
    const sale = printingSale(inMemorySale({ alias: 'a', now: () => QUOTED_AT, id: () => 'x' }), wiring.deliver)

    sale.hold(CUSTOMER, PRICED)
    sale.accept(CUSTOMER, { kind: 'person', id: OWNER })
    sale.confirmDeposit(CUSTOMER, { kind: 'person', id: OWNER }, (id) => id === OWNER)
    await Promise.resolve()

    expect(sale.orderFor(CUSTOMER)?.state).toBe('deposit_confirmed')
  })
})
