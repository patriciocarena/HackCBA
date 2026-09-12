import { describe, expect, test } from 'bun:test'
import {
  conversationId,
  quoteIntentSchema,
  type FamilyContract,
  type Intent,
  type IntentKind,
  type Resolution,
} from '../../src/domain/types'

const businessCards: FamilyContract = {
  slug: 'business_cards',
  label: 'Tarjetas personales',
  unit: 'unit',
  vatRate: 0.21,
  vatIncluded: true,
  module: { widthCm: 8.5, heightCm: 5 },
  attributes: [
    { name: 'quantity', kind: 'number', values: [100, 200, 500, 1000] },
    { name: 'paper', kind: 'enum', values: ['special', 'illustration_300', 'illustration_350'] },
    { name: 'sides', kind: 'enum', values: ['front', 'front_and_back'] },
    { name: 'finish', kind: 'enum', values: ['none', 'lamination'] },
  ],
  askOrder: ['quantity', 'paper', 'sides', 'finish'],
  addOns: ['bc_addon_lamination_special_100_front', 'bc_addon_extra_cut'],
}

const schema = quoteIntentSchema(businessCards)

function quote(overrides: Record<string, unknown> = {}) {
  return {
    kind: 'quote',
    family: 'business_cards',
    attributes: { quantity: 100, paper: 'special', sides: 'front', finish: 'none' },
    size: null,
    addOns: [],
    ...overrides,
  }
}

describe('quoteIntentSchema', () => {
  test('accepts what the family declares', () => {
    expect(schema.parse(quote())).toEqual(quote() as never)
  })

  test('accepts an attribute the customer has not given yet', () => {
    expect(schema.parse(quote({ attributes: { quantity: 100 } }))).toBeDefined()
  })

  test('refuses an attribute the family does not declare', () => {
    expect(() => schema.parse(quote({ attributes: { quantity: 100, urgency: 'today' } }))).toThrow()
  })

  test('refuses a value outside the declared set', () => {
    expect(() => schema.parse(quote({ attributes: { paper: 'papyrus' } }))).toThrow()
  })

  test('refuses a quantity the list does not carry', () => {
    expect(() => schema.parse(quote({ attributes: { quantity: 700 } }))).toThrow()
  })

  test('refuses a family that is not this one', () => {
    expect(() => schema.parse(quote({ family: 'banners' }))).toThrow()
  })

  test('refuses an add-on that is not in the catalog', () => {
    expect(() => schema.parse(quote({ addOns: ['free_delivery'] }))).toThrow()
  })

  test('accepts a size, which no attribute declares', () => {
    expect(schema.parse(quote({ size: { widthCm: 10, heightCm: 15 } }))).toBeDefined()
  })

  test('refuses a size with no height', () => {
    expect(() => schema.parse(quote({ size: { widthCm: 10 } }))).toThrow()
  })
})

describe('conversationId', () => {
  test('separates the two roles of one chat, so admin state cannot be read as a customer', () => {
    expect(conversationId('telegram', '42', 'admin')).not.toBe(
      conversationId('telegram', '42', 'customer'),
    )
  })
})

describe('the contract the four lanes switch on', () => {
  test('IntentKind and the Intent union name the same set, in both directions', () => {
    // Compile time. INTENT_KINDS feeds the Zod enum and the extraction schema on its own, but
    // the Intent union is a second list kept by hand. This is what makes the second edit
    // compulsory instead of optional.
    const agree: IntentKind extends Intent['kind']
      ? Intent['kind'] extends IntentKind
        ? true
        : never
      : never = true

    expect(agree).toBe(true)
  })

  function nameIntent(intent: Intent): IntentKind {
    switch (intent.kind) {
      case 'quote':
        return intent.kind
      case 'fact':
        return intent.kind
      case 'admin_edit':
        return intent.kind
      case 'accept':
        return intent.kind
      case 'other':
        return intent.kind
      default: {
        const unreachable: never = intent
        return unreachable
      }
    }
  }

  function nameResolution(resolution: Resolution): string {
    switch (resolution.kind) {
      case 'price':
        return resolution.kind
      case 'ask':
        return resolution.kind
      case 'fact':
        return resolution.kind
      case 'accepted':
        return resolution.kind
      case 'escalate':
        return resolution.kind
      case 'instruct':
        return resolution.kind
      default: {
        const unreachable: never = resolution
        return unreachable
      }
    }
  }

  test('every intent kind is handled, and adding one breaks the compile', () => {
    expect(nameIntent({ kind: 'other' })).toBe('other')
  })

  test('every resolution kind is handled, and adding one breaks the compile', () => {
    expect(nameResolution({ kind: 'ask', missing: ['paper'] })).toBe('ask')
  })
})
