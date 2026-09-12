import { describe, expect, test } from 'bun:test'
import { inMemorySale } from '@/conversation/sale'
import { baseConfig, catalogRows } from '@/catalog/business-cards'
import { totalOf } from '@/domain/breakdown'
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
    expect(accepted.detail).not.toBe('te delego con un humano')
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
