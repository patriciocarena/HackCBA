import { describe, expect, test } from 'bun:test'
import { baseConfig, catalogRows } from '@/catalog/business-cards'
import { liveCatalog } from '@/catalog/live-catalog'
import type { PriceVersion } from '@/catalog/apply-edit'
import { turn } from '@/conversation/turn'
import { totalOf } from '@/domain/breakdown'
import { ars } from '@/domain/money'
import { pesos } from '@/domain/quote-text'
import { priceFor } from '@/domain/price-for'
import { conversationId, type PriceEditProposal, type TurnState } from '@/domain/types'
import { fence } from '@/security/fence'
import { confirmCallback } from '@/telegram/confirm-callback'
import type { Callback } from '@/telegram/callback'
import type { InboundMessage } from '@/telegram/inbound'
import { intent, SPECIAL_100 } from '@test/support/fixtures'

const ADMIN = '99900011'
const SLUG = 'bc_special_100_front'
const NOW = '2026-09-12T10:05:00.000Z'

const LISTED = catalogRows.find((row) => row.slug === SLUG)?.price as number
const RAISED = ars(Math.round(LISTED * 1.2))

function proposal(): PriceEditProposal {
  return {
    id: 'edit_1',
    operation: { op: 'percent', direction: 'raise', rate: 0.2 },
    lines: [{ slug: SLUG, label: '100 tarjetas', oldPrice: ars(LISTED), newPrice: RAISED }],
    state: 'proposed',
    source: 'audio',
    mediaId: 'voice_abc',
    proposedBy: ADMIN,
    proposedAt: '2026-09-12T10:00:00.000Z',
    resolvedBy: null,
    resolvedAt: null,
  }
}

const press: Callback = {
  updateId: 900,
  callbackId: 'cbq_1',
  chatId: '7',
  privateChat: true,
  senderId: ADMIN,
  proposalId: 'edit_1',
  accepted: true,
}

function message(): InboundMessage {
  return {
    updateId: 1,
    conversationId: conversationId('telegram', '42', 'customer'),
    role: 'customer',
    chatId: '42',
    senderId: '42',
    text: fence('cuánto 100 tarjetas en papel especial', 'message'),
    media: null,
    receivedAt: NOW,
  }
}

function opening(): TurnState {
  return { conversationId: conversationId('telegram', '42', 'customer'), asked: [], escalated: false, introduced: true, attributes: {} }
}

/** What the catalog says the answer is, computed the way the engine computes it. */
function quotedFrom(rows: typeof catalogRows): string {
  const resolution = priceFor(intent({ attributes: SPECIAL_100 }), rows, baseConfig)
  if (resolution.kind !== 'price') throw new Error(`the seed no longer prices 100 special cards: ${resolution.kind}`)

  return pesos(totalOf(resolution.breakdown))
}

describe('the owner confirms, and the next customer is quoted the new price', () => {
  test('the turn prices against the rows the press installed, not the ones it started with', async () => {
    const catalog = liveCatalog(catalogRows)
    const held = new Map([['edit_1', proposal()]])
    const versions: PriceVersion[] = []

    const onCallback = confirmCallback({
      load: async (id) => held.get(id) ?? null,
      save: async (saved) => void held.set(saved.id, saved),
      catalog,
      record: async (version) => void versions.push(version),
      isAdmin: (id) => id === ADMIN,
      answer: async () => {},
      send: async () => {},
      versionId: () => 'v1',
      now: () => NOW,
    })

    const quote = async (): Promise<string | null> => {
      const answer = { kind: 'quote', family: 'business_cards', attributes: SPECIAL_100, size: null, addOns: [], factKey: null }
      const result = await turn(
        {
          rows: catalog.rows,
          config: baseConfig,
          facts: [],
          extract: async () => answer,
          write: async (request) => request.user.match(/Te cotizo \$[\d.]+/)?.[0] ?? 'sin importe',
        },
        message(),
        opening(),
      )

      return result.reply
    }

    const before = quotedFrom(catalogRows)

    expect(await quote()).toBe(`Te cotizo ${before}`)

    await onCallback(press)

    const after = quotedFrom(catalog.rows())

    expect(after).not.toBe(before)
    expect(await quote()).toBe(`Te cotizo ${after}`)
    expect(versions).toHaveLength(1)
  })
})
