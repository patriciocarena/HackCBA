import { describe, expect, test } from 'bun:test'
import { baseConfig, catalogRows } from '../../src/catalog/business-cards'
import { priceFor } from '../../src/domain/price-for'
import { askText, quoteText } from '../../src/domain/quote-text'
import type { QuoteIntent, Resolution } from '../../src/domain/types'
import { intent, OFFSET_1000, SPECIAL_100 } from '../support/fixtures'

const resolve = (overrides: Partial<QuoteIntent>): Resolution =>
  priceFor(intent(overrides), catalogRows, baseConfig)

function customerText(overrides: Partial<QuoteIntent>): string {
  const resolution = resolve(overrides)

  if (resolution.kind === 'price') return quoteText(resolution.breakdown, resolution.validityDays)
  if (resolution.kind === 'ask') return askText(resolution.missing)
  if (resolution.kind === 'escalate') return resolution.detail
  return resolution.value
}

describe('what the customer reads', () => {
  test('never exposes an English attribute name', () => {
    const text = customerText({ attributes: { quantity: 1000 } })

    for (const identifier of ['paper', 'sides', 'finish', 'quantity']) {
      expect(text).not.toContain(identifier)
    }
  })

  test('asks for the two sided attribute using the printing word, caras', () => {
    const text = customerText({ attributes: { quantity: 1000 } })

    expect(text).toContain('caras')
    expect(text).not.toContain('lados')
  })

  test('writes Spanish with its accents', () => {
    const text = customerText({ attributes: SPECIAL_100 })

    expect(text).toContain('cotización')
    expect(text).toContain('válida')
    expect(text).toContain('días')
    expect(text).not.toContain('cotizacion')
    expect(text).not.toContain('valida')
    expect(text).not.toContain('dias')
  })

  test('names an add-on the customer asked for, without the arithmetic', () => {
    const text = customerText({ attributes: SPECIAL_100, addOns: ['lamination'] })

    expect(text).toContain('Incluye Laminado')
    expect(text).not.toContain('$5.100')
  })

  test('names the missing attributes in Spanish, in the order the family declares', () => {
    const text = customerText({ attributes: { quantity: 1000 } })

    expect(text.indexOf('papel')).toBeLessThan(text.indexOf('caras'))
    expect(text.indexOf('caras')).toBeLessThan(text.indexOf('terminación'))
  })

  test('says the name of an add-on, not the row that tells the owner which one it is', () => {
    const text = customerText({ attributes: SPECIAL_100, addOns: ['rounded_corners'] })

    // The list calls the row "Puntas redondeadas, 100" so the owner can find it. The 100 is
    // the quantity the customer already named, and reading it back is shop bookkeeping.
    expect(text).toContain('Incluye Puntas redondeadas.')
    expect(text).not.toContain('Puntas redondeadas, 100')
  })

  test('lists two add-ons as a person would', () => {
    const text = customerText({ attributes: SPECIAL_100, addOns: ['lamination', 'design'] })

    expect(text).toContain('Incluye Laminado y Diseño.')
  })
})

describe('a plain quote reads like a person too', () => {
  const plain = () => customerText({ attributes: OFFSET_1000 })

  test('never shows the internal catalog label', () => {
    expect(plain()).not.toContain('Tarjetas full color')
    expect(plain()).not.toContain('escala de grises')
  })

  test('states the amount and the validity, and stays short', () => {
    expect(plain()).toContain('$45.000')
    expect(plain()).toContain('15 días')
    expect(plain()).not.toContain('redondeo al peso')
    expect(plain().length).toBeLessThan(140)
  })

  test('says nothing about modules when the customer named no size', () => {
    expect(plain()).not.toContain('módulo')
  })
})
