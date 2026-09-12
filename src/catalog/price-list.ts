/**
 * The price list, read as what it literally says.
 *
 * `lista-precios.html` is the source of truth for the catalog and it is already structured:
 * `td.p` is a price, `tr.mod` carries a tag saying whether the row adds or subtracts, and a
 * dash in a two column table is a finish that row is not offered in. Parsing it is
 * deterministic, which is the point: ADR 0020 exists because a human read the list and typed
 * the wrong answer about VAT into a seed.
 *
 * What this does not do is invent the attribute bag. "100 tarjetas color sólo frente" becomes
 * `{ quantity: 100, sides: 'front' }` only because a person read the Spanish and decided so,
 * and a regex that did the same would be the nearest neighbour guessing the whole product
 * forbids, wearing a parser's clothes. This reads labels, prices, kinds and structure. A human
 * writes the bag, and `scripts/parse-price-list.ts` checks their labels and prices against
 * what is actually in the list.
 *
 * No HTML dependency. The file is generated markup with a fixed shape, versioned beside this,
 * and the diff against the seed is what proves the reading was right.
 */

/** A price the list states, a column this row is not offered in, or a price only a person gives. */
export type PriceCell = number | null | 'on_request'

export type RowKind = 'sale' | 'add_on' | 'discount'

export type PriceListRow = {
  label: string
  kind: RowKind
  prices: PriceCell[]
  /** What the row is sold by, when its table declares a unit column. The client plan's unit_kind. */
  unit?: string
  note?: string
}

export type PriceListTable = {
  heading: string
  /** The headed columns a row prices against, empty when the table prices one thing per row. */
  columns: string[]
  rows: PriceListRow[]
}

export type PriceListFamily = {
  label: string
  tables: PriceListTable[]
}

export type PriceList = {
  /** Read off the list's own header. Never defaulted: see ADR 0020. */
  vatIncluded: boolean
  families: PriceListFamily[]
}

export function parsePriceList(html: string): PriceList {
  return {
    vatIncluded: vatStatement(html),
    // A section of clarifications is prose laid out in tables, and it is not a family. What
    // makes a family is a heading and at least one table that states a price.
    families: sectionsOf(html).map(family).filter((one) => one.label !== '' && one.tables.length > 0),
  }
}

/**
 * The one line that decides every amount in the file. A list that does not say gets an error
 * rather than a default, because both defaults are a wrong price in some shop's mouth.
 */
function vatStatement(html: string): boolean {
  const text = plain(html)

  if (/los\s+precios\s+no\s+incluyen\s+iva/i.test(text)) return false
  if (/los\s+precios\s+incluyen\s+iva/i.test(text)) return true

  throw new Error('the list does not say whether its prices include IVA, and neither default is safe')
}

function sectionsOf(html: string): string[] {
  return [...html.matchAll(/<section\b[^>]*>([\s\S]*?)<\/section>/gi)].map((found) => found[1] as string)
}

function family(section: string): PriceListFamily {
  const heading = /<h2\b[^>]*>([\s\S]*?)<\/h2>/i.exec(section)

  return { label: plain(heading?.[1] ?? ''), tables: tablesOf(section) }
}

/**
 * Each table with the `h3` that introduces it, and the ones that have none. Six of the twenty
 * families put their table straight under the `h2`, so splitting on the subheadings and taking
 * what follows would drop them entirely. The first block is what comes before any `h3`, and it
 * is a table with an empty heading rather than a table nobody sees.
 */
function tablesOf(section: string): PriceListTable[] {
  const [unheaded, ...blocks] = section.split(/<h3\b[^>]*>/i)

  return [
    ...tablesIn(unheaded ?? '', ''),
    ...blocks.flatMap((block) => {
      const [heading, rest] = splitOnce(block, /<\/h3>/i)

      return tablesIn(rest, plain(heading))
    }),
  ]
}

/** Only the tables that state a price. The clarification tables are prose in the same markup. */
function tablesIn(html: string, heading: string): PriceListTable[] {
  return [...html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)]
    .map((found) => found[1] as string)
    .filter((body) => /class="p\b/i.test(body))
    .map((body) => table(heading, body))
}

function table(heading: string, body: string): PriceListTable {
  const all = [...body.matchAll(/<tr\b([^>]*)>([\s\S]*?)<\/tr>/gi)]
  const headed = all.filter((found) => /<th\b/i.test(found[2] as string))

  return {
    heading,
    // The first heading names the product column, so the rest are what a row prices against.
    columns: headed.flatMap((found) => cellsOf(found[2] as string, 'th').map(plain)).slice(1),
    rows: all
      .filter((found) => !/<th\b/i.test(found[2] as string))
      .map((found) => row(found[1] as string, found[2] as string)),
  }
}

function row(attributes: string, body: string): PriceListRow {
  const cells = rawCellsOf(body, 'td')
  const first = cells[0]?.html ?? ''
  const note = /<div class="note">([\s\S]*?)<\/div>/i.exec(first)

  // The unit column is not money and must never be read as an amount. `td.u` says which one
  // it is, so the row keeps it and the price cells are what is left.
  const unit = cells.find((cell) => /\bu\b/.test(cell.attributes))

  const parsed: PriceListRow = {
    label: plain(withoutTags(first)),
    kind: kindOf(attributes, first),
    prices: cells
      .slice(1)
      .filter((cell) => cell !== unit)
      .map((cell) => priceCell(cell.html)),
  }

  return {
    ...parsed,
    ...(unit === undefined ? {} : { unit: plain(unit.html) }),
    ...(note === null ? {} : { note: plain(note[1] as string) }),
  }
}

/**
 * `tr.mod` says a row modifies the ones above it and the tag says in which direction. A row
 * with no tag is a sale row, which is the only kind that carries the base price of a job.
 */
function kindOf(attributes: string, firstCell: string): RowKind {
  if (!/\bmod\b/.test(attributes)) return 'sale'

  return /class="tag d"/i.test(firstCell) ? 'discount' : 'add_on'
}

function priceCell(cell: string): PriceCell {
  const text = plain(cell)

  if (/consultar/i.test(text)) return 'on_request'

  // Argentine thousands separator. A cell with no digits at all is the dash, and a dash is a
  // finish the row is not offered in, never a zero.
  const digits = text.replace(/[^\d]/g, '')

  return digits === '' ? null : Number(digits)
}

/** A module discount states its percentages in words and prices nothing, so it has no cells. */
function cellsOf(body: string, tag: 'td' | 'th'): string[] {
  return rawCellsOf(body, tag).map((cell) => cell.html)
}

/** The cells with the attributes that say what each one is, which is how `td.u` is told apart. */
function rawCellsOf(body: string, tag: 'td' | 'th'): { attributes: string; html: string }[] {
  const pattern = new RegExp(`<${tag}\\b([^>]*)>([\\s\\S]*?)</${tag}>`, 'gi')

  return [...body.matchAll(pattern)].map((found) => ({
    attributes: found[1] as string,
    html: found[2] as string,
  }))
}

function withoutTags(cell: string): string {
  return cell.replace(/<span class="tag[^"]*">[\s\S]*?<\/span>/gi, '').replace(/<div class="note">[\s\S]*?<\/div>/gi, '')
}

function plain(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

function splitOnce(text: string, at: RegExp): [string, string] {
  const found = at.exec(text)

  return found === null ? [text, ''] : [text.slice(0, found.index), text.slice(found.index + found[0].length)]
}
