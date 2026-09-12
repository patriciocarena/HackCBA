import { describe, expect, test } from 'bun:test'
import seed from '../../seed/folletos-laser.json'
import { loadCatalog } from '../../src/catalog/load'
import { auditAgainstList } from '../../src/catalog/price-audit'
import { parsePriceList } from '../../src/catalog/price-list'
import { totalOf } from '../../src/domain/breakdown'
import { ars } from '../../src/domain/money'
import { priceFor, saleRowsOf } from '../../src/domain/price-for'
import type { QuoteIntent, Resolution } from '../../src/domain/types'

const { rows, config } = loadCatalog(seed)

function quote(attributes: Record<string, string | number>, addOns: string[] = []): Resolution {
  const intent: QuoteIntent = { kind: 'quote', family: config.family.slug, attributes, size: null, addOns }

  return priceFor(intent, rows, config)
}

function total(attributes: Record<string, string | number>): number {
  const resolution = quote(attributes)
  if (resolution.kind !== 'price') throw new Error(`expected a price, got ${resolution.kind}`)

  return totalOf(resolution.breakdown)
}

/**
 * The second family loaded, and the cleanest table in the file: a complete 2 x 2 x 2 with no
 * add-ons, no discounts, no percentages and no dashes. It is here to prove the registry and the
 * loader on a family that needs nothing new, which is why it was picked.
 *
 * It is also the family that exposed the parser bug. It reported fifteen sale rows before ADR
 * 0022: eight of its own and seven belonging to Volantes papel obra.
 */
describe('the folletos láser family, loaded from the list', () => {
  test('the seed agrees with the list it was typed from', async () => {
    const list = parsePriceList(await Bun.file('seed/lista-precios.html').text())
    const family = list.families.find((one) => one.label === 'Folletos full color, láser')!

    const audit = auditAgainstList(
      seed.items.map((item) => ({ id: item.id, price: item.price })),
      family,
    )

    expect(audit.wrong).toEqual([])
    expect(audit.unclaimed).toEqual([])
  })

  test('the list is net for this family too, because the header governs the whole file', async () => {
    const list = parsePriceList(await Bun.file('seed/lista-precios.html').text())

    expect(seed.vat_included).toBe(list.vatIncluded)
    expect(config.family.vatIncluded).toBe(false)
  })

  test('it declares no module, so a family without one loads', () => {
    expect(config.family.module).toBeNull()
  })

  test('all eight rows load, and they are all this family', () => {
    expect(saleRowsOf(rows, 'folletos_laser')).toHaveLength(8)
    expect(rows.every((row) => row.familySlug === 'folletos_laser')).toBe(true)
  })

  test('the four corners of the table quote the list amount grossed up once', () => {
    expect(total({ quantity: 500, coverage: 'semi_pleno', sides: 'front' })).toBe(ars(84_095))
    expect(total({ quantity: 1000, coverage: 'semi_pleno', sides: 'front' })).toBe(ars(155_485))
    expect(total({ quantity: 500, coverage: 'pleno', sides: 'front_and_back' })).toBe(ars(159_720))
    expect(total({ quantity: 1000, coverage: 'pleno', sides: 'front_and_back' })).toBe(ars(298_265))
  })

  test('it asks for what is missing in the family order, all at once', () => {
    const resolution = quote({ quantity: 500 })

    expect(resolution).toEqual({ kind: 'ask', missing: ['coverage', 'sides'] })
  })

  // The list carries 500 and 1000 and says explicitly that nothing between them is quoted.
  test('a quantity the list does not carry escalates instead of being interpolated', () => {
    const resolution = quote({ quantity: 750, coverage: 'pleno', sides: 'front' })

    expect(resolution.kind).toBe('escalate')
    if (resolution.kind !== 'escalate') return
    expect(resolution.reason).toBe('unsupported_quantity')
  })

  test('it offers no add-on, so asking for one escalates rather than finding another family', () => {
    expect(config.family.addOns).toEqual([])

    const resolution = quote({ quantity: 500, coverage: 'pleno', sides: 'front' }, ['design'])

    expect(resolution.kind).toBe('escalate')
  })

  // No module, so the area path has nothing to divide by and must refuse rather than guess.
  test('a size the customer gives escalates, because this family has no module', () => {
    const intent: QuoteIntent = {
      kind: 'quote',
      family: 'folletos_laser',
      attributes: { quantity: 500, coverage: 'pleno', sides: 'front' },
      size: { widthCm: 20, heightCm: 30 },
      addOns: [],
    }

    const resolution = priceFor(intent, rows, config)

    expect(resolution.kind).toBe('escalate')
    if (resolution.kind !== 'escalate') return
    expect(resolution.reason).toBe('no_match')
  })
})
