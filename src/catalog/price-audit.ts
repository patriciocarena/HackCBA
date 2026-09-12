import type { PriceListFamily, PriceListRow } from './price-list'

/**
 * The seed checked against the list it was typed from.
 *
 * A hand typed seed is twenty rows of digits copied by a person, and the way it fails is a lost
 * digit: every test still passes, because every test asserts the number the seed declares. ADR
 * 0020 is the same failure one level up, in a flag rather than an amount.
 *
 * The comparison is on amounts and not on labels. The labels in the seed are a person's
 * rewriting of the list's ("Tarjetas full color 300g" became "Tarjetas full color, frente full
 * color y dorso escala de grises"), and matching them would report drift that is only wording.
 * An amount is the thing a customer pays and the thing a typo ruins.
 */

export type AuditedFamily = PriceListFamily

export type SeedItem = { id: string; price: number }

export type Audit = {
  /** Items whose amount appears nowhere in the family's tables. */
  wrong: SeedItem[]
  /** Amounts the list states that no item claims. A row nobody loaded, or a row loaded twice. */
  unclaimed: number[]
}

export function auditAgainstList(items: readonly SeedItem[], family: AuditedFamily): Audit {
  // A multiset, because two rows priced the same are two rows and one item cannot answer for
  // both. Claiming decrements, so the second identical amount stays unclaimed until a second
  // item claims it.
  const available = new Map<number, number>()

  for (const price of statedPrices(family)) {
    available.set(price, (available.get(price) ?? 0) + 1)
  }

  const wrong: SeedItem[] = []

  for (const item of items) {
    const left = available.get(item.price) ?? 0

    if (left === 0) wrong.push(item)
    else available.set(item.price, left - 1)
  }

  return { wrong, unclaimed: [...available].flatMap(([price, left]) => Array(left).fill(price)) }
}

/**
 * Every amount the family actually states, counting a row the list repeats as one row.
 *
 * Two rules, and the cards family needs both.
 *
 * "Diseño (mínimo)" is stated at $20.000 once under each of two tables, because it applies to
 * both, and the seed carries it once with `applies_to_family: true`. That is the correct
 * normalisation, so counting it twice would train the team to ignore this whole check.
 *
 * "Laminado" is stated at $6.800 twice inside one table, once after the sale row for 100 cards
 * front and back and once after the row for 200 front. Those are two add-ons that happen to
 * cost the same, and the list tells them apart by which row they follow. Collapsing them would
 * call a loaded seed wrong.
 *
 * So a row's count is the most times one table states it, never the sum across tables. Within
 * a table repetition means another row; across tables it means the same row again.
 *
 * A dash is a column the row is not offered in and "a consultar" is a price only a person
 * gives, so neither is an amount anybody must claim.
 */
function statedPrices(family: AuditedFamily): number[] {
  const most = new Map<string, { price: number; count: number }>()

  for (const table of family.tables) {
    for (const [identity, stated] of countedIn(table.rows)) {
      const known = most.get(identity)

      if (known === undefined || stated.count > known.count) most.set(identity, stated)
    }
  }

  return [...most.values()].flatMap((stated) => Array<number>(stated.count).fill(stated.price))
}

function countedIn(rows: readonly PriceListRow[]): Map<string, { price: number; count: number }> {
  const counted = new Map<string, { price: number; count: number }>()

  for (const row of rows) {
    for (const price of row.prices) {
      if (typeof price !== 'number') continue

      const identity = `${row.kind}|${row.label}|${price}`
      const known = counted.get(identity)

      counted.set(identity, { price, count: (known?.count ?? 0) + 1 })
    }
  }

  return counted
}
