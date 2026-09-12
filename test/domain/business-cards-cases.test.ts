import { describe, expect, test } from 'bun:test'
import { totalOf } from '../../src/domain/breakdown'
import { priceFor, type PriceForConfig } from '../../src/domain/price-for'
import { quoteText } from '../../src/domain/quote-text'
import type { QuoteIntent, Resolution } from '../../src/domain/types'
import { baseConfig, businessCards, catalogRows, intent, OFFSET_1000, priceOf, withVat } from '../support/catalog'

const quote = (overrides: Partial<QuoteIntent>, config: PriceForConfig = baseConfig): Resolution =>
  priceFor(intent(overrides), catalogRows, config)

function priceOfQuote(overrides: Partial<QuoteIntent>): { total: number; text: string } {
  const resolution = quote(overrides)
  if (resolution.kind !== 'price') throw new Error(`expected a price, got ${resolution.kind}`)
  return {
    total: totalOf(resolution.breakdown),
    text: quoteText(resolution.breakdown, resolution.validityDays),
  }
}

describe('B8: ten business card cases', () => {
  test('1. the opening line of the demo, with everything else missing', () => {
    // Source: PLAN.md section 10, step 1 — "hola, cuánto 1000 tarjetas".
    const resolution = quote({ attributes: { quantity: 1000 } })

    expect(resolution.kind).toBe('ask')
    if (resolution.kind !== 'ask') return
    expect(resolution.missing).toEqual(['paper', 'sides', 'finish'])
  })

  test('2. the same request once the attributes arrive', () => {
    // Source: seed row bc_offset_1000_4_1, copied off the price list.
    expect(priceOfQuote({ attributes: OFFSET_1000 }).total).toBe(withVat(priceOf('bc_offset_1000_4_1')))
  })

  test('3. a quantity the list does not carry', () => {
    // Source: seed rules — "Quantities are the ones in the tables. No intermediate quantity is quoted."
    const resolution = quote({ attributes: { ...OFFSET_1000, quantity: 1500 } })

    expect(resolution.kind).toBe('escalate')
    if (resolution.kind !== 'escalate') return
    expect(resolution.reason).toBe('unsupported_quantity')
  })

  test('4. the first module example the owner worked out: 15 x 5 is two modules', () => {
    // Source: docs/assumptions.md section 2, the owner's own numbers.
    const quoted = priceOfQuote({ attributes: OFFSET_1000, size: { widthCm: 15, heightCm: 5 } })

    expect(quoted.text).toContain('2 módulos')
    expect(quoted.total).toBe(withVat(2 * priceOf('bc_offset_1000_4_1')))
  })

  test('5. the second one: 10 x 15 is four modules, and takes ten percent', () => {
    // Source: docs/assumptions.md section 2, and PLAN.md section 10, step 2.
    const quoted = priceOfQuote({ attributes: OFFSET_1000, size: { widthCm: 10, heightCm: 15 } })

    expect(quoted.text).toContain('4 módulos')
    expect(quoted.text).toContain('10%')
    expect(quoted.total).toBe(withVat(4 * priceOf('bc_offset_1000_4_1') * 0.9))
  })

  test('6. a hundred on special paper, laminated at the price that row carries', () => {
    // Source: seed rows bc_special_100_front and its lamination add-on. The lamination price
    // changes with the base row, which is why add-ons point at rows and not at the family.
    const quoted = priceOfQuote({
      attributes: { quantity: 100, paper: 'special', sides: 'front', finish: 'none' },
      addOns: ['lamination'],
    })

    expect(quoted.total).toBe(
      withVat(priceOf('bc_special_100_front') + priceOf('bc_addon_lamination_special_100_front')),
    )
    expect(quoted.text).toContain('Incluye Laminado')
  })

  test('7. a finish the column shows as a dash is not offered at all', () => {
    // Source: seed rules — "A dash in the list means the finish is not offered in that column.
    // There is no row, so it escalates." Lamination is priced against the special paper rows
    // only, so the illustration column cannot have it.
    const resolution = quote({
      attributes: { quantity: 100, paper: 'illustration_300', sides: 'front', finish: 'none' },
      addOns: ['lamination'],
    })

    expect(resolution.kind).toBe('escalate')
    if (resolution.kind !== 'escalate') return
    expect(resolution.reason).toBe('no_match')
  })

  test('8. a family nobody loaded: it says so instead of inventing one', () => {
    // Source: PLAN.md section 10, step 3, and the exact match rule in section 5. This is the
    // case the previous bot failed: it answered confidently about what it did not have.
    const resolution = quote({ family: 'banners', attributes: { quantity: 1000 } })

    expect(resolution.kind).toBe('escalate')
    if (resolution.kind !== 'escalate') return
    expect(resolution.reason).toBe('out_of_catalog')
    expect(resolution.detail).toContain('no lo tengo cargado')
  })

  test('9. anything sold by the metre waits for the roll width', () => {
    // Source: ticket B4, "the square metre versus linear metre rule is covered", and
    // docs/assumptions.md, where the roll width is still an open question for the owner.
    const byTheMetre: PriceForConfig = {
      ...baseConfig,
      family: { ...businessCards, slug: 'banners', unit: 'linear_meter' },
    }
    const resolution = quote(
      { family: 'banners', attributes: OFFSET_1000, size: { widthCm: 300, heightCm: 100 } },
      byTheMetre,
    )

    expect(resolution.kind).toBe('escalate')
  })

  test('10. every row in the catalog quotes gross, and nothing quotes from outside it', () => {
    // Source: ADR 0003, and the governing metric of this ticket.
    const saleRows = catalogRows.filter((row) => row.kind === 'sale')
    const amounts = new Set<number>()

    for (const row of saleRows) {
      const resolution = quote({ attributes: row.attributes })
      if (resolution.kind !== 'price') throw new Error(`${row.slug} did not quote`)
      expect(totalOf(resolution.breakdown)).toBe(withVat(row.price))
      amounts.add(totalOf(resolution.breakdown))
    }

    // Fourteen sale rows, fourteen distinct amounts, every one of them read off the list.
    expect(saleRows).toHaveLength(14)
    expect(amounts.size).toBe(14)
  })
})
