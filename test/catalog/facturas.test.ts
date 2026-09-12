import { describe, expect, test } from 'bun:test'
import seed from '../../seed/facturas.json'
import { loadCatalog } from '../../src/catalog/load'
import { auditAgainstList, type SeedItem } from '../../src/catalog/price-audit'
import { parsePriceList } from '../../src/catalog/price-list'
import { totalOf } from '../../src/domain/breakdown'
import { ars } from '../../src/domain/money'
import { priceFor, saleRowsOf } from '../../src/domain/price-for'
import type { QuoteIntent, Resolution } from '../../src/domain/types'

const { rows, config } = loadCatalog(seed)

const HALF_LEGAL_1_COLOR = { quantity: 1, format: 'half_legal', ink: 'color' } as const

function quote(attributes: Record<string, string | number>, addOns: string[] = []): Resolution {
  const intent: QuoteIntent = { kind: 'quote', family: config.family.slug, attributes, size: null, addOns }

  return priceFor(intent, rows, config)
}

function total(attributes: Record<string, string | number>, addOns: string[] = []): number {
  const resolution = quote(attributes, addOns)
  if (resolution.kind !== 'price') throw new Error(`expected a price, got ${resolution.kind}`)

  return totalOf(resolution.breakdown)
}

/**
 * The third family, picked because it stresses the two things the rest of the list needs and
 * the cards family did not: a headed column that becomes an attribute, and modifiers stated as
 * percentages rather than amounts.
 */
describe('the facturas family, loaded from the list', () => {
  test('the seed agrees with the list it was typed from, rates and amounts alike', async () => {
    const list = parsePriceList(await Bun.file('seed/lista-precios.html').text())
    const family = list.families.find((one) => one.label === 'Facturas')!

    const audit = auditAgainstList(
      seed.items.map((item) =>
        'rate' in item ? ({ id: item.id, rate: item.rate } as SeedItem) : ({ id: item.id, price: item.price } as SeedItem),
      ),
      family,
    )

    expect(audit.wrong).toEqual([])
    expect(audit.unclaimed).toEqual([])
  })

  test('one list row becomes two items, because B/N and Color are a column each', () => {
    expect(saleRowsOf(rows, 'facturas')).toHaveLength(28)
  })

  test('a named format is an attribute, not a measurement the engine divides by', () => {
    expect(config.family.module).toBeNull()
    expect(config.family.attributes.map((attribute) => attribute.name)).toEqual(['quantity', 'format', 'ink'])
  })

  test('the unit is a set, because the list counts talonarios and not sheets', () => {
    expect(config.family.unit).toBe('set')
  })

  test('the four corners of the table quote the list amount grossed up once', () => {
    expect(total({ quantity: 1, format: 'half_legal', ink: 'bw' })).toBe(ars(19_360))
    expect(total({ quantity: 20, format: 'half_legal', ink: 'color' })).toBe(ars(229_900))
    expect(total({ quantity: 1, format: 'a4', ink: 'bw' })).toBe(ars(29_040))
    expect(total({ quantity: 20, format: 'a4', ink: 'color' })).toBe(ars(393_855))
  })

  test('a surcharge is a percentage of the chosen row', () => {
    // 26.000 x 1.40 = 36.400 net, grossed once.
    expect(total(HALF_LEGAL_1_COLOR, ['facturas:triplicate'])).toBe(ars(44_044))
  })

  /**
   * The list's own reading instructions, at L72: "Cuando se aplica más de uno, se aplican uno
   * sobre otro, no se suman". Summed would be 26.000 x 2.0 = 52.000 net.
   */
  test('two surcharges compound and are never summed', () => {
    const both = total(HALF_LEGAL_1_COLOR, ['facturas:triplicate', 'facturas:carbonless'])

    expect(both).toBe(ars(70_470))
    expect(both).not.toBe(ars(62_920))
  })

  test('papel químico charges more on A4 than on 1/2 oficio, as the list states', () => {
    const half = quote(HALF_LEGAL_1_COLOR, ['facturas:carbonless'])
    const a4 = quote({ quantity: 1, format: 'a4', ink: 'color' }, ['facturas:carbonless'])

    if (half.kind !== 'price' || a4.kind !== 'price') throw new Error('expected prices')
    expect(half.breakdown.rates.map((rate) => rate.rate)).toEqual([0.6])
    expect(a4.breakdown.rates.map((rate) => rate.rate)).toEqual([0.7])
  })

  // ADR 0023: the breakdown is the audit trail, and a family whose every modifier is a rate has
  // none if the trail records only the pesos.
  test('the breakdown names the percentage and the row it came from', () => {
    const resolution = quote(HALF_LEGAL_1_COLOR, ['facturas:triplicate'])

    if (resolution.kind !== 'price') throw new Error(resolution.kind)
    expect(resolution.breakdown.rates).toEqual([
      { kind: 'surcharge', rate: 0.4, slug: 'fa_addon_triplicate', label: 'Por triplicado' },
    ])
    expect(resolution.breakdown.addOns).toEqual([])
  })

  test('the groups it offers are namespaced, so no other family can answer for them', () => {
    expect(config.family.addOns).toEqual([
      'facturas:triplicate',
      'facturas:quadruplicate',
      'facturas:carbonless',
    ])
  })

  test('a quantity the list does not carry escalates instead of being interpolated', () => {
    const resolution = quote({ quantity: 3, format: 'a4', ink: 'color' })

    expect(resolution.kind).toBe('escalate')
    if (resolution.kind !== 'escalate') return
    expect(resolution.reason).toBe('unsupported_quantity')
  })

  test('it asks for the format and the ink together, in the family order', () => {
    expect(quote({ quantity: 2 })).toEqual({ kind: 'ask', missing: ['format', 'ink'] })
  })
})
