import { describe, expect, test } from 'bun:test'
import { totalOf } from '../../src/domain/breakdown'
import { ars } from '../../src/domain/money'
import { priceFor, type CatalogRow, type PriceForConfig } from '../../src/domain/price-for'
import type { FamilyContract, QuoteIntent } from '../../src/domain/types'

/**
 * Facturas is the first family whose modifiers are percentages rather than amounts:
 * "Por triplicado, sumar 40%". The amount is a function of the job, not of the cell, which is
 * why the list states papel químico at 60% for 1/2 oficio and 70% for A4 and never as pesos.
 *
 * Modelled as an add-on carrying a rate rather than as an attribute. As an attribute, facturas
 * would be 7 quantities x 2 formats x 2 inks x 3 copy counts = 84 combinations of which Javier
 * stated 28, and the other 56 would have to be derived from a percentage. That is interpolation,
 * and rule 2 forbids it. As a rate add-on, every number in the seed is one he typed.
 *
 * The list's own markup agrees: he tags `Por triplicado` with `adicional`, the same tag he puts
 * on `Laminado`.
 */
const FACTURAS: FamilyContract = {
  slug: 'facturas',
  label: 'Facturas',
  unit: 'set',
  vatRate: 0.21,
  vatIncluded: false,
  module: null,
  attributes: [
    { name: 'quantity', kind: 'number', values: [1] },
    { name: 'format', kind: 'enum', values: ['half_legal', 'a4'] },
    { name: 'ink', kind: 'enum', values: ['color'] },
  ],
  askOrder: ['quantity', 'format', 'ink'],
  addOns: ['facturas:triplicate', 'facturas:carbonless'],
}

const CONFIG: PriceForConfig = { family: FACTURAS, quoteValidityDays: 15 }

const BAG = { quantity: 1, format: 'half_legal', ink: 'color' } as const

const ROWS: CatalogRow[] = [
  {
    slug: 'fa_half_legal_1_color',
    familySlug: 'facturas',
    kind: 'sale',
    label: '1 talonario 1/2 oficio color',
    attributes: BAG,
    price: ars(26_000),
  },
  {
    slug: 'fa_addon_triplicate_half_legal',
    familySlug: 'facturas',
    kind: 'add_on',
    group: 'facturas:triplicate',
    label: 'Por triplicado',
    attributes: { format: 'half_legal' },
    appliesToFamily: true,
    rate: 0.4,
  },
  {
    slug: 'fa_addon_carbonless_half_legal',
    familySlug: 'facturas',
    kind: 'add_on',
    group: 'facturas:carbonless',
    label: 'Con papel químico',
    attributes: { format: 'half_legal' },
    appliesToFamily: true,
    rate: 0.6,
  },
]

function quote(addOns: string[]) {
  const intent: QuoteIntent = { kind: 'quote', family: 'facturas', attributes: BAG, size: null, addOns }

  return priceFor(intent, ROWS, CONFIG)
}

describe('an add-on may carry a rate instead of an amount', () => {
  test('the rate multiplies the base and the total is grossed up once', () => {
    const resolution = quote(['facturas:triplicate'])

    expect(resolution.kind).toBe('price')
    if (resolution.kind !== 'price') return
    // 26.000 x 1.40 = 36.400 net, then VAT once.
    expect(totalOf(resolution.breakdown)).toBe(ars(44_044))
  })

  /**
   * The audit trail has to show the percentage, not only the pesos it came to. A family whose
   * every modifier is a rate has no audit trail if the breakdown records only the answer, and
   * `CONTEXT.md` calls the breakdown the thing a human reads to catch the error.
   */
  test('the breakdown records the rate and names the row it came from', () => {
    const resolution = quote(['facturas:triplicate'])

    if (resolution.kind !== 'price') throw new Error(resolution.kind)
    expect(resolution.breakdown.rates).toEqual([
      { kind: 'surcharge', rate: 0.4, slug: 'fa_addon_triplicate_half_legal', label: 'Por triplicado' },
    ])
    // It is not an amount line. A rate is not an amount, per ADR 0022.
    expect(resolution.breakdown.addOns).toEqual([])
  })

  test('two rates compound, because the list says percentages never sum', () => {
    const resolution = quote(['facturas:triplicate', 'facturas:carbonless'])

    if (resolution.kind !== 'price') throw new Error(resolution.kind)
    // 26.000 x 1.40 x 1.60 = 58.240 net, grossed once. Summed would be 26.000 x 2.0.
    expect(totalOf(resolution.breakdown)).toBe(ars(70_470))
    expect(totalOf(resolution.breakdown)).not.toBe(ars(62_920))
  })

  test('a rate keyed to another format is not this job, and escalates', () => {
    const other: CatalogRow[] = [
      ROWS[0]!,
      { ...ROWS[1]!, slug: 'fa_addon_triplicate_a4', attributes: { format: 'a4' }, rate: 0.4 },
    ]
    const intent: QuoteIntent = {
      kind: 'quote',
      family: 'facturas',
      attributes: BAG,
      size: null,
      addOns: ['facturas:triplicate'],
    }

    const resolution = priceFor(intent, other, CONFIG)

    expect(resolution.kind).toBe('escalate')
    if (resolution.kind !== 'escalate') return
    expect(resolution.reason).toBe('no_match')
  })
})
