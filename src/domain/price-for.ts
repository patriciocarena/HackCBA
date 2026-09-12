import type { Intent, Resolution, Unit } from './types'

export type PriceForItemKind = 'sale' | 'add_on' | 'discount'

export type PriceForCatalogRow = {
  id: number
  slug: string
  kind: PriceForItemKind
  label: string
  attributes?: Record<string, string | number>
  appliesTo?: string[]
  appliesToFamily?: boolean
  price: number
}

export type PriceForFamily = {
  slug: string
  label: string
  unit: Unit
  attributes: string[]
  askOrder: string[]
  module?: {
    widthCm: number
    heightCm: number
  }
}

export type ListDiscountPolicy = {
  /**
   * The seed carries the plain illustration rows as discounts, but the current
   * business decision treats the illustration column prices as final. Flip this
   * one flag when the owner confirms those rows are authoritative discounts.
   */
  applyProvisionalIllustrationPlainDiscounts: boolean
}

export const DEFAULT_LIST_DISCOUNT_POLICY: ListDiscountPolicy = {
  applyProvisionalIllustrationPlainDiscounts: false,
}

export type ModuleDiscount = {
  fromModules: number
  toModules: number | null
  rate: number
}

export type PriceForConfig = {
  family: PriceForFamily
  vatRate: number
  quoteValidityDays: number
  moduleDiscounts?: ModuleDiscount[]
  listDiscountPolicy?: ListDiscountPolicy
}

type PriceContext = {
  intent: Intent
  rows: PriceForCatalogRow[]
  config: PriceForConfig
  policy: ListDiscountPolicy
}

type PriceStrategy = (context: PriceContext) => Resolution | null

type PricedPart = {
  label: string
  amount: number
  operation: 'base' | 'add' | 'subtract'
}

const DELEGATE_DETAIL = 'te delego con un humano'
const OUT_OF_CATALOG_DETAIL = 'eso no lo tengo cargado, te delego con un humano'

const ATTRIBUTE_LABELS: Record<string, string> = {
  quantity: 'cantidad',
  paper: 'papel',
  sides: 'caras',
  finish: 'terminación',
  family: 'familia',
}

export function priceFor(
  intent: Intent,
  rows: PriceForCatalogRow[],
  config: PriceForConfig,
): Resolution {
  const policy = config.listDiscountPolicy ?? DEFAULT_LIST_DISCOUNT_POLICY
  const context = { intent, rows, config, policy }

  if (isVatQuestion(intent)) {
    return { kind: 'escalate', reason: 'vat_question', detail: DELEGATE_DETAIL }
  }

  if (isCommercialDiscountQuestion(intent)) {
    return { kind: 'escalate', reason: 'not_a_fact', detail: DELEGATE_DETAIL }
  }

  if (intent.family !== null && intent.family !== config.family.slug) {
    return { kind: 'escalate', reason: 'out_of_catalog', detail: OUT_OF_CATALOG_DETAIL }
  }

  if (rows.length === 0) {
    return { kind: 'escalate', reason: 'out_of_catalog', detail: OUT_OF_CATALOG_DETAIL }
  }

  if (config.family.unit === 'linear_meter' || config.family.unit === 'square_meter') {
    return { kind: 'escalate', reason: 'no_match', detail: DELEGATE_DETAIL }
  }

  const missingAttributes = requiredMissingAttributes(intent, config.family)
  if (missingAttributes.length > 0) {
    return {
      kind: 'escalate',
      reason: 'missing_attribute',
      detail: missingAttributeDetail(missingAttributes),
    }
  }

  for (const strategy of PRICE_STRATEGIES) {
    const resolution = strategy(context)
    if (resolution !== null) {
      return resolution
    }
  }

  return { kind: 'escalate', reason: 'no_match', detail: DELEGATE_DETAIL }
}

const PRICE_STRATEGIES: PriceStrategy[] = [
  exactSaleRowStrategy,
  moduleMathPlaceholderStrategy, // B5 slots the module pricing strategy here.
]

