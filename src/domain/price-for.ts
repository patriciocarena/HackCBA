import type { Ars } from './money'
import type {
  AttributeContract,
  BreakdownLine,
  FamilyContract,
  PriceBreakdown,
  QuoteIntent,
  Resolution,
} from './types'

export type CatalogItemKind = 'sale' | 'add_on' | 'discount'

export type CatalogRow = {
  slug: string
  kind: CatalogItemKind
  label: string
  group?: string
  provisional?: boolean
  attributes?: Record<string, string | number>
  appliesTo?: string[]
  appliesToFamily?: boolean
  price: Ars
}

export type ModuleDiscount = {
  fromModules: number
  toModules: number | null
  rate: number
}

export type ListDiscountPolicy = {
  /**
   * A discount row the seed marks provisional is one the owner has not confirmed is a
   * discount at all. The plain illustration rows read as the arithmetic he used to build a
   * column rather than as something to subtract again, and applying them would quote under
   * his own list. Flip this when he confirms, and the rows say which they are.
   */
  applyProvisionalDiscounts: boolean
}

export const DEFAULT_LIST_DISCOUNT_POLICY: ListDiscountPolicy = {
  applyProvisionalDiscounts: false,
}

export type PriceForConfig = {
  family: FamilyContract
  quoteValidityDays: number
  maxModules?: number
  moduleDiscounts?: ModuleDiscount[]
  listDiscountPolicy?: ListDiscountPolicy
}

type PriceContext = {
  intent: QuoteIntent
  rows: CatalogRow[]
  config: PriceForConfig
  policy: ListDiscountPolicy
}

type PriceStrategy = (context: PriceContext) => Resolution | null

type MatchedRow = { kind: 'row'; row: CatalogRow } | { kind: 'escalate'; resolution: Resolution }

type MatchedLines = { kind: 'lines'; lines: BreakdownLine[] } | { kind: 'escalate'; resolution: Resolution }

// A sanity ceiling, not a price: past this many modules the piece is not a business card any
// more, and a confident quote would be the exact failure this engine exists to prevent.
// Override it through config when a family legitimately runs larger.
const DEFAULT_MAX_MODULES = 50

const DELEGATE_DETAIL = 'te delego con un humano'
const OUT_OF_CATALOG_DETAIL = 'eso no lo tengo cargado, te delego con un humano'

// ponytail: one family in the list, so a shared word is enough to say the owner meant it.
// Row level targeting, "subi las de 100", when the list has a second family. It lives here
// beside the slug match priceFor does, so the two rules cannot drift into two directories.
export function namesFamily(text: string, family: FamilyContract): boolean {
  const label = words(family.label)

  return words(text).some((word) => label.includes(word))
}

const WORD = /[a-z0-9]+/g
const SHORTEST_WORD = 4

function words(text: string): string[] {
  const plain = text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

  return (plain.match(WORD) ?? []).filter((word) => word.length >= SHORTEST_WORD)
}

export function priceFor(
  intent: QuoteIntent,
  rows: CatalogRow[],
  config: PriceForConfig,
): Resolution {
  const policy = config.listDiscountPolicy ?? DEFAULT_LIST_DISCOUNT_POLICY
  const context = { intent, rows, config, policy }

  if (intent.family !== null && intent.family !== config.family.slug) {
    return { kind: 'escalate', reason: 'out_of_catalog', detail: OUT_OF_CATALOG_DETAIL }
  }

  if (saleRows(rows).length === 0) {
    return { kind: 'escalate', reason: 'out_of_catalog', detail: OUT_OF_CATALOG_DETAIL }
  }

  if (config.family.unit === 'linear_meter' || config.family.unit === 'square_meter') {
    return { kind: 'escalate', reason: 'no_match', detail: DELEGATE_DETAIL }
  }

  const missing = missingAttributes(intent, config.family)
  if (missing.length > 0) {
    // The engine knows what the family still needs. Whether it was asked already, and what
    // to do when the answer still does not resolve, belongs to the turn.
    return { kind: 'ask', missing }
  }

  for (const strategy of PRICE_STRATEGIES) {
    const resolution = strategy(context)
    if (resolution !== null) {
      return resolution
    }
  }

  return { kind: 'escalate', reason: 'no_match', detail: DELEGATE_DETAIL }
}

const PRICE_STRATEGIES: PriceStrategy[] = [exactSaleRowStrategy, moduleMathStrategy]

function exactSaleRowStrategy(context: PriceContext): Resolution | null {
  if (context.intent.size !== null) {
    return null
  }

  const matched = matchedSaleRow(context)
  if (matched.kind !== 'row') {
    return matched.resolution
  }

  return quoteOf(context, matched.row, 1, [])
}

function moduleMathStrategy(context: PriceContext): Resolution | null {
  const size = context.intent.size
  const module = context.config.family.module
  if (size === null) {
    return null
  }

  if (module === null || module.widthCm <= 0 || module.heightCm <= 0) {
    return { kind: 'escalate', reason: 'no_match', detail: DELEGATE_DETAIL }
  }

  if (size.widthCm <= 0 || size.heightCm <= 0) {
    return { kind: 'escalate', reason: 'no_match', detail: DELEGATE_DETAIL }
  }

  const matched = matchedSaleRow(context)
  if (matched.kind !== 'row') {
    return matched.resolution
  }

  // Area, not imposition. The owner's three worked examples are area based. A piece wider
  // than the module is the open question in docs/assumptions.md.
  const moduleCount = Math.ceil((size.widthCm * size.heightCm) / (module.widthCm * module.heightCm))
  const maxModules = context.config.maxModules ?? DEFAULT_MAX_MODULES
  if (moduleCount > maxModules) {
    return { kind: 'escalate', reason: 'out_of_catalog', detail: OUT_OF_CATALOG_DETAIL }
  }

  const rates = (context.config.moduleDiscounts ?? [])
    .filter((discount) => moduleDiscountApplies(discount, moduleCount))
    .map((discount) => discount.rate)

  return quoteOf(context, matched.row, moduleCount, rates)
}

