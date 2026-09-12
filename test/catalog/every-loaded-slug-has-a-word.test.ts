import { describe, expect, test } from 'bun:test'
import { ALL_ROWS, LOADED_FAMILIES } from '../../src/catalog/families'
import { spanishName, SPANISH_NAMES, SPANISH_VALUES } from '../../src/catalog/spanish'
import { askText } from '../../src/domain/quote-text'

/** Every attribute name any loaded family declares, plus the one the turn asks for itself. */
const NAMES = [...new Set(['family', ...LOADED_FAMILIES.flatMap((f) => f.attributes.map((a) => a.name))])]

/** Every value, as the rows carry them. A number is its own word and needs no entry. */
const VALUES = [
  ...new Set(
    ALL_ROWS.flatMap((row) => Object.values(row.attributes ?? {})).filter(
      (value): value is string => typeof value === 'string',
    ),
  ),
]

/**
 * The fallback in `spanishValue` and `attributeLabel` is a slug, which keeps a work order
 * printable rather than empty. It is not a translation: `front_and_back` at the cutting table
 * is a person stopping to think, and `half_legal` in the message a customer reads is English
 * in a Spanish shop. So every slug a loaded family can produce needs a word, and the test is
 * what makes the next family's slugs fail here instead of on the owner's phone.
 */
describe('the words for the slugs the loaded families carry', () => {
  // Presence in the map, not a word that differs from the slug: `pleno` and `color` are
  // Spanish already, and asserting they change would force a worse translation than the list's.
  test('every attribute value the rows carry has a Spanish word', () => {
    expect(VALUES.filter((value) => !(value in SPANISH_VALUES))).toEqual([])
  })

  test('every attribute name has one, for the work order', () => {
    expect(NAMES.filter((name) => !(name in SPANISH_NAMES))).toEqual([])
  })

  test('and the customer is asked through that same map, not through a second copy of it', () => {
    const asked = askText(NAMES)

    for (const name of NAMES) expect(asked).toContain(spanishName(name))
  })
})
