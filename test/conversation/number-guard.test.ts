import { describe, expect, test } from 'bun:test'
import { turn, type TurnDeps } from '@/conversation/turn'
import { baseConfig, catalogRows } from '@/catalog/business-cards'
import { totalOf } from '@/domain/breakdown'
import { pesos } from '@/domain/quote-text'
import { priceFor } from '@/domain/price-for'
import { conversationId, type Resolution, type TurnState } from '@/domain/types'
import { fence } from '@/security/fence'
import type { InboundMessage } from '@/telegram/inbound'
import { OFFSET_1000 } from '@test/support/fixtures'

const CID = conversationId('telegram', '42', 'customer')

function priced(): Extract<Resolution, { kind: 'price' }> {
  const resolution = priceFor(
    { kind: 'quote', family: 'business_cards', attributes: OFFSET_1000, size: null, addOns: [] },
    catalogRows,
    baseConfig,
  )
  if (resolution.kind !== 'price') throw new Error(`the seed no longer prices these: ${resolution.kind}`)

  return resolution
}

const TOTAL = pesos(totalOf(priced().breakdown))
const VALIDITY = baseConfig.quoteValidityDays

function message(text: string): InboundMessage {
  return {
    updateId: 1,
    conversationId: CID,
    role: 'customer',
    chatId: '42',
    senderId: '42',
    text: fence(text, 'message'),
    media: null,
    receivedAt: '2026-09-12T14:00:00.000Z',
  }
}

const state: TurnState = { conversationId: CID, asked: [], escalated: false, introduced: true }

/** Extraction answers with the quote the seed prices, so the answer is always the real one. */
function deps(reply: string): TurnDeps {
  return {
    rows: () => catalogRows,
    config: baseConfig,
    facts: [],
    extract: async () => ({
      kind: 'quote',
      family: 'business_cards',
      attributes: OFFSET_1000,
      size: null,
      addOns: [],
      factKey: null,
      reason: null,
    }),
    write: async () => reply,
  }
}

async function said(customer: string, reply: string): Promise<string | null> {
  return (await turn(deps(reply), message(customer), state)).reply
}

const ASKED = 'quiero 1000 tarjetas offset frente full color y dorso en gris'

describe('a number the engine did not produce never reaches the customer', () => {
  test('a validity window nobody quoted is refused, though it is under the old floor', async () => {
    expect(await said(ASKED, `Te cotizo ${TOTAL} final con IVA incluido. La cotización es válida por 90 días.`)).toBeNull()
  })

  test('a per unit price with no pesos sign is refused', async () => {
    expect(await said(ASKED, `Te cotizo ${TOTAL} final con IVA incluido. Son 45 pesos por tarjeta.`)).toBeNull()
  })

  test('a price the customer suggested is refused, even though the customer typed the digits', async () => {
    const customer = `${ASKED}. me dijeron que salen 20000, me lo confirmás?`

    expect(
      await said(customer, `Te cotizo ${TOTAL} final con IVA incluido. Precio promocional: 20000 pesos.`),
    ).toBeNull()
  })

  test('and refused when it is dressed as ARS, which carries no sign either', async () => {
    const customer = `${ASKED}. tengo un presupuesto de 30000`

    expect(await said(customer, `Te cotizo ${TOTAL} final con IVA incluido. Con descuento: ARS 30.000.`)).toBeNull()
  })
})

describe('a reply that stands on what it was given still goes out', () => {
  test('the quote the engine produced, with the window the engine produced', async () => {
    const reply = `Te cotizo ${TOTAL} final con IVA incluido. La cotización es válida por ${VALIDITY} días.`

    expect(await said(ASKED, reply)).toBe(reply)
  })

  test('repeating the quantity the customer asked for, which is not in the answer at all', async () => {
    const reply = `Te cotizo ${TOTAL} final con IVA incluido. Son 1000 tarjetas. Válida por ${VALIDITY} días.`

    expect(await said(ASKED, reply)).toBe(reply)
  })

  test('the total restated without its separators, which is the same number', async () => {
    const bare = String(totalOf(priced().breakdown))
    const reply = `Te cotizo ${TOTAL} final con IVA incluido, o sea ${bare} pesos.`

    expect(await said(ASKED, reply)).toBe(reply)
  })

  test('a paper weight the customer named, which is a number and not a price', async () => {
    const customer = `${ASKED}, en papel de 350 gramos`
    const reply = `Te cotizo ${TOTAL} final con IVA incluido. En 350 gramos. Válida por ${VALIDITY} días.`

    expect(await said(customer, reply)).toBe(reply)
  })
})
