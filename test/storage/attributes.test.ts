import { describe, expect, it } from 'bun:test'
import { canonicalAttributes } from '@/catalog/attributes'

describe('canonicalAttributes', () => {
  it('sorts the keys, so one bag has one serialisation', () => {
    expect(canonicalAttributes({ sides: 'front', paper: 'special', quantity: 100 })).toBe(
      '{"paper":"special","quantity":100,"sides":"front"}',
    )
  })

  it('writes the same string whatever order the keys arrive in', () => {
    const one = canonicalAttributes({ quantity: 100, paper: 'special' })
    const other = canonicalAttributes({ paper: 'special', quantity: 100 })

    expect(one).toBe(other)
  })

  it('serialises an empty bag as an object', () => {
    expect(canonicalAttributes({})).toBe('{}')
  })
})
