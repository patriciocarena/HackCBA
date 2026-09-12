import type { CatalogRow } from '../domain/price-for'

export type LiveCatalog = {
  rows: () => CatalogRow[]
  swap: (next: CatalogRow[]) => void
}

/**
 * The catalog behind a getter, so no reader can hold yesterday's prices.
 *
 * `applyPriceEdit` returns a new array rather than writing to the one it was given, which is
 * correct on its own. A reader that captured the old array is also correct on its own. The two
 * together are the defect: the owner is told the edit applied and the bot quotes the old price.
 * Handing out a getter instead of an array makes that unrepresentable rather than merely absent.
 */
export function liveCatalog(initial: CatalogRow[]): LiveCatalog {
  let rows = initial

  return {
    rows: () => rows,
    swap: (next) => {
      rows = next
    },
  }
}
