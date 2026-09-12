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
const vatRate: number = (seed as any).vat_rate
const config: PriceForConfig = {
  family: {
    slug: family.slug,
    label: family.label,
    unit: family.unit,
    attributes: family.attributes,
    askOrder: family.ask_order,
    module: { widthCm: family.module.width_cm, heightCm: family.module.height_cm },
  },
  vatRate,
  quoteValidityDays: 15,
  moduleDiscounts: (seed as any).module_discounts.map((d: any) => ({
    fromModules: d.from_modules,
    toModules: d.to_modules,
    rate: d.rate,
  })),
}

const quote = (attributes: Record<string, string | number>, overrides: Partial<PriceForConfig> = {}) =>
  priceFor({ family: 'business_cards', attributes, missing: [] }, rows, { ...config, ...overrides })

const gross = (net: number) => Math.round(net * (1 + vatRate))
const saleRows = rows.filter((row) => row.kind === 'sale')

describe('no amount leaves the engine without VAT', () => {
  test('the catalog is not empty, so the sweep below means something', () => {
    expect(saleRows.length).toBeGreaterThan(10)
  })

  test('every sale row in the catalog quotes at its net price plus VAT', () => {
    const wrong: string[] = []

    for (const row of saleRows) {
      const resolution = quote(row.attributes as Record<string, string | number>)
      if (resolution.kind !== 'price') {
        wrong.push(`${row.slug}: escalated (${resolution.reason})`)
        continue
      }
      if (resolution.amount !== gross(row.price)) {
        wrong.push(`${row.slug}: got ${resolution.amount}, expected ${gross(row.price)}`)
      }
    }

    expect(wrong).toEqual([])
  })

  test('an add-on is grossed with the base, never left net', () => {
    const base = rows.find((r) => r.slug === 'bc_special_100_front')!
    const addOn = rows.find((r) => r.slug === 'bc_addon_lamination_special_100_front')!
    const resolution = quote({ ...(base.attributes as any), finish: 'lamination' })

    expect(resolution.kind).toBe('price')
    if (resolution.kind !== 'price') return
    expect(resolution.amount).toBe(gross(base.price + addOn.price))
  })

  test('the module path grosses the discounted subtotal', () => {
    const standard = rows.find((r) => r.slug === 'bc_offset_1000_4_1')!
    const resolution = quote({ ...(standard.attributes as any), width_cm: 10, height_cm: 15 })

    expect(resolution.kind).toBe('price')
    if (resolution.kind !== 'price') return
    expect(resolution.amount).toBe(gross(4 * standard.price * 0.9))
  })

  test('the list discount path grosses what is left after the discount', () => {
    const base = rows.find((r) => r.slug === 'bc_illustration300_100_front')!
    const resolution = quote(base.attributes as any, {
      listDiscountPolicy: { applyProvisionalIllustrationPlainDiscounts: true },
    })

    expect(resolution.kind).toBe('price')
    if (resolution.kind !== 'price') return
    expect(resolution.amount).toBe(gross(base.price - 1800))
  })

  test('no quote ever equals its own net price, which is what plus VAT would look like', () => {
    for (const row of saleRows) {
      const resolution = quote(row.attributes as Record<string, string | number>)
      if (resolution.kind !== 'price') continue
      expect(resolution.amount).not.toBe(row.price)
    }
  })
})