function matchedSaleRow(context: PriceContext): MatchedRow {
  const matches = saleRows(context.rows).filter((row) =>
    declaredAttributesMatch(row, context.intent, context.config.family.attributes),
  )

  if (matches.length === 1) {
    return { kind: 'row', row: matches[0] }
  }

  if (matches.length > 1) {
    return {
      kind: 'escalate',
      resolution: { kind: 'escalate', reason: 'ambiguous', detail: DELEGATE_DETAIL },
    }
  }

  return { kind: 'escalate', resolution: noSaleRowFor(context) }
}

function noSaleRowFor(context: PriceContext): Resolution {
  const quantity = context.intent.attributes.quantity
  const carried = saleRows(context.rows).some((row) => row.attributes?.quantity === quantity)

  if (quantity !== undefined && !carried) {
    // The list carries the quantities it carries, and nothing between them is quoted.
    return { kind: 'escalate', reason: 'unsupported_quantity', detail: DELEGATE_DETAIL }
  }

  return { kind: 'escalate', reason: 'no_match', detail: DELEGATE_DETAIL }
}

function quoteOf(
  context: PriceContext,
  saleRow: CatalogRow,
  moduleFactor: number,
  moduleDiscountRates: number[],
): Resolution {
  const addOns = addOnLines(context.rows, saleRow, context.intent.addOns)
  if (addOns.kind !== 'lines') {
    return addOns.resolution
  }

  const breakdown: PriceBreakdown = {
    base: lineOf(saleRow),
    moduleFactor,
    moduleDiscountRates,
    addOns: addOns.lines,
    listDiscounts: listDiscounts(context.rows, saleRow, context.policy).map(lineOf),
    vatRate: context.config.family.vatRate,
    vatIncluded: context.config.family.vatIncluded,
  }

  return { kind: 'price', breakdown, validityDays: context.config.quoteValidityDays }
}

/**
 * An add-on is named by its group, not by its row. The list prints one Laminado column over
 * four sale rows, and three Puntas redondeadas rows keyed by quantity, so the row is a
 * function of the group and the job. Resolving it here is what lets extraction name the
 * thing the customer said without guessing which row it lands on.
 */
function addOnLines(rows: CatalogRow[], saleRow: CatalogRow, groups: string[]): MatchedLines {
  const lines: BreakdownLine[] = []

  for (const group of groups) {
    const candidates = rows.filter(
      (row) =>
        row.kind === 'add_on' &&
        (row.group ?? row.slug) === group &&
        appliesToSaleRow(row, saleRow) &&
        addOnAttributesMatch(row, saleRow),
    )

    if (candidates.length > 1) {
      return {
        kind: 'escalate',
        resolution: { kind: 'escalate', reason: 'ambiguous', detail: DELEGATE_DETAIL },
      }
    }

    if (candidates.length === 0) {
      return {
        kind: 'escalate',
        resolution: { kind: 'escalate', reason: 'no_match', detail: DELEGATE_DETAIL },
      }
    }

    lines.push(lineOf(candidates[0]))
  }

  return { kind: 'lines', lines }
}

function appliesToSaleRow(row: CatalogRow, saleRow: CatalogRow): boolean {
  if (row.appliesTo !== undefined) {
    return row.appliesTo.includes(saleRow.slug)
  }

  return row.appliesToFamily === true
}

function addOnAttributesMatch(row: CatalogRow, saleRow: CatalogRow): boolean {
  if (row.attributes === undefined) {
    return true
  }

  return Object.entries(row.attributes).every(
    ([attribute, expected]) => saleRow.attributes?.[attribute] === expected,
  )
}

function listDiscounts(
  rows: CatalogRow[],
  saleRow: CatalogRow,
  policy: ListDiscountPolicy,
): CatalogRow[] {
  return rows.filter((row) => {
    if (row.kind !== 'discount' || !(row.appliesTo?.includes(saleRow.slug) ?? false)) {
      return false
    }

    return row.provisional !== true || policy.applyProvisionalDiscounts
  })
}

function lineOf(row: CatalogRow): BreakdownLine {
  return { slug: row.slug, label: row.label, amount: row.price }
}

export function saleRows(rows: CatalogRow[]): CatalogRow[] {
  return rows.filter((row) => row.kind === 'sale')
}

function declaredAttributesMatch(
  row: CatalogRow,
  intent: QuoteIntent,
  attributes: AttributeContract[],
): boolean {
  return attributes.every(
    (attribute) => row.attributes?.[attribute.name] === intent.attributes[attribute.name],
  )
}

function moduleDiscountApplies(discount: ModuleDiscount, moduleCount: number): boolean {
  return (
    moduleCount >= discount.fromModules &&
    (discount.toModules === null || moduleCount <= discount.toModules)
  )
}

function missingAttributes(intent: QuoteIntent, family: FamilyContract): string[] {
  const declared = new Set(family.attributes.map((attribute) => attribute.name))

  return family.askOrder.filter(
    (name) =>
      declared.has(name) &&
      (intent.attributes[name] === undefined || intent.attributes[name] === ''),
  )
}
