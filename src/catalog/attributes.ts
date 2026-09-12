export type AttributeBag = Record<string, string | number>

export function canonicalAttributes(bag: AttributeBag): string {
  return JSON.stringify(bag, Object.keys(bag).sort())
}
