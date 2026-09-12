import { spanishName } from '../catalog/spanish'
import { totalOf } from './breakdown'
import type { BreakdownRate, PriceBreakdown } from './types'

/**
 * What a customer reads. The amount, what they are charged extra for, and how long it holds.
 *
 * The arithmetic never appears here. A breakdown is the audit trail and a human reading it
 * can catch the error, but a customer who is told the areas and the division is being asked
 * to check the shop's maths, which is not what they wrote in for.
 */
export function quoteText(breakdown: PriceBreakdown, validityDays: number): string {
  return [
    `Te cotizo ${pesos(totalOf(breakdown))} final con IVA incluido.`,
    moduleSentence(breakdown),
    addOnSentence(breakdown),
    `La cotización es válida por ${validityDays} días.`,
  ]
    .filter((sentence) => sentence !== '')
    .join(' ')
}

/**
 * What the customer is asked for when the family still needs something. One message, in the
 * order the family declares, in the words a print shop uses. `priceFor` returns the attribute
 * names, which are English and are ours; the customer never sees them.
 *
 * One map, shared with the work order. Two copies meant adding a family translated its
 * attributes for the owner's press and left the customer reading `format`.
 */
export function askText(missing: string[]): string {
  return `Para cotizarlo, pasame: ${list(missing.map(spanishName))}.`
}

function moduleSentence(breakdown: PriceBreakdown): string {
  if (breakdown.moduleFactor === 1) {
    return ''
  }

  const modules = `La medida entra en ${breakdown.moduleFactor} módulos`
  // Only the module discounts. The rate list holds every percentage now, and a surcharge is
  // named by the add-on sentence instead: a customer reads what is included, not a formula.
  const discounts = breakdown.rates.filter((rate) => rate.kind === 'module_discount')
  if (discounts.length === 0) {
    return `${modules}.`
  }

  const rates = discounts.map((rate) => percent(Math.abs(rate.rate))).join(' compuesto con ')
  return `${modules} y por eso lleva ${rates} de descuento.`
}

/**
 * What the customer asked to have done, whether the list charges it as an amount or as a
 * percentage. One sentence over both, because the difference between a laminado and a
 * triplicado is how the owner priced it and not what the customer is buying.
 *
 * The rate itself never appears. The breakdown keeps it for whoever audits the amount, and a
 * customer reads what the job includes rather than how it was worked out.
 */
function addOnSentence(breakdown: PriceBreakdown): string {
  const named = [
    ...breakdown.addOns.map((line) => line.label),
    ...breakdown.rates.filter(isNamedSurcharge).map((rate) => rate.label),
  ]

  if (named.length === 0) {
    return ''
  }

  return `Incluye ${list(named.map(customerLabel))}.`
}

/**
 * A surcharge the list stated on a row, which is the only kind of rate that has a name to say.
 * A module discount is arithmetic about the size and the module sentence already says it.
 */
function isNamedSurcharge(rate: BreakdownRate): rate is BreakdownRate & { label: string } {
  return rate.kind === 'surcharge' && rate.label !== undefined
}

/**
 * The list labels a row for the owner, who needs to know which of three Puntas redondeadas
 * rows he is reading. The customer needs the name of the thing. Everything after the first
 * comma is the part that tells them apart, and the breakdown keeps it.
 */
function customerLabel(label: string): string {
  return label.split(',')[0]
}

export function pesos(amount: number): string {
  return `$${amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`
}

function percent(rate: number): string {
  const value = rate * 100
  return `${(Number.isInteger(value) ? value.toString() : value.toFixed(2).replace(/\.?0+$/, '')).replace('.', ',')}%`
}

function list(items: string[]): string {
  if (items.length <= 1) {
    return items.join('')
  }

  return `${items.slice(0, -1).join(', ')} y ${items.at(-1)}`
}
