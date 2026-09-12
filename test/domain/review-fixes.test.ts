import { describe, expect, test } from 'bun:test'
import { baseConfig, businessCards, catalogRows } from '../../src/catalog/business-cards'
import { totalOf } from '../../src/domain/breakdown'
import { priceFor, type PriceForConfig } from '../../src/domain/price-for'
import { quoteIntentSchema, type QuoteIntent, type Resolution } from '../../src/domain/types'
import { intent, OFFSET_1000, priceOf, SPECIAL_100, withVat } from '../support/fixtures'

const quote = (overrides: Partial<QuoteIntent>, config: Partial<PriceForConfig> = {}): Resolution =>
  priceFor(intent(overrides), catalogRows, { ...baseConfig, ...config })

const schema = quoteIntentSchema(businessCards)

function totalFor(overrides: Partial<QuoteIntent>, config: Partial<PriceForConfig> = {}): number {
  const resolution = quote(overrides, config)
  if (resolution.kind !== 'price') throw new Error(`expected a price, got ${resolution.kind}`)
  return totalOf(resolution.breakdown)
}

describe('every add-on the list prices is reachable, and only through its own group', () => {
  test('all six groups the list carries are declared by the family', () => {
    expect([...businessCards.addOns].sort()).toEqual([
      'circular_cut',
      'design',
      'extra_cut',
      'label_perforation',
      'lamination',
      'rounded_corners',
    ])
  })

  test('a family wide group resolves to the row matching the quantity', () => {
    // Puntas redondeadas costs 2.200 at 100, not the 200 or the 1000 row.
    expect(totalFor({ attributes: SPECIAL_100, addOns: ['rounded_corners'] })).toBe(
      withVat(priceOf('bc_special_100_front') + priceOf('bc_addon_rounded_corners_100')),
    )
  })

  test('a group priced against the sale row resolves to that row', () => {
    expect(totalFor({ attributes: SPECIAL_100, addOns: ['lamination'] })).toBe(
      withVat(priceOf('bc_special_100_front') + priceOf('bc_addon_lamination_special_100_front')),
    )
  })

  test('a group with no quantity or row of its own applies to the whole family', () => {
    expect(totalFor({ attributes: SPECIAL_100, addOns: ['design'] })).toBe(
      withVat(priceOf('bc_special_100_front') + priceOf('bc_addon_design')),
    )
  })

  // The engine used to match an add-on by substring against its slug and its label, so a
  // fragment of a word bought a row. `seño` resolved to Diseño and added 20.000 pesos.
  test('a fragment of a group name buys nothing', () => {
    for (const fragment of ['seño', 'd', 'corte', 'lamin']) {
      expect(() => schema.parse(intent({ attributes: SPECIAL_100, addOns: [fragment] }))).toThrow()
    }
  })

  test('a group the family declares but this job has no row for escalates', () => {
    // Corte circular is priced per thousand, and this is a hundred card job.
    const resolution = quote({ attributes: SPECIAL_100, addOns: ['circular_cut'] })

    expect(resolution.kind).toBe('escalate')
    if (resolution.kind !== 'escalate') return
    expect(resolution.reason).toBe('no_match')
  })
})

// Two things the customer asked for used to become one: the exact path dropped the add-on and
// the module path dropped the finish, so the same request came back at two different prices
// and the cheaper one was a quote below cost.
describe('everything the customer asked for is on the quote', () => {
  test('two add-ons are both charged', () => {
    expect(totalFor({ attributes: SPECIAL_100, addOns: ['lamination', 'design'] })).toBe(
      withVat(
        priceOf('bc_special_100_front') +
          priceOf('bc_addon_lamination_special_100_front') +
          priceOf('bc_addon_design'),
      ),
    )
  })

  test('the same two add-ons cost the same whether or not a size was named', () => {
    const exact = totalFor({ attributes: SPECIAL_100, addOns: ['lamination', 'design'] })
    const sized = totalFor({
      attributes: SPECIAL_100,
      addOns: ['lamination', 'design'],
      size: { widthCm: 8.5, heightCm: 5 },
    })

    expect(sized).toBe(exact)
  })
})

