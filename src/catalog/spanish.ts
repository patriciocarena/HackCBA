import type { AttributeBag } from './attributes'

/**
 * The owner's words for the values the list stores as slugs. A work order is read by a person
 * who is about to cut paper, so `front_color_back_grayscale` is not an answer.
 *
 * A value with no entry falls back to its own slug rather than being dropped. A work order
 * missing an attribute is a job printed wrong; one carrying an ugly slug is a job printed
 * right by someone who had to think for a second.
 */
export const SPANISH_VALUES: Record<string, string> = {
  illustration_300: 'ilustración 300',
  illustration_350: 'ilustración 350',
  special: 'papel especial',
  front: 'sólo frente',
  front_and_back: 'frente y dorso',
  front_color_back_grayscale: 'frente color dorso gris',
  none: 'sin terminación',
  uv_front: 'UV al frente',
  opp_both_sides: 'OPP ambas caras',
  opp_both_sides_uv_one_side: 'OPP ambas caras, UV una cara',
  opp_both_sides_uv_both_sides: 'OPP ambas caras, UV ambas caras',
  semi_pleno: 'semi pleno',
  pleno: 'pleno',
  half_legal: '1/2 oficio',
  a4: 'A4',
  bw: 'blanco y negro',
  color: 'color',
}

export const SPANISH_NAMES: Record<string, string> = {
  // Not an attribute any family declares: it is what the turn asks for when the message names
  // no product and the conversation has not named one either. Phrased as the question the
  // counter asks, because "producto" on its own reads as a form field.
  family: 'qué querés imprimir',
  quantity: 'cantidad',
  paper: 'papel',
  sides: 'caras',
  finish: 'terminación',
  coverage: 'cobertura de tinta',
  format: 'formato',
  ink: 'tinta',
}

export function spanishValue(value: string | number): string {
  return typeof value === 'number' ? String(value) : (SPANISH_VALUES[value] ?? value)
}

export function spanishName(name: string): string {
  return SPANISH_NAMES[name] ?? name
}

/**
 * Every attribute the row was priced on, in the family's own order so two work orders for the
 * same family read the same way. `quantity` leads because it is the first thing he counts.
 */
export function spanishAttributes(attributes: AttributeBag, order: string[]): string[] {
  const named = order.filter((name) => attributes[name] !== undefined)
  const rest = Object.keys(attributes).filter((name) => !order.includes(name))

  return [...named, ...rest].map((name) => spanishValue(attributes[name] as string | number))
}
