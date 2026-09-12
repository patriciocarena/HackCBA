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
})
