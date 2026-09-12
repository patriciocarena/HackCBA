import { describe, expect, it } from 'bun:test'
import seed from '../../seed/business-cards.json'
import { loadCatalog } from '../../src/catalog/load'
import { ars } from '../../src/domain/money'

describe('loadCatalog', () => {
  it('reads the family contract off the seed', () => {
    const { config } = loadCatalog(seed)

    expect(config.family.slug).toBe('business_cards')
    expect(config.family.label).toBe('Tarjetas personales')
    expect(config.family.unit).toBe('unit')
    expect(config.family.vatRate).toBe(0.21)
    expect(config.family.vatIncluded).toBe(false)
    expect(config.family.module).toEqual({ widthCm: 8.5, heightCm: 5 })
  })

  it('maps every seed item into a catalog row', () => {
    const { rows } = loadCatalog(seed)

    expect(rows).toHaveLength(seed.items.length)
    expect(rows.filter((row) => row.kind === 'sale')).toHaveLength(14)
    expect(rows.filter((row) => row.kind === 'add_on')).toHaveLength(11)
    expect(rows.filter((row) => row.kind === 'discount')).toHaveLength(2)
  })

  it('carries the fields the engine reads off a row', () => {
    const { rows } = loadCatalog(seed)

    expect(rows.find((row) => row.slug === 'bc_special_100_front')).toStrictEqual({
      slug: 'bc_special_100_front',
      familySlug: 'business_cards',
      kind: 'sale',
      label: '100 tarjetas color sólo frente',
      group: undefined,
      unconfirmed: undefined,
      attributes: { quantity: 100, paper: 'special', sides: 'front', finish: 'none' },
      appliesTo: undefined,
      appliesToFamily: undefined,
      price: ars(12100),
    })
  })

  it('carries group, appliesTo and unconfirmed where the seed sets them', () => {
    const { rows } = loadCatalog(seed)
    const lamination = rows.find((row) => row.slug === 'bc_addon_lamination_special_100_front')
    const discount = rows.find((row) => row.slug === 'bc_discount_illustration_plain_100')

    expect(lamination?.group).toBe('lamination')
    expect(lamination?.appliesTo).toEqual(['bc_special_100_front'])
    expect(rows.find((row) => row.slug === 'bc_addon_design')?.appliesToFamily).toBe(true)
    expect(discount?.unconfirmed).toBe(true)
  })

  it('reads the module discount tiers and the quote validity off the seed', () => {
    const { config } = loadCatalog(seed)

    expect(config.quoteValidityDays).toBe(15)
    expect(config.moduleDiscounts).toEqual([
      { fromModules: 3, toModules: 5, rate: 0.1 },
      { fromModules: 6, toModules: 8, rate: 0.15 },
      { fromModules: 9, toModules: 12, rate: 0.2 },
      { fromModules: 13, toModules: null, rate: 0.25 },
    ])
  })

  it('derives each attribute contract from the values the sale rows carry', () => {
    const { config } = loadCatalog(seed)

    expect(config.family.askOrder).toEqual(['quantity', 'paper', 'sides', 'finish'])
    expect(config.family.attributes).toEqual([
      { name: 'quantity', kind: 'number', values: [100, 200, 1000, 500] },
      { name: 'paper', kind: 'enum', values: ['special', 'illustration_300', 'illustration_350'] },
      {
        name: 'sides',
        kind: 'enum',
        values: ['front', 'front_and_back', 'front_color_back_grayscale'],
      },
      {
        name: 'finish',
        kind: 'enum',
        values: [
          'none',
          'uv_front',
          'opp_both_sides',
          'opp_both_sides_uv_one_side',
          'opp_both_sides_uv_both_sides',
        ],
      },
    ])
  })

  it('leaves out a paper the list names but no sale row carries', () => {
    const { config } = loadCatalog(seed)
    const paper = config.family.attributes.find((attribute) => attribute.name === 'paper')

    expect(seed.papers.map((entry) => entry.slug)).toContain('illustration_300_plain')
    expect(paper?.values).not.toContain('illustration_300_plain')
  })

  it('refuses a declared attribute that no sale row carries', () => {
    const withGhost = {
      ...seed,
      family: { ...seed.family, attributes: [...seed.family.attributes, 'varnish'] },
    }

    expect(() => loadCatalog(withGhost)).toThrow('varnish is declared but no sale row carries it')
  })

  it('offers each add-on group once, whatever number of rows prices it', () => {
    const { config } = loadCatalog(seed)

    expect(config.family.addOns).toEqual([
      'lamination',
      'design',
      'extra_cut',
      'label_perforation',
      'rounded_corners',
      'circular_cut',
    ])
  })

  it('refuses a row whose kind the engine does not price', () => {
    const withTypo = {
      ...seed,
      items: [...seed.items, { id: 'bc_typo', kind: 'sales', label: 'typo', price: 100 }],
    }

    expect(() => loadCatalog(withTypo)).toThrow('bc_typo has kind sales')
  })

  it('refuses a unit the domain does not declare', () => {
    const withBadUnit = { ...seed, family: { ...seed.family, unit: 'kilogram' } }

    expect(() => loadCatalog(withBadUnit)).toThrow()
  })

  it('offers an add-on that carries no group under its own slug', () => {
    const withGrouplessAddOn = {
      ...seed,
      items: [
        ...seed.items,
        {
          id: 'bc_addon_gift_box',
          kind: 'add_on',
          label: 'Caja',
          applies_to_family: true,
          price: 900,
        },
      ],
    }

    const { config } = loadCatalog(withGrouplessAddOn)

    expect(config.family.addOns).toContain('bc_addon_gift_box')
  })
})
