import type { PriceCell, PriceListFamily, PriceListRow } from './price-list'

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

/**
 * A seed row as the audit sees it: an amount, or a rate for a family whose modifiers are
 * percentages. Exactly one of the two, because an amount and a rate are never each other
 * however alike the digits look. That is ADR 0022 in a type.
 */
export type SeedItem = { id: string; price: number } | { id: string; rate: number }

export type Audit = {
  /** Items whose amount or rate appears nowhere in the family's tables. */
  wrong: SeedItem[]
  /** What the list states and no item claims. A row nobody loaded, or a row loaded twice. */
  unclaimed: Claimable[]
}

/** What an item may claim: an amount in pesos, or a rate. */
type Claimable = number | { rate: number }

export function auditAgainstList(items: readonly SeedItem[], family: AuditedFamily): Audit {
  // A multiset, because two rows priced the same are two rows and one item cannot answer for
  // both. Claiming decrements, so the second identical amount stays unclaimed until a second
  // item claims it. The key is a tagged string rather than the number, so `40` and `40%` are
  // two different things to claim and neither can answer for the other.
  const available = new Map<string, number>()

  for (const stated of statedPrices(family)) {
    const key = keyOf(stated)
    available.set(key, (available.get(key) ?? 0) + 1)
  }

  const wrong: SeedItem[] = []

  for (const item of items) {
    const key = keyOf(claimOf(item))
    const left = available.get(key) ?? 0

    if (left === 0) wrong.push(item)
    else available.set(key, left - 1)
  }

  return {
    wrong,
    unclaimed: [...available].flatMap(([key, left]) => Array<Claimable>(left).fill(claimFrom(key))),
  }
}

function claimOf(item: SeedItem): Claimable {
  return 'rate' in item ? { rate: item.rate } : item.price
}

function keyOf(claim: Claimable): string {
  return typeof claim === 'number' ? `amount:${claim}` : `rate:${claim.rate}`
}

function claimFrom(key: string): Claimable {
  const [kind, value] = key.split(':') as [string, string]

  return kind === 'rate' ? { rate: Number(value) } : Number(value)
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
 * gives, so neither is an amount anybody must claim. A percentage is claimable, as a rate:
 * a mistyped 0.04 for 0.4 ruins a quote exactly the way a lost digit does.
 */
function statedPrices(family: AuditedFamily): Claimable[] {
  const most = new Map<string, { price: Claimable; count: number }>()

  for (const table of family.tables) {
    for (const [identity, stated] of countedIn(table.rows)) {
      const known = most.get(identity)

      if (known === undefined || stated.count > known.count) most.set(identity, stated)
    }
  }

  return [...most.values()].flatMap((stated) => Array<Claimable>(stated.count).fill(stated.price))
}

function countedIn(rows: readonly PriceListRow[]): Map<string, { price: Claimable; count: number }> {
  const counted = new Map<string, { price: Claimable; count: number }>()

  for (const row of rows) {
    for (const cell of row.prices) {
      const price = claimable(cell)
      if (price === null) continue

      const identity = `${row.kind}|${row.label}|${keyOf(price)}`
      const known = counted.get(identity)

      counted.set(identity, { price, count: (known?.count ?? 0) + 1 })
    }
  }

  return counted
}

/** An amount or a rate. A dash and "a consultar" are neither, so nobody has to claim them. */
function claimable(cell: PriceCell): Claimable | null {
  if (typeof cell === 'number') return cell
  if (typeof cell === 'object' && cell !== null) return cell

  return null
}