function exactSaleRowStrategy(context: PriceContext): Resolution | null {
  if (hasModuleSizeRequest(context.intent)) {
    return null
  }

  const directMatches = saleRows(context.rows).filter((row) =>
    declaredAttributesMatch(row, context.intent, context.config.family.attributes),
  )

  if (directMatches.length > 1) {
    return { kind: 'escalate', reason: 'ambiguous', detail: DELEGATE_DETAIL }
  }

  const explicitAddOn = requestedExplicitAddOn(context.intent)
  if (directMatches.length === 1) {
    return priceMatchedSaleRow(context, directMatches[0], explicitAddOn)
  }

  const finish = context.intent.attributes.finish
  if (typeof finish === 'string' && finish !== 'none') {
    const baseMatches = saleRows(context.rows).filter((row) =>
      declaredAttributesMatch(row, context.intent, context.config.family.attributes, { finish: 'none' }),
    )

    if (baseMatches.length > 1) {
      return { kind: 'escalate', reason: 'ambiguous', detail: DELEGATE_DETAIL }
    }

    if (baseMatches.length === 1) {
      return priceMatchedSaleRow(context, baseMatches[0], finish)
    }
  }

  return { kind: 'escalate', reason: 'no_match', detail: DELEGATE_DETAIL }
}

function moduleMathPlaceholderStrategy(context: PriceContext): Resolution | null {
  if (!hasModuleSizeRequest(context.intent)) {
    return null
  }

  const dimensions = requestedModuleDimensions(context.intent)
  const module = context.config.family.module
  const moduleDiscounts = context.config.moduleDiscounts
  if (dimensions === null || module === undefined || moduleDiscounts === undefined) {
    return { kind: 'escalate', reason: 'no_match', detail: DELEGATE_DETAIL }
  }

  const directMatches = saleRows(context.rows).filter((row) =>
    declaredAttributesMatch(row, context.intent, context.config.family.attributes),
  )

  if (directMatches.length > 1) {
    return { kind: 'escalate', reason: 'ambiguous', detail: DELEGATE_DETAIL }
  }

  if (directMatches.length === 0) {
    return { kind: 'escalate', reason: 'no_match', detail: DELEGATE_DETAIL }
  }

  const saleRow = directMatches[0]
  const pieceArea = dimensions.widthCm * dimensions.heightCm
  const moduleArea = module.widthCm * module.heightCm
  if (pieceArea <= 0 || moduleArea <= 0) {
    return { kind: 'escalate', reason: 'no_match', detail: DELEGATE_DETAIL }
  }

  const moduleCount = Math.ceil(pieceArea / moduleArea)
  // Provisional owner-facing assumption: the module price is the matching
  // standard row price for the same quantity, paper, sides and finish.
  const moduleSubtotal = saleRow.price * moduleCount
  const appliedDiscounts = moduleDiscounts.filter((discount) => moduleDiscountApplies(discount, moduleCount))
  const discountedNetTotal = appliedDiscounts.reduce(
    (total, discount) => total * (1 - discount.rate),
    moduleSubtotal,
  )
  const grossTotal = grossAmount(discountedNetTotal, context.config.vatRate)

  return {
    kind: 'price',
    amount: grossTotal,
    itemId: saleRow.id,
    explanation: modulePriceExplanation({
      grossTotal,
      saleRow,
      widthCm: dimensions.widthCm,
      heightCm: dimensions.heightCm,
      moduleWidthCm: module.widthCm,
      moduleHeightCm: module.heightCm,
      pieceArea,
      moduleArea,
      moduleCount,
      moduleSubtotal,
      discountedNetTotal,
      appliedDiscounts,
      config: context.config,
    }),
  }
}

function priceMatchedSaleRow(
  context: PriceContext,
  saleRow: PriceForCatalogRow,
  requestedAddOn: string | null,
): Resolution {
  const addOnRows = requestedAddOn === null ? [] : matchingAddOns(context.rows, saleRow, requestedAddOn)

  if (requestedAddOn !== null && addOnRows.length === 0) {
    return { kind: 'escalate', reason: 'no_match', detail: DELEGATE_DETAIL }
  }

  if (addOnRows.length > 1) {
    return { kind: 'escalate', reason: 'ambiguous', detail: DELEGATE_DETAIL }
  }

  const discounts = listDiscounts(context.rows, saleRow, context.policy)
  const parts: PricedPart[] = [
    { label: saleRow.label, amount: saleRow.price, operation: 'base' },
    ...addOnRows.map((row) => ({ label: row.label, amount: row.price, operation: 'add' as const })),
    ...discounts.map((row) => ({ label: row.label, amount: row.price, operation: 'subtract' as const })),
  ]
  const netTotal = parts.reduce((total, part) => {
    if (part.operation === 'subtract') {
      return total - part.amount
    }

    return total + part.amount
  }, 0)
  const grossTotal = grossAmount(netTotal, context.config.vatRate)

  return {
    kind: 'price',
    amount: grossTotal,
    itemId: saleRow.id,
    explanation: priceExplanation(grossTotal, parts, context.config),
  }
}

