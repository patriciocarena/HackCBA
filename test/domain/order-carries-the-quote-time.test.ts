import { describe, expect, test } from 'bun:test'
import { acceptQuote, quoteFrom } from '@/domain/order'
import { conversationId } from '@/domain/types'
import { baseConfig, catalogRows } from '@/catalog/business-cards'
import { priceFor } from '@/domain/price-for'
import { intent, OFFSET_1000 } from '@test/support/fixtures'

const QUOTED_AT = '2026-09-12T10:00:00.000Z'
const ACCEPTED_AT = '2026-09-12T11:30:00.000Z'

describe('an order knows when it was quoted', () => {
  test('the quote time is copied onto the order, like the breakdown beside it', () => {
    const resolution = priceFor(intent({ attributes: OFFSET_1000 }), catalogRows, baseConfig)
    const quote = quoteFrom({
      id: 'qt_1',
      conversationId: conversationId('telegram', '42', 'customer'),
      resolution,
      now: QUOTED_AT,
    })
    if (!quote.ok) throw new Error(`the seed no longer quotes 1000 offset cards: ${quote.reason}`)

    const order = acceptQuote(quote.quote, { id: 'ord_1', now: ACCEPTED_AT })
    if (!order.ok) throw new Error(`the quote was refused: ${order.reason}`)

    expect(order.order.quotedAt).toBe(QUOTED_AT)
    expect(order.order.quotedAt).not.toBe(ACCEPTED_AT)
  })
})
