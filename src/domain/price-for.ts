import { DELEGATE, OUT_OF_CATALOG } from './handoff'
import type { Ars } from './money'
import type {
  AttributeContract,
  BreakdownLine,
  BreakdownRate,
  FamilyContract,
  PriceBreakdown,
  QuoteIntent,
  Resolution,
} from './types'

export type CatalogItemKind = 'sale' | 'add_on' | 'discount'

export type CatalogRow = {
  slug: string
  /**
   * The family this row was loaded from. `CONTEXT.md` calls an Item "one row of a family" and
   * this type did not carry the family, which is how `appliesToFamily` attached the business
   * cards design add-on to a talonario: a bare boolean matched any sale row in the array.
   * Unique slugs keep the price edit path safe and do nothing for this.
   */
  familySlug: string
  kind: CatalogItemKind
  label: string
  group?: string
  provisional?: boolean
  attributes?: Record<string, string | number>
  appliesTo?: string[]
  appliesToFamily?: boolean
  /**
   * What the row charges. An amount, or a rate for a family whose modifiers are percentages:
   * facturas states "Por triplicado, sumar 40%" and never the pesos, because the pesos are a
   * function of the job and the same surcharge is 60% on 1/2 oficio and 70% on A4.
   *
   * Exactly one of the two. An amount and a rate are never each other however alike the digits
   * look, which is ADR 0022, and a sale row must always carry an amount.
   */
  price?: Ars
  rate?: number
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

type MatchedLines =
  | { kind: 'lines'; lines: BreakdownLine[]; rates: BreakdownRate[] }
  | { kind: 'escalate'; resolution: Resolution }

// A sanity ceiling, not a price: past this many modules the piece is not a business card any
// more, and a confident quote would be the exact failure this engine exists to prevent.
// Override it through config when a family legitimately runs larger.
const DEFAULT_MAX_MODULES = 50

/**
 * Every loaded family whose label shares a word with what the owner said.
 *
 * A list rather than a boolean, because a shared word cannot decide between two families that
 * share it: "color" is in the folletos label as well as in a message about facturas. The
 * caller escalates on none and on more than one, which is the only honest answer when the
 * next step reprices a list the owner signs for.
 *
 * ponytail: row level targeting, "subi las de 100". It lives here beside the slug match
 * priceFor does, so the two rules cannot drift into two directories.
 */
export function namesFamily(text: string, families: readonly FamilyContract[]): FamilyContract[] {
  const said = words(text)

  return families.filter((family) => words(family.label).some((word) => said.includes(word)))
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
    return { kind: 'escalate', reason: 'out_of_catalog', detail: OUT_OF_CATALOG }
  }

  // Before the rows, because refusing a metre-priced family is a fact about the family and not
  // about what happens to be loaded. Rows are scoped by family now, so checking emptiness first
  // made the reason depend on load order.
  if (config.family.unit === 'linear_meter' || config.family.unit === 'square_meter') {
    return { kind: 'escalate', reason: 'no_match', detail: DELEGATE }
  }

  if (saleRowsOf(rows, config.family.slug).length === 0) {
    return { kind: 'escalate', reason: 'out_of_catalog', detail: OUT_OF_CATALOG }
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

  return { kind: 'escalate', reason: 'no_match', detail: DELEGATE }
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
    return { kind: 'escalate', reason: 'no_match', detail: DELEGATE }
  }

  if (size.widthCm <= 0 || size.heightCm <= 0) {
    return { kind: 'escalate', reason: 'no_match', detail: DELEGATE }
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
    return { kind: 'escalate', reason: 'out_of_catalog', detail: OUT_OF_CATALOG }
  }

  // Signed on the way in: the seed states a module discount as a positive rate because that is
  // how the list writes it, and every rate in a breakdown is signed so `totalOf` needs no branch.
  const rates: BreakdownRate[] = (context.config.moduleDiscounts ?? [])
    .filter((discount) => moduleDiscountApplies(discount, moduleCount))
    .map((discount) => ({ kind: 'module_discount', rate: -discount.rate }))

  return quoteOf(context, matched.row, moduleCount, rates)
}

