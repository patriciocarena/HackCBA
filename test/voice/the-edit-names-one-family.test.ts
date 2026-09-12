import { describe, expect, test } from 'bun:test'
import { ALL_ROWS, LOADED_FAMILIES } from '../../src/catalog/families'
import { saleRowsOf } from '../../src/domain/price-for'
import { proposePriceEdit } from '../../src/voice/price-edit-proposal'
import type { PriceEditIntent } from '../../src/voice/price-edit-intent'

const NOW = '2026-09-12T10:00:00.000Z'

function raise(target: string): PriceEditIntent {
  return { kind: 'edit', target, change: { kind: 'percent', direction: 'raise', value: 10 } }
}

function propose(target: string) {
  return proposePriceEdit({
    intent: raise(target),
    rows: ALL_ROWS,
    families: LOADED_FAMILIES,
    media: { kind: 'voice', id: 'v1' },
    proposedBy: '42',
    proposedAt: NOW,
  })
}

/**
 * The owner dictates one price change and signs one diff. With one family loaded, matching a
 * shared word and then repricing every sale row in the array were the same thing. With three
 * they are not: "subime las tarjetas" moved folletos and facturas too, and the owner signed a
 * diff that never named them.
 */
describe('an edit the owner dictates', () => {
  test('moves only the family he named, not every row in the array', () => {
    const proposed = propose('las tarjetas')

    expect(proposed.ok).toBe(true)
    if (!proposed.ok) return
    expect(proposed.proposal.lines).toHaveLength(saleRowsOf(ALL_ROWS, 'business_cards').length)
    expect(proposed.proposal.familySlug).toBe('business_cards')
  })

  test('every line says which list it moves, so the diff he signs names it', () => {
    const proposed = propose('los folletos')

    expect(proposed.ok).toBe(true)
    if (!proposed.ok) return
    expect(new Set(proposed.proposal.lines.map((line) => line.familySlug))).toEqual(
      new Set(['folletos_laser']),
    )
  })

  /**
   * "color" is a word in the folletos label as well as the one he said, and word overlap alone
   * cannot tell him which he meant. Picking one would be the wrong list repriced silently.
   */
  test('a word that answers for two families is sent back for review, not guessed', () => {
    const proposed = propose('las facturas color')

    expect(proposed.ok).toBe(false)
    if (proposed.ok) return
    expect(proposed.review.reason).toBe('ambiguous')
  })

  test('a family nobody loaded is no match, the way it always was', () => {
    const proposed = propose('las gigantografias')

    expect(proposed.ok).toBe(false)
    if (proposed.ok) return
    expect(proposed.review.reason).toBe('no_match')
  })
})
