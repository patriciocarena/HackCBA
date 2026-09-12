import { describe, expect, test } from 'bun:test'
import { baseConfig, catalogRows } from '../../src/catalog/business-cards'
import { priceFor, type CatalogRow } from '../../src/domain/price-for'
import type { QuoteIntent, Resolution } from '../../src/domain/types'
import { intent, OFFSET_1000, rowFor, SPECIAL_100 } from '../support/fixtures'

const quote = (overrides: Partial<QuoteIntent>, rows: CatalogRow[] = catalogRows): Resolution =>
  priceFor(intent({ attributes: OFFSET_1000, ...overrides }), rows, baseConfig)

const cloneOf = (slug: string, overrides: Partial<CatalogRow> = {}): CatalogRow => ({
  ...rowFor(slug),
  slug: `${slug}_dup`,
  ...overrides,
})

function expectAmbiguous(resolution: Resolution) {
  expect(resolution.kind).toBe('escalate')
  if (resolution.kind !== 'escalate') return
  expect(resolution.reason).toBe('ambiguous')
}

describe('the engine never picks between two rows', () => {
  test('two sale rows matching the same request escalate as ambiguous', () => {
    expectAmbiguous(quote({}, [...catalogRows, cloneOf('bc_offset_1000_4_1', { price: 99_999 as never })]))
  })

  test('the module path refuses an ambiguous base row too', () => {
    expectAmbiguous(
      quote({ size: { widthCm: 10, heightCm: 15 } }, [
        ...catalogRows,
        cloneOf('bc_offset_1000_4_1', { price: 99_999 as never }),
      ]),
    )
  })

  test('two add-ons in the same group matching the same job escalate as ambiguous', () => {
    expectAmbiguous(
      quote({ attributes: SPECIAL_100, addOns: ['lamination'] }, [
        ...catalogRows,
        cloneOf('bc_addon_lamination_special_100_front', { price: 99_999 as never }),
      ]),
    )
  })

  test('an ambiguous answer never carries a breakdown', () => {
    const resolution = quote({}, [...catalogRows, cloneOf('bc_offset_1000_4_1', { price: 1 as never })])

    expect(JSON.stringify(resolution)).not.toContain('breakdown')
  })

  test('a duplicate row that does not match the request changes nothing', () => {
    const resolution = quote({}, [
      ...catalogRows,
      cloneOf('bc_offset_1000_4_1', { attributes: { ...OFFSET_1000, quantity: 200 } }),
    ])

    expect(resolution.kind).toBe('price')
  })
})
