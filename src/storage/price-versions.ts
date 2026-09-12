import type { Client } from '@libsql/client'

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