describe('a quantity is a number, and a number that is not in the list is said so', () => {
  test('a quantity written as text never silently misses the row', () => {
    expect(() =>
      schema.parse(intent({ attributes: { ...SPECIAL_100, quantity: '100' } })),
    ).toThrow()
  })

  test('a quantity the list does not carry is named as the reason', () => {
    const resolution = quote({ attributes: { ...OFFSET_1000, quantity: 700 } })

    expect(resolution.kind).toBe('escalate')
    if (resolution.kind !== 'escalate') return
    expect(resolution.reason).toBe('unsupported_quantity')
  })

  test('a combination the list does not carry is not blamed on the quantity', () => {
    // 100 is a quantity the list carries; special paper with a UV front is not a row.
    const resolution = quote({ attributes: { ...SPECIAL_100, finish: 'uv_front' } })

    expect(resolution.kind).toBe('escalate')
    if (resolution.kind !== 'escalate') return
    expect(resolution.reason).toBe('no_match')
  })
})

// Ids are the slugs the owner typed. They were array positions, then a hash of the slug, and
// both meant that inserting a row could silently repoint a stored quote at another product.
describe('every line names the row it came from', () => {
  test('the base and its add-ons carry the seed slug', () => {
    const resolution = quote({ attributes: SPECIAL_100, addOns: ['lamination'] })

    if (resolution.kind !== 'price') throw new Error('expected a price')
    expect(resolution.breakdown.base.slug).toBe('bc_special_100_front')
    expect(resolution.breakdown.addOns[0].slug).toBe('bc_addon_lamination_special_100_front')
  })

  test('inserting a row ahead of it does not move which row a quote points at', () => {
    const extra = { ...catalogRows[0], slug: 'bc_brand_new_row', attributes: { quantity: 250 } }
    const shifted = priceFor(intent({ attributes: SPECIAL_100 }), [extra, ...catalogRows], baseConfig)

    if (shifted.kind !== 'price') throw new Error('expected a price')
    expect(shifted.breakdown.base.slug).toBe('bc_special_100_front')
  })
})

describe('the module path prices like the exact path, discounts and all', () => {
  test('an absent discount table means no discount, not a refusal', () => {
    expect(
      totalFor({ attributes: OFFSET_1000, size: { widthCm: 10, heightCm: 15 } }, { moduleDiscounts: undefined }),
    ).toBe(withVat(4 * priceOf('bc_offset_1000_4_1')))
  })

  test('with the flag on, a module job gets the list discount too', () => {
    // 60 cm2 / 42.5 = 1.41 -> 2 modules, no bracket. 2 x 10.300, less the 1.800 list discount.
    const total = totalFor(
      {
        attributes: { quantity: 100, paper: 'illustration_300', sides: 'front', finish: 'none' },
        size: { widthCm: 12, heightCm: 5 },
      },
      { listDiscountPolicy: { applyProvisionalDiscounts: true } },
    )

    expect(total).toBe(
      withVat(2 * priceOf('bc_illustration300_100_front') - priceOf('bc_discount_illustration_plain_100')),
    )
  })

  test('an add-on is charged once however many modules the piece takes', () => {
    // Open with the owner: lamination is priced by area, so a six module piece may owe six
    // times this. Pinned here so changing it is a decision and not a drift.
    const total = totalFor({
      attributes: OFFSET_1000,
      size: { widthCm: 17, heightCm: 15 },
      addOns: ['extra_cut'],
    })

    expect(total).toBe(withVat(6 * priceOf('bc_offset_1000_4_1') * 0.85 + priceOf('bc_addon_extra_cut')))
  })
})

describe('every module discount bracket is exercised, not just the first', () => {
  const brackets: [string, { widthCm: number; heightCm: number }, number, number][] = [
    ['3 to 5 modules take 10 percent', { widthCm: 10, heightCm: 15 }, 4, 0.9],
    ['6 to 8 modules take 15 percent', { widthCm: 17, heightCm: 15 }, 6, 0.85],
    ['9 to 12 modules take 20 percent', { widthCm: 25.5, heightCm: 15 }, 9, 0.8],
    ['13 or more take 25 percent', { widthCm: 34, heightCm: 17 }, 14, 0.75],
  ]

  for (const [name, size, modules, factor] of brackets) {
    test(name, () => {
      expect(totalFor({ attributes: OFFSET_1000, size })).toBe(
        withVat(modules * priceOf('bc_offset_1000_4_1') * factor),
      )
    })
  }

  test('under three modules there is no bracket at all', () => {
    const resolution = quote({ attributes: OFFSET_1000, size: { widthCm: 15, heightCm: 5 } })

    if (resolution.kind !== 'price') throw new Error('expected a price')
    expect(resolution.breakdown.rates).toEqual([])
  })
})
