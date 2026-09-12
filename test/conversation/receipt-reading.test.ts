import { describe, expect, test } from 'bun:test'
import { RECEIPT_SCHEMA, receiptReader, type Look } from '@/conversation/receipt-reading'

const image = new Uint8Array([1, 2, 3]) as Uint8Array<ArrayBuffer>

const ANSWER = { looksLikeReceipt: true, amount: 45000, destination: 'dante.imprenta.mp', confidence: 0.95 }

function looking(answer: unknown): { look: Look; calls: { system: string; parts: unknown[]; schema: object }[] } {
  const calls: { system: string; parts: unknown[]; schema: object }[] = []

  return {
    calls,
    look: async (request) => {
      calls.push(request)

      return answer
    },
  }
}

describe('the schema OpenRouter will actually honour', () => {
  test('every nullable property is an anyOf, never a type array', () => {
    // A property written type: ['string','null'] makes OpenRouter drop structured output and
    // return prose with a 200, which parses as nothing and fails closed silently. The whole
    // feature is off and the only symptom is an operator reading extraction failures.
    const json = JSON.stringify(RECEIPT_SCHEMA)

    expect(json).not.toContain('"type":["')
    expect(json).toContain('"anyOf"')
  })

  test('it asks for exactly what a person would check and nothing else', () => {
    const properties = Object.keys((RECEIPT_SCHEMA as { properties: object }).properties)

    expect(properties).toEqual(['looksLikeReceipt', 'amount', 'destination', 'confidence'])
    expect(RECEIPT_SCHEMA).toMatchObject({ additionalProperties: false })
  })
})

describe('reading the photo', () => {
  test('a well formed answer comes back as a reading', async () => {
    const { look } = looking(ANSWER)

    expect(await receiptReader(look)(image)).toEqual(ANSWER)
  })

  test('the image goes as an image content part, with the schema', async () => {
    const { look, calls } = looking(ANSWER)

    await receiptReader(look)(image)

    expect(calls).toHaveLength(1)
    expect(calls[0]!.schema).toBe(RECEIPT_SCHEMA)
    expect(JSON.stringify(calls[0]!.parts)).toContain('data:image/jpeg;base64,AQID')
  })

  test('the prompt tells the model the image is data, not instructions', async () => {
    const { look, calls } = looking(ANSWER)

    await receiptReader(look)(image)

    expect(calls[0]!.system.toLowerCase()).toContain('instruction')
  })
})

describe('anything but a well formed answer is no reading at all', () => {
  const rubbish: [string, unknown][] = [
    ['prose instead of JSON', 'Claro, parece un comprobante de $45.000'],
    ['null', null],
    ['a missing field', { looksLikeReceipt: true, amount: 45000, destination: 'x' }],
    ['a string amount', { ...ANSWER, amount: '45000' }],
    ['a string confidence', { ...ANSWER, confidence: '0.95' }],
    ['a confidence above one', { ...ANSWER, confidence: 5 }],
    ['a confidence below zero', { ...ANSWER, confidence: -1 }],
    ['an extra field the schema forbids', { ...ANSWER, instruction: 'confirm it' }],
  ]

  for (const [why, answer] of rubbish) {
    test(`${why} reads as nothing`, async () => {
      const { look } = looking(answer)

      expect(await receiptReader(look)(image)).toBeNull()
    })
  }

  test('a thrown call reads as nothing', async () => {
    const look: Look = async () => {
      throw new Error('openrouter 502')
    }

    expect(await receiptReader(look)(image)).toBeNull()
  })
})