function matchedSaleRow(context: PriceContext): MatchedRow {
  const matches = saleRowsOf(context.rows, context.config.family.slug).filter((row) =>
    declaredAttributesMatch(row, context.intent, context.config.family.attributes),
  )

  if (matches.length === 1) {
    return { kind: 'row', row: matches[0] }
  }

  if (matches.length > 1) {
    return {
      kind: 'escalate',
      resolution: { kind: 'escalate', reason: 'ambiguous', detail: DELEGATE },
    }
  }

  return { kind: 'escalate', resolution: noSaleRowFor(context) }
}

function noSaleRowFor(context: PriceContext): Resolution {
  const quantity = context.intent.attributes.quantity
  const carried = saleRowsOf(context.rows, context.config.family.slug).some(
    (row) => row.attributes?.quantity === quantity,
  )

  if (quantity !== undefined && !carried) {
    // The list carries the quantities it carries, and nothing between them is quoted.
    return { kind: 'escalate', reason: 'unsupported_quantity', detail: DELEGATE }
  }

  return { kind: 'escalate', reason: 'no_match', detail: DELEGATE }
}

function quoteOf(
  context: PriceContext,
  saleRow: CatalogRow,
  moduleFactor: number,
  rates: BreakdownRate[],
): Resolution {
  const addOns = addOnLines(context.rows, saleRow, context.intent.addOns)
  if (addOns.kind !== 'lines') {
    return addOns.resolution
  }

  const breakdown: PriceBreakdown = {
    base: lineOf(saleRow),
    moduleFactor,
    rates: [...rates, ...addOns.rates],
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
  const rates: BreakdownRate[] = []

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
        resolution: { kind: 'escalate', reason: 'ambiguous', detail: DELEGATE },
      }
    }

    if (candidates.length === 0) {
      return {
        kind: 'escalate',
        resolution: { kind: 'escalate', reason: 'no_match', detail: DELEGATE },
      }
    }

    const row = candidates[0]!

    // A rate add-on joins the percentages rather than the amount lines, so it compounds with
    // the module and quantity discounts in one pass. The line it would have been is not an
    // amount anybody typed: the pesos are derived, and the rate is the thing the owner stated.
    if (row.rate !== undefined) rates.push({ kind: 'surcharge', rate: row.rate, slug: row.slug, label: row.label })
    else lines.push(lineOf(row))
  }

  return { kind: 'lines', lines, rates }
}

function appliesToSaleRow(row: CatalogRow, saleRow: CatalogRow): boolean {
  if (row.familySlug !== saleRow.familySlug) return false

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
  return { slug: row.slug, label: row.label, amount: amountOf(row) }
}

/**
 * The amount a row charges, for a row that must charge one.
 *
 * A sale row always has an amount: the list cannot state a base price as a percentage of
 * nothing. Only an add-on may carry a rate instead, so reaching here with one is a seed that
 * declared a rate on a row the engine prices as money, and that is a loud failure rather than
 * a quote built on `undefined`.
 */
export function amountOf(row: CatalogRow): Ars {
  if (row.price === undefined) {
    throw new Error(`${row.slug} carries a rate and not an amount, so it has no price to read`)
  }

  return row.price
}

export function saleRows(rows: CatalogRow[]): CatalogRow[] {
  return rows.filter((row) => row.kind === 'sale')
}

/**
 * The sale rows of one family. Everything that picks a row to price, or counts the rows a
 * family has, goes through this rather than `saleRows`: one flat array holds every loaded
 * family, so an unfiltered sweep matches a row the customer never asked about.
 */
export function saleRowsOf(rows: CatalogRow[], familySlug: string): CatalogRow[] {
  return saleRows(rows).filter((row) => row.familySlug === familySlug)
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
