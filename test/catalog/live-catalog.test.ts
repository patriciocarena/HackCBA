import { describe, expect, test } from 'bun:test'
import { liveCatalog } from '@/catalog/live-catalog'
import { catalogRows } from '@/catalog/business-cards'
import { ars } from '@/domain/money'
import type { CatalogRow } from '@/domain/price-for'

function repriced(rows: CatalogRow[], slug: string, price: number): CatalogRow[] {
  return rows.map((row) => (row.slug === slug ? { ...row, price: ars(price) } : row))
}

describe('the catalog is read through a getter', () => {
  test('a reader that asks after a swap is given the rows the swap installed', () => {
    const catalog = liveCatalog(catalogRows)
    const slug = catalogRows[0]?.slug as string
    const next = repriced(catalogRows, slug, 99999)

    catalog.swap(next)

    expect(catalog.rows().find((row) => row.slug === slug)?.price).toBe(ars(99999))
  })

  test('the array handed in is never written to, so nobody else sees an edit through it', () => {
    const catalog = liveCatalog(catalogRows)
    const slug = catalogRows[0]?.slug as string
    const before = catalogRows.find((row) => row.slug === slug)?.price

    catalog.swap(repriced(catalogRows, slug, 99999))

    expect(catalogRows.find((row) => row.slug === slug)?.price).toBe(before)
  })

  test('a getter cannot be captured, so there is no old reference to go stale', () => {
    const catalog = liveCatalog(catalogRows)
    const read = catalog.rows

    catalog.swap(repriced(catalogRows, catalogRows[0]?.slug as string, 99999))

    expect(read()).toBe(catalog.rows())
  })
})
