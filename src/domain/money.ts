declare const arsBrand: unique symbol

export type Ars = number & { readonly [arsBrand]: true }

export function ars(amount: number): Ars {
  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new Error(`${amount} is not a whole number of pesos`)
  }

  return amount as Ars
}

export function addArs(...amounts: Ars[]): Ars {
  return ars(amounts.reduce((total, amount) => total + amount, 0))
}

export function subtractArs(amount: Ars, ...deductions: Ars[]): Ars {
  return ars(deductions.reduce((total, deduction) => total - deduction, amount as number))
}

export function scaleArs(amount: Ars, factor: number): Ars {
  return ars(Math.round(amount * factor))
}
