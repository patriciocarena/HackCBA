import { totalOf } from './breakdown'
import type { PriceBreakdown } from './types'

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
 */
export function askText(missing: string[]): string {
  return `Para cotizarlo, pasame: ${list(missing.map(attributeLabel))}.`
}

const ATTRIBUTE_LABELS: Record<string, string> = {
  quantity: 'cantidad',
  paper: 'papel',
  sides: 'caras',
  finish: 'terminación',
}

function attributeLabel(name: string): string {
  return ATTRIBUTE_LABELS[name] ?? name
}

function moduleSentence(breakdown: PriceBreakdown): string {
  if (breakdown.moduleFactor === 1) {
    return ''
  }

  const modules = `La medida entra en ${breakdown.moduleFactor} módulos`
  if (breakdown.moduleDiscountRates.length === 0) {
    return `${modules}.`
  }

  const rates = breakdown.moduleDiscountRates.map(percent).join(' compuesto con ')
  return `${modules} y por eso lleva ${rates} de descuento.`
}

function addOnSentence(breakdown: PriceBreakdown): string {
  if (breakdown.addOns.length === 0) {
    return ''
  }

  return `Incluye ${list(breakdown.addOns.map((line) => customerLabel(line.label)))}.`
}

/**
 * The list labels a row for the owner, who needs to know which of three Puntas redondeadas
 * rows he is reading. The customer needs the name of the thing. Everything after the first
 * comma is the part that tells them apart, and the breakdown keeps it.
 */
function customerLabel(label: string): string {
  return label.split(',')[0]
}

function pesos(amount: number): string {
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
