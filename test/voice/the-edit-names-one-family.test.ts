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
   * A message that names two families names neither, and picking one would reprice a list he
   * never said out loud on a diff that does not show the transcript.
   */
  test('a message that names two families is sent back for review, not guessed', () => {
    const proposed = propose('las tarjetas de facturas')

    expect(proposed.ok).toBe(false)
    if (proposed.ok) return
    expect(proposed.review.reason).toBe('ambiguous')
  })

  /**
   * Which word decides, and which only describes.
   *
   * Matching on any shared word refused this: the folletos label is "Folletos full color
   * láser", so "full" and "color" answered for folletos in a sentence about tarjetas, and the
   * owner's own wording for the cards rows could not make the edit at all. No two labels share
   * a word, so ranking by how many matched does not help either: here it is two against two.
   *
   * The head word is the product noun the list names the family by, and it is the one word
   * that decides. The rest only tell apart families that share a head, which is four groups of
   * the thirty eight: "folletos" alone will refuse once the offset family loads, and "folletos
   * láser" will still resolve.
   */
  test('a descriptor in another family label does not answer for it', () => {
    for (const said of ['las tarjetas full color', 'las tarjetas personales full color']) {
      const proposed = propose(said)

      expect(proposed.ok).toBe(true)
      if (!proposed.ok) return
      expect(proposed.proposal.familySlug).toBe('business_cards')
    }
  })

  test('so a descriptor beside the family he did name still names that one', () => {
    const proposed = propose('las facturas color')

    expect(proposed.ok).toBe(true)
    if (!proposed.ok) return
    expect(proposed.proposal.familySlug).toBe('facturas')
  })

  test('a family nobody loaded is no match, the way it always was', () => {
    const proposed = propose('las gigantografias')

    expect(proposed.ok).toBe(false)
    if (proposed.ok) return
    expect(proposed.review.reason).toBe('no_match')
  })
})
