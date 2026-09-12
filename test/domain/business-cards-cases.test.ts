/**
 * Ticket B8: the ten pricing cases for the business cards family.
 *
 * The ticket asks that each case name the real conversation it came from. The shop's
 * WhatsApp history is not in this repo and was not available, so no case here claims one.
 * Every case names the source it actually has instead: the owner's own worked examples, the
 * demo script, the rules written into the price list, or the ADR that settled it.
 *
 * Nothing here carries invented provenance. If the history arrives, the cases it would
 * change are the ones about how a customer phrases a request, never the ones about what an
 * amount should be: those come from the list.
 *
 * The governing metric is zero prices outside the catalog, not a hit rate.
 */
import { describe, expect, test } from 'bun:test'
import seed from '../../seed/business-cards.json'
import { priceFor, type PriceForCatalogRow, type PriceForConfig } from '../../src/domain/price-for'

const idFor = (slug: string) => {
  let hash = 0
  for (const char of slug) hash = (hash * 31 + char.charCodeAt(0)) % 2_147_483_647
  return hash
}

const rows: PriceForCatalogRow[] = (seed as any).items.map((item: any) => ({
  id: idFor(item.id),
  slug: item.id,
  kind: item.kind,
  label: item.label,
  attributes: item.attributes,
  appliesTo: item.applies_to,
  appliesToFamily: item.applies_to_family,
  price: item.price,
}))

const family = (seed as any).family
const config: PriceForConfig = {
  family: {
    slug: family.slug,
    label: family.label,
    unit: family.unit,
    attributes: family.attributes,
    askOrder: family.ask_order,
    module: { widthCm: family.module.width_cm, heightCm: family.module.height_cm },
  },
  vatRate: (seed as any).vat_rate,
  quoteValidityDays: (seed as any).quote_validity_days,
  moduleDiscounts: (seed as any).module_discounts.map((d: any) => ({
    fromModules: d.from_modules,
    toModules: d.to_modules,
    rate: d.rate,
  })),
}

const quote = (attributes: Record<string, string | number>) =>
  priceFor({ family: family.slug, attributes, missing: [] }, rows, config)

const priceOf = (slug: string) => rows.find((row) => row.slug === slug)!.price
const withVat = (net: number) => Math.round(net * (1 + config.vatRate))

const offset1000 = {
  quantity: 1000,
  paper: 'illustration_350',
  sides: 'front_color_back_grayscale',
  finish: 'none',
}

describe('B8: ten business card cases', () => {
  test('1. the opening line of the demo, with everything else missing', () => {
    // Source: PLAN.md section 10, step 1 — "hola, cuánto 1000 tarjetas".
    const resolution = quote({ quantity: 1000 })

    expect(resolution.kind).toBe('escalate')
    if (resolution.kind !== 'escalate') return
    expect(resolution.reason).toBe('missing_attribute')
    expect(resolution.detail).toContain('papel')
  })

  test('2. the same request once the attributes arrive', () => {
    // Source: seed row bc_offset_1000_4_1, copied off the price list.
    const resolution = quote(offset1000)

    expect(resolution.kind).toBe('price')
    if (resolution.kind !== 'price') return
    expect(resolution.amount).toBe(withVat(priceOf('bc_offset_1000_4_1')))
  })

  test('3. a quantity the list does not carry', () => {
    // Source: seed rules — "Quantities are the ones in the tables. No intermediate quantity is quoted."
    const resolution = quote({ ...offset1000, quantity: 1500 })

    expect(resolution.kind).toBe('escalate')
    if (resolution.kind !== 'escalate') return
    expect(resolution.reason).toBe('no_match')
  })

  test('4. the first module example the owner worked out: 15 x 5 is two modules', () => {
    // Source: docs/assumptions.md section 2, the owner's own numbers.
    const resolution = quote({ ...offset1000, width_cm: 15, height_cm: 5 })

    expect(resolution.kind).toBe('price')
    if (resolution.kind !== 'price') return
    expect(resolution.explanation).toContain('2 módulos')
    expect(resolution.amount).toBe(withVat(2 * priceOf('bc_offset_1000_4_1')))
  })

  test('5. the second one: 10 x 15 is four modules, and takes ten percent', () => {
    // Source: docs/assumptions.md section 2, and PLAN.md section 10, step 2.
    const resolution = quote({ ...offset1000, width_cm: 10, height_cm: 15 })

    expect(resolution.kind).toBe('price')
    if (resolution.kind !== 'price') return
    expect(resolution.explanation).toContain('4 módulos')
    expect(resolution.explanation).toContain('10%')
    expect(resolution.amount).toBe(withVat(4 * priceOf('bc_offset_1000_4_1') * 0.9))
  })

  test('6. a hundred on special paper, laminated at the price that row carries', () => {
    // Source: seed rows bc_special_100_front and its lamination add-on. The lamination price
    // changes with the base row, which is why add-ons point at rows and not at the family.
    const resolution = quote({ quantity: 100, paper: 'special', sides: 'front', finish: 'lamination' })

    expect(resolution.kind).toBe('price')
    if (resolution.kind !== 'price') return
    expect(resolution.amount).toBe(
      withVat(priceOf('bc_special_100_front') + priceOf('bc_addon_lamination_special_100_front')),
    )
    expect(resolution.explanation).toContain('Incluye Laminado')
  })

  test('7. a finish the column shows as a dash is not offered at all', () => {
    // Source: seed rules — "A dash in the list means the finish is not offered in that column.
    // There is no row, so it escalates."
    const resolution = quote({ quantity: 100, paper: 'illustration_300', sides: 'front', finish: 'lamination' })

    expect(resolution.kind).toBe('escalate')
    if (resolution.kind !== 'escalate') return
    expect(resolution.reason).toBe('no_match')
  })

  test('8. a family nobody loaded: it says so instead of inventing one', () => {
    // Source: PLAN.md section 10, step 3, and the exact match rule in section 5. This is the
    // case the previous bot failed: it answered confidently about what it did not have.
    const resolution = priceFor({ family: 'banners', attributes: { quantity: 1 }, missing: [] }, rows, config)

    expect(resolution.kind).toBe('escalate')
    if (resolution.kind !== 'escalate') return
    expect(resolution.reason).toBe('out_of_catalog')
    expect(resolution.detail).toContain('no lo tengo cargado')
  })

  test('9. anything sold by the metre waits for the roll width', () => {
    // Source: ticket B4, "the square metre versus linear metre rule is covered", and
    // docs/assumptions.md, where the roll width is still an open question for the owner.
    const byTheMetre: PriceForConfig = {
      ...config,
      family: { ...config.family, slug: 'banners', unit: 'linear_meter' },
    }
    const resolution = priceFor(
      { family: 'banners', attributes: { width_cm: 300, height_cm: 100 }, missing: [] },
      rows,
      byTheMetre,
    )

    expect(resolution.kind).toBe('escalate')
  })

  test('10. every row in the catalog quotes gross, and nothing quotes from outside it', () => {
    // Source: ADR 0003 in the client repo, and the governing metric of this ticket.
    const amounts = new Set<number>()

    for (const row of rows.filter((candidate) => candidate.kind === 'sale')) {
      const resolution = quote(row.attributes as Record<string, string | number>)
      if (resolution.kind !== 'price') throw new Error(`${row.slug} did not quote`)
      expect(resolution.amount).toBe(withVat(row.price))
      amounts.add(resolution.amount)
    }

    // Fourteen sale rows, fourteen distinct amounts, every one of them a list price plus VAT.
    expect(amounts.size).toBe(14)
  })
})
