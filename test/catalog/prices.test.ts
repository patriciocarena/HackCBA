import { describe, expect, it } from 'bun:test'
import seed from '../../seed/business-cards.json'
import { loadCatalog } from '../../src/catalog/load'
import { totalOf } from '../../src/domain/breakdown'
import { ars } from '../../src/domain/money'
import { priceFor } from '../../src/domain/price-for'
import type { QuoteIntent } from '../../src/domain/types'

const { rows, config } = loadCatalog(seed)

function quote(attributes: QuoteIntent['attributes'], overrides: Partial<QuoteIntent> = {}) {
  return { kind: 'quote', family: config.family.slug, attributes, size: null, addOns: [], ...overrides } as QuoteIntent
}

const SPECIAL_100 = { quantity: 100, paper: 'special', sides: 'front', finish: 'none' }
const OFFSET_1000 = {
  quantity: 1000,
  paper: 'illustration_350',
  sides: 'front_color_back_grayscale',
  finish: 'none',
}

describe('a catalog loaded off the seed', () => {
  it('prices a listed card at the amount the owner typed', () => {
    const resolution = priceFor(quote(SPECIAL_100), rows, config)

    expect(resolution.kind).toBe('price')
    if (resolution.kind !== 'price') throw new Error(resolution.kind)
    expect(totalOf(resolution.breakdown)).toBe(ars(12100))
  })

  it('prices a card by modules with the tier discount the list quantifies', () => {
    const resolution = priceFor(quote(OFFSET_1000, { size: { widthCm: 10, heightCm: 15 } }), rows, config)

    if (resolution.kind !== 'price') throw new Error(resolution.kind)
    expect(resolution.breakdown.moduleFactor).toBe(4)
    expect(resolution.breakdown.moduleDiscountRates).toEqual([0.1])
    expect(totalOf(resolution.breakdown)).toBe(ars(162000))
  })

  it('escalates a quantity the list does not carry instead of interpolating', () => {
    const resolution = priceFor(quote({ ...SPECIAL_100, quantity: 150 }), rows, config)

    expect(resolution).toEqual({
      kind: 'escalate',
      reason: 'unsupported_quantity',
      detail: 'te delego con un humano',
    })
  })
})
