import type { Client } from '@libsql/client'
import type { PriceVersion } from '../catalog/apply-edit'

export type Writer = Pick<Client, 'execute'>

export type PriceRecord = {
  itemId: number
  price: number
  recordedAt: string
  priceEditId?: string
}

export async function recordPrice(client: Writer, record: PriceRecord): Promise<void> {
  await client.execute({
    sql: `INSERT INTO price_versions (item_id, price, recorded_at, price_edit_id)
          SELECT :itemId, :price, :recordedAt, :priceEditId
          WHERE :price IS NOT (SELECT price FROM catalog_items WHERE id = :itemId)`,
    args: { ...record, priceEditId: record.priceEditId ?? null },
  })
}

export type RecordVersion = (version: PriceVersion) => Promise<void>

// ponytail: in memory, and `recordPrice` above is the upgrade path. A version that has to
// survive a restart is a row in price_versions, not an array in the process that applied it.
export function inMemoryPriceVersions(): { versions: PriceVersion[]; record: RecordVersion } {
  const versions: PriceVersion[] = []

  return { versions, record: async (version) => void versions.push(version) }
}
