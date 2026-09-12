export type AttributeBag = Record<string, string | number>

export function canonicalAttributes(bag: AttributeBag): string {
  const sorted = Object.keys(bag)
    .sort()
    .map((key) => [key, bag[key]] as const)

  return JSON.stringify(Object.fromEntries(sorted))
}
