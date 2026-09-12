import { describe, expect, test } from 'bun:test'
import { addArs, ars, scaleArs, subtractArs, type Ars } from '../../src/domain/money'

describe('ars', () => {
  test('accepts whole pesos', () => {
    expect(ars(12100)).toBe(12100 as Ars)
  })

  test('accepts zero', () => {
    expect(ars(0)).toBe(0 as Ars)
  })

  test('refuses centavos, because the list has none', () => {
    expect(() => ars(12100.5)).toThrow('12100.5 is not a whole number of pesos')
  })

  test('refuses a negative amount', () => {
    expect(() => ars(-1)).toThrow('-1 is not a whole number of pesos')
  })

  test('refuses NaN', () => {
    expect(() => ars(Number.NaN)).toThrow('NaN is not a whole number of pesos')
  })

  test('refuses Infinity', () => {
    expect(() => ars(Number.POSITIVE_INFINITY)).toThrow('Infinity is not a whole number of pesos')
  })
})

describe('addArs', () => {
  test('sums to pesos', () => {
    expect(addArs(ars(12100), ars(5100))).toBe(ars(17200))
  })

  test('sums nothing to zero', () => {
    expect(addArs()).toBe(ars(0))
  })
})

describe('subtractArs', () => {
  test('subtracts to pesos', () => {
    expect(subtractArs(ars(10300), ars(1800))).toBe(ars(8500))
  })

  test('refuses to go below zero', () => {
    expect(() => subtractArs(ars(100), ars(101))).toThrow('-1 is not a whole number of pesos')
  })
})

describe('scaleArs', () => {
  test('raises by a rate', () => {
    expect(scaleArs(ars(12100), 1.2)).toBe(ars(14520))
  })

  test('rounds to the peso', () => {
    expect(scaleArs(ars(12101), 1.2)).toBe(ars(14521))
  })

  test('refuses a negative factor', () => {
    expect(() => scaleArs(ars(100), -1)).toThrow('-100 is not a whole number of pesos')
  })
})
