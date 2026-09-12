import type { Client } from '@libsql/client'
import { z } from 'zod'
import { unitSchema, type AttributeContract } from '@/domain/types'
import { canonicalAttributes, type AttributeBag } from './attributes'
import { ITEM_TIERS } from './tiers'

const attributeValueSchema = z.union([z.string(), z.number()])

const seedItemSchema = z.object({
  id: z.string(),
  kind: z.enum(ITEM_TIERS),
  label: z.string(),
  unit: unitSchema.optional(),
  attributes: z.record(z.string(), attributeValueSchema).default({}),
  applies_to: z.array(z.string()).default([]),
  applies_to_family: z.boolean().default(false),
  price: z.number().int().nonnegative(),
  extra_business_days: z.number().int().default(0),
  note: z.string().optional(),
  source_note: z.string().optional(),
})

const seedSchema = z.object({
  vat_rate: z.number(),
  vat_included: z.boolean(),
  quote_validity_days: z.number().int().optional(),
  family: z.object({
    slug: z.string(),
    label: z.string(),
    unit: unitSchema,
    module: z.object({ width_cm: z.number(), height_cm: z.number() }).nullish(),
    attributes: z.array(z.string()),
  }),
  items: z.array(seedItemSchema),
  module_discounts: z
    .array(
      z.object({
        from_modules: z.number().int(),
        to_modules: z.number().int().nullable(),
        rate: z.number(),
      }),
    )
    .default([]),
})

type Seed = z.infer<typeof seedSchema>
type SeedItem = z.infer<typeof seedItemSchema>

export async function loadCatalog(client: Client, file: unknown, recordedAt: string): Promise<void> {
  const seed = seedSchema.parse(file)

  await writeFamily(client, seed)

  for (const item of seed.items) {
    await writeItem(client, seed.family.slug, item)
  }

  const ids = await itemIds(client, seed.family.slug)

  for (const item of seed.items) {
    await writeApplications(client, ids, item)
    await writePrice(client, ids[item.id] as number, item.price, recordedAt)
  }
}

async function writeFamily(client: Client, seed: Seed): Promise<void> {
  await client.execute({
    sql: `INSERT INTO families
      (slug, label, unit, vat_rate, vat_included, quote_validity_days,
       module_width_cm, module_height_cm, attributes, module_discounts)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (slug) DO UPDATE SET
        label = excluded.label,
        unit = excluded.unit,
        vat_rate = excluded.vat_rate,
        vat_included = excluded.vat_included,
        quote_validity_days = excluded.quote_validity_days,
        module_width_cm = excluded.module_width_cm,
        module_height_cm = excluded.module_height_cm,
        attributes = excluded.attributes,
        module_discounts = excluded.module_discounts`,
    args: [
      seed.family.slug,
      seed.family.label,
      seed.family.unit,
      seed.vat_rate,
      seed.vat_included ? 1 : 0,
      seed.quote_validity_days ?? null,
      seed.family.module?.width_cm ?? null,
      seed.family.module?.height_cm ?? null,
      JSON.stringify(attributeContracts(seed)),
      JSON.stringify(moduleDiscounts(seed)),
    ],
  })
}

async function writeItem(client: Client, familySlug: string, item: SeedItem): Promise<void> {
  await client.execute({
    sql: `INSERT INTO items
      (slug, family_slug, tier, label, unit, attributes, applies_to_family,
       extra_business_days, note, source_note)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (slug) DO UPDATE SET
        family_slug = excluded.family_slug,
        tier = excluded.tier,
        label = excluded.label,
        unit = excluded.unit,
        attributes = excluded.attributes,
        applies_to_family = excluded.applies_to_family,
        extra_business_days = excluded.extra_business_days,
        note = excluded.note,
        source_note = excluded.source_note`,
    args: [
      item.id,
      familySlug,
      item.kind,
      item.label,
      item.unit ?? null,
      canonicalAttributes(item.attributes),
      item.applies_to_family ? 1 : 0,
      item.extra_business_days,
      item.note ?? null,
      item.source_note ?? null,
    ],
  })
}

async function writeApplications(
  client: Client,
  ids: Record<string, number>,
  item: SeedItem,
): Promise<void> {
  await client.execute({
    sql: 'DELETE FROM item_applications WHERE item_id = ?',
    args: [ids[item.id] as number],
  })

  for (const slug of item.applies_to) {
    await client.execute({
      sql: 'INSERT INTO item_applications (item_id, applies_to_id) VALUES (?, ?)',
      args: [ids[item.id] as number, ids[slug] as number],
    })
  }
}

async function writePrice(
  client: Client,
  itemId: number,
  price: number,
  recordedAt: string,
): Promise<void> {
  await client.execute({
    sql: `INSERT INTO price_versions (item_id, price, recorded_at)
          SELECT ?, ?, ?
          WHERE ? IS NOT (SELECT price FROM catalog_items WHERE id = ?)`,
    args: [itemId, price, recordedAt, price, itemId],
  })
}

async function itemIds(client: Client, familySlug: string): Promise<Record<string, number>> {
  const rows = await client.execute({
    sql: 'SELECT id, slug FROM items WHERE family_slug = ?',
    args: [familySlug],
  })

  return Object.fromEntries(rows.rows.map((row) => [String(row.slug), Number(row.id)]))
}

function attributeContracts(seed: Seed): AttributeContract[] {
  const bags = seed.items.filter((item) => item.kind === 'sale').map((item) => item.attributes)

  return seed.family.attributes.map((name) => contractFor(name, bags))
}

function contractFor(name: string, bags: AttributeBag[]): AttributeContract {
  const values = [...new Set(bags.map((bag) => bag[name]).filter((value) => value !== undefined))]

  if (values.every((value) => typeof value === 'number')) {
    return { name, kind: 'number', values: values.sort((one, other) => one - other) }
  }

  return { name, kind: 'enum', values: values.map(String).sort() }
}

function moduleDiscounts(seed: Seed) {
  return seed.module_discounts.map((discount) => ({
    fromModules: discount.from_modules,
    toModules: discount.to_modules,
    rate: discount.rate,
  }))
}
