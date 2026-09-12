import { describe, expect, it } from 'bun:test'
import seed from '../../seed/business-cards.json'
import { loadCatalog } from '../../src/catalog/load'

describe('loadCatalog', () => {
  it('reads the family contract off the seed', () => {
    const { config } = loadCatalog(seed)

    expect(config.family.slug).toBe('business_cards')
    expect(config.family.label).toBe('Tarjetas personales')
    expect(config.family.unit).toBe('unit')
    expect(config.family.vatRate).toBe(0.21)
    expect(config.family.vatIncluded).toBe(true)
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

    expect(rows.find((row) => row.slug === 'bc_special_100_front')).toEqual({
      slug: 'bc_special_100_front',
      kind: 'sale',
      label: '100 tarjetas color sólo frente',
      group: undefined,
      provisional: undefined,
      attributes: { quantity: 100, paper: 'special', sides: 'front', finish: 'none' },
      appliesTo: undefined,
      appliesToFamily: undefined,
      price: 12100,
    })
  })

  it('carries group, appliesTo and provisional where the seed sets them', () => {
    const { rows } = loadCatalog(seed)
    const lamination = rows.find((row) => row.slug === 'bc_addon_lamination_special_100_front')
    const discount = rows.find((row) => row.slug === 'bc_discount_illustration_plain_100')

    expect(lamination?.group).toBe('lamination')
    expect(lamination?.appliesTo).toEqual(['bc_special_100_front'])
    expect(rows.find((row) => row.slug === 'bc_addon_design')?.appliesToFamily).toBe(true)
    expect(discount?.provisional).toBe(true)
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
})