function saleRows(rows: PriceForCatalogRow[]): PriceForCatalogRow[] {
  return rows.filter((row) => row.kind === 'sale')
}

function declaredAttributesMatch(
  row: PriceForCatalogRow,
  intent: Intent,
  attributes: string[],
  overrides: Record<string, string | number> = {},
): boolean {
  return attributes.every((attribute) => {
    const expected = overrides[attribute] ?? intent.attributes[attribute]
    return row.attributes?.[attribute] === expected
  })
}

function matchingAddOns(
  rows: PriceForCatalogRow[],
  saleRow: PriceForCatalogRow,
  requestedAddOn: string,
): PriceForCatalogRow[] {
  const normalizedRequest = normalizeToken(requestedAddOn)

  return rows.filter((row) => {
    if (row.kind !== 'add_on') {
      return false
    }

    const appliesToSale = row.appliesTo?.includes(saleRow.slug) ?? false
    if (!appliesToSale) {
      return false
    }

    return normalizeToken(row.slug).includes(normalizedRequest) || normalizeToken(row.label).includes(normalizedRequest)
  })
}

function listDiscounts(
  rows: PriceForCatalogRow[],
  saleRow: PriceForCatalogRow,
  policy: ListDiscountPolicy,
): PriceForCatalogRow[] {
  return rows.filter((row) => {
    if (row.kind !== 'discount' || !(row.appliesTo?.includes(saleRow.slug) ?? false)) {
      return false
    }

    if (
      row.slug.startsWith('bc_discount_illustration_plain_') &&
      !policy.applyProvisionalIllustrationPlainDiscounts
    ) {
      return false
    }

    return true
  })
}

function grossAmount(netAmount: number, vatRate: number): number {
  return Math.round(netAmount * (1 + vatRate))
}

function requestedModuleDimensions(intent: Intent): { widthCm: number; heightCm: number } | null {
  const widthCm = numericAttribute(intent.attributes.width_cm)
  const heightCm = numericAttribute(intent.attributes.height_cm)

  if (widthCm === null || heightCm === null) {
    return null
  }

  return { widthCm, heightCm }
}

function numericAttribute(value: string | number | undefined): number | null {
  if (value === undefined || value === '') {
    return null
  }

  const numericValue = Number(value)
  return Number.isFinite(numericValue) ? numericValue : null
}

function moduleDiscountApplies(discount: ModuleDiscount, moduleCount: number): boolean {
  return moduleCount >= discount.fromModules && (discount.toModules === null || moduleCount <= discount.toModules)
}

function requiredMissingAttributes(intent: Intent, family: PriceForFamily): string[] {
  const declaredRequiredAttributes = new Set(family.attributes)
  const candidates = [...family.askOrder, ...intent.missing]
  const orderedUniqueCandidates = candidates.filter((attribute, index) => candidates.indexOf(attribute) === index)

  return orderedUniqueCandidates.filter((attribute) => {
    if (!declaredRequiredAttributes.has(attribute)) {
      return false
    }

    const value = intent.attributes[attribute]
    return value === undefined || value === null || value === ''
  })
}

function missingAttributeDetail(attributes: string[]): string {
  const formattedAttributes = attributes.map((attribute) => {
    return ATTRIBUTE_LABELS[attribute] ?? attribute
  })

  return `Para cotizarlo, pasame: ${joinSpanishList(formattedAttributes)}.`
}

