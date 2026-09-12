import { describe, expect, test } from 'bun:test'
import { withVat } from '../support/fixtures'
import { DELEGATE } from '../../src/domain/handoff'
import { inMemorySale } from '@/conversation/sale'
import { baseConfig, catalogRows } from '@/catalog/business-cards'
import { totalOf } from '@/domain/breakdown'
import { ars } from '@/domain/money'
import { AGENT } from '@/domain/deposit'
import { priceFor } from '@/domain/price-for'
import { conversationId, type Resolution } from '@/domain/types'
import { intent, OFFSET_1000 } from '@test/support/fixtures'
import type { Actor } from '@/domain/order'

const ALIAS = 'dante.imprenta.mp'
const conversation = conversationId('telegram', '55512345', 'customer')
const customer: Actor = { kind: 'person', id: '55512345' }
const now = '2026-09-12T13:00:00.000Z'

const priced: Resolution = priceFor(intent({ attributes: OFFSET_1000 }), catalogRows, baseConfig)

function aSale(at: string = now) {
  let ids = 0

  return inMemorySale({ alias: ALIAS, now: () => at, id: () => `id_${(ids += 1)}` })
}

describe('accepting the quote the conversation was shown', () => {
  test('the order is born and the deposit is asked for, at the price that was agreed', () => {
    const sale = aSale()
    sale.hold(conversation, priced)

    const accepted = sale.accept(conversation, customer)

    expect(accepted.kind).toBe('accepted')
    if (accepted.kind !== 'accepted') return
    expect(accepted.alias).toBe(ALIAS)
    expect(accepted.order.state).toBe('deposit_pending')
    expect(accepted.order.depositAlias).toBe(ALIAS)
    if (priced.kind !== 'price') throw new Error('expected a price')
    expect(totalOf(accepted.order.breakdown)).toBe(totalOf(priced.breakdown))
  })

  test('accepting with no quote held escalates rather than inventing one', () => {
    const accepted = aSale().accept(conversation, customer)

    expect(accepted).toMatchObject({ kind: 'escalate', reason: 'ambiguous' })
  })

  test('an expired quote is refused with something the customer can act on', () => {
    let clock = now
    const sale = inMemorySale({ alias: ALIAS, now: () => clock, id: () => 'id_1' })

    sale.hold(conversation, priced)
    clock = '2026-11-30T13:00:00.000Z'
    const accepted = sale.accept(conversation, customer)

    expect(accepted).toMatchObject({ kind: 'escalate' })
    if (accepted.kind !== 'escalate') return
    expect(accepted.detail).not.toBe(DELEGATE)
    expect(accepted.detail).toContain('venció')
  })

  test('only the conversation that was quoted can accept that quote', () => {
    const sale = aSale()
    sale.hold(conversation, priced)

    const other = conversationId('telegram', '99999999', 'customer')

    expect(sale.accept(other, customer)).toMatchObject({ kind: 'escalate' })
  })

  test('a resolution that is not a price is not held, so it cannot be accepted', () => {
    const sale = aSale()
    sale.hold(conversation, { kind: 'escalate', reason: 'ambiguous', detail: 'x' })

    expect(sale.accept(conversation, customer)).toMatchObject({ kind: 'escalate', reason: 'ambiguous' })
  })
})

const admin: Actor = { kind: 'person', id: '99900011' }
const onlyAdmin = (id: string) => id === '99900011'

function awaitingDeposit() {
  const sale = aSale()
  sale.hold(conversation, priced)
  sale.accept(conversation, customer)

  return sale
}

describe('a person confirms the deposit, and the record says who', () => {
  test('it records who confirmed and when', () => {
    const confirmed = awaitingDeposit().confirmDeposit(conversation, admin, onlyAdmin)

    expect(confirmed.ok).toBe(true)
    if (!confirmed.ok) return
    expect(confirmed.order.state).toBe('deposit_confirmed')
    expect(confirmed.order.depositConfirmedBy).toBe('99900011')
    expect(confirmed.order.depositConfirmedAt).toBe(now)
  })

  test('a sender who is not on the allowlist confirms nothing, and the order does not move', () => {
    const sale = awaitingDeposit()

    expect(sale.confirmDeposit(conversation, customer, onlyAdmin)).toEqual({
      ok: false,
      reason: 'not_an_admin',
    })
    expect(sale.orderFor(conversation)?.state).toBe('deposit_pending')
  })

  test('there is nothing to confirm for a conversation that never accepted', () => {
    const other = conversationId('telegram', '99999999', 'customer')

    expect(aSale().confirmDeposit(other, admin, onlyAdmin)).toEqual({ ok: false, reason: 'not_a_transition' })
  })

  test('confirming twice does not move the order a second time', () => {
    const sale = awaitingDeposit()

    expect(sale.confirmDeposit(conversation, admin, onlyAdmin).ok).toBe(true)
    expect(sale.confirmDeposit(conversation, admin, onlyAdmin)).toEqual({
      ok: false,
      reason: 'not_a_transition',
    })
  })
})

describe('the agent confirms a deposit it could check', () => {
  const reading = { looksLikeReceipt: true, amount: withVat(45_000), destination: ALIAS, confidence: 0.95 }

  function held() {
    const sale = aSale()
    sale.hold(conversation, priced)
    const accepted = sale.accept(conversation, customer)
    if (accepted.kind !== 'accepted') throw new Error(`expected an order, got ${accepted.kind}`)

    return sale
  }

  test('a reading that matches the order moves it, in the sale port, not in a copy', () => {
    const sale = held()

    const got = sale.confirmFromReceipt(conversation, reading)

    expect(got.ok).toBe(true)
    expect(sale.orderFor(conversation)?.state).toBe('deposit_confirmed')
    expect(sale.orderFor(conversation)?.depositConfirmedBy).toBe(AGENT)
  })

  test('a reading that does not match leaves the order where it was', () => {
    const sale = held()

    const got = sale.confirmFromReceipt(conversation, { ...reading, amount: 1 })

    expect(got).toEqual({ ok: false, reason: 'wrong_amount' })
    expect(sale.orderFor(conversation)?.state).toBe('deposit_pending')
  })

  test('no order is not a transition, the same answer confirmDeposit gives', () => {
    expect(aSale().confirmFromReceipt(conversation, reading)).toEqual({ ok: false, reason: 'not_a_transition' })
  })

  test('the amount compared is the order\'s, and the alias is the one this customer was told', () => {
    const sale = held()
    const order = sale.orderFor(conversation)!

    // Both sides of the comparison come from the order, never from the reading.
    expect(totalOf(order.breakdown)).toBe(withVat(45_000))
    expect(order.depositAlias).toBe(ALIAS)
  })
})