function priceExplanation(grossTotal: number, parts: PricedPart[], config: PriceForConfig): string {
  const derivation = parts
    .map((part) => {
      const prefix = part.operation === 'subtract' ? 'menos' : part.operation === 'add' ? 'más' : 'base'
      return `${prefix} ${formatPesos(part.amount)} por ${part.label}`
    })
    .join('; ')
  const vatPercent = Math.round(config.vatRate * 100)

  return `Te cotizo ${formatPesos(grossTotal)} final con IVA incluido. Sale de: ${derivation}; IVA ${vatPercent}% y redondeo al peso al final. La cotización es válida por ${config.quoteValidityDays} días.`
}

function modulePriceExplanation(input: {
  grossTotal: number
  saleRow: PriceForCatalogRow
  widthCm: number
  heightCm: number
  moduleWidthCm: number
  moduleHeightCm: number
  pieceArea: number
  moduleArea: number
  moduleCount: number
  moduleSubtotal: number
  discountedNetTotal: number
  appliedDiscounts: ModuleDiscount[]
  config: PriceForConfig
}): string {
  const vatPercent = Math.round(input.config.vatRate * 100)
  const quotient = input.pieceArea / input.moduleArea
  const discountText =
    input.appliedDiscounts.length === 0
      ? 'sin descuento por módulos'
      : `descuento por módulos ${input.appliedDiscounts.map((discount) => formatPercent(discount.rate)).join(' compuesto con ')}`

  return `Te cotizo ${formatPesos(input.grossTotal)} final con IVA incluido. Sale de: ${formatDecimal(input.widthCm)} x ${formatDecimal(input.heightCm)} cm = ${formatDecimal(input.pieceArea)} cm²; módulo ${formatDecimal(input.moduleWidthCm)} x ${formatDecimal(input.moduleHeightCm)} cm = ${formatDecimal(input.moduleArea)} cm²; ${formatDecimal(input.pieceArea)} / ${formatDecimal(input.moduleArea)} = ${formatDecimal(quotient)}, redondeado hacia arriba son ${input.moduleCount} ${pluralizeModule(input.moduleCount)}; ${formatPesos(input.saleRow.price)} por módulo según ${input.saleRow.label} x ${input.moduleCount} = ${formatPesos(input.moduleSubtotal)} neto; ${discountText}, queda ${formatPesos(input.discountedNetTotal)} neto; más IVA ${vatPercent}% y redondeo al peso al final. La cotización es válida por ${input.config.quoteValidityDays} días.`
}

function requestedExplicitAddOn(intent: Intent): string | null {
  const raw = intent.attributes.add_on ?? intent.attributes.addon ?? intent.attributes.addOn
  return typeof raw === 'string' && raw !== '' ? raw : null
}

function hasModuleSizeRequest(intent: Intent): boolean {
  return [
    'width_cm',
    'height_cm',
    'width',
    'height',
    'size',
    'modules',
    'module_count',
  ].some((attribute) => intent.attributes[attribute] !== undefined)
}

function isVatQuestion(intent: Intent): boolean {
  return Object.values(intent.attributes).some((value) => {
    if (typeof value !== 'string') {
      return false
    }

    const normalized = normalizeToken(value)
    return normalized.includes('iva') || normalized.includes('vat')
  })
}

function isCommercialDiscountQuestion(intent: Intent): boolean {
  return Object.entries(intent.attributes).some(([key, value]) => {
    if (typeof value !== 'string') {
      return false
    }

    const normalizedKey = normalizeToken(key)
    const normalizedValue = normalizeToken(value)
    return (
      normalizedKey.includes('commercial_discount') ||
      normalizedValue.includes('commercial_discount') ||
      normalizedValue.includes('descuento_comercial') ||
      (normalizedValue.includes('precio') && normalizedValue.includes('varias'))
    )
  })
}

function normalizeToken(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
}

function formatPesos(amount: number): string {
  return `$${Math.round(amount)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`
}

function formatDecimal(amount: number): string {
  return Number.isInteger(amount) ? amount.toString() : amount.toFixed(2).replace(/\.?0+$/, '')
}

function formatPercent(rate: number): string {
  return `${formatDecimal(rate * 100)}%`
}

function pluralizeModule(moduleCount: number): string {
  return moduleCount === 1 ? 'módulo' : 'módulos'
}

function joinSpanishList(items: string[]): string {
  if (items.length === 1) {
    return items[0]
  }

  return `${items.slice(0, -1).join(', ')} y ${items.at(-1)}`
}
