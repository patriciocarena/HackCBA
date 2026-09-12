/**
 * What the price list says, and whether the seed still agrees with it.
 *
 *   bun run parse:list            every family, with its tables and row counts
 *   bun run parse:list tarjetas   one family, row by row, audited against the seed
 *
 * `seed/lista-precios.html` is the catalog's source of truth and it is already structured, so
 * reading it is deterministic. This never writes a seed. It reads labels, prices, kinds and
 * units, and it checks the amounts a person typed into each loaded seed against the amounts
 * the list actually states. A human still writes the attribute bag, because turning
 * "100 tarjetas color sólo frente" into `{ quantity: 100, sides: 'front' }` is a reading of
 * Spanish and not a parse, and a regex doing it would be the guessing this product forbids.
 *
 * It exits non-zero on a disagreement, so it is a check and not a report. Nothing at runtime
 * imports it.
 */
import businessCardsSeed from '../seed/business-cards.json'
import facturasSeed from '../seed/facturas.json'
import folletosLaserSeed from '../seed/folletos-laser.json'
import { auditAgainstList, type SeedItem } from '../src/catalog/price-audit'
import { parsePriceList, type PriceListFamily, type PriceCell } from '../src/catalog/price-list'

const LIST = 'seed/lista-precios.html'

/**
 * The seed each family in the list is loaded from, keyed by the list's own label.
 *
 * By label rather than by slug, because the label is what the list states and the slug is what
 * a person chose. A family the shop has not loaded is absent here and is only printed, which
 * is thirty five of the thirty eight.
 */
const SEEDS: Record<string, { items: unknown[] }> = {
  'Tarjetas personales': businessCardsSeed,
  'Folletos full color, láser': folletosLaserSeed,
  Facturas: facturasSeed,
}

const list = parsePriceList(await Bun.file(LIST).text())
const wanted = process.argv[2]?.toLowerCase()

console.log(`${LIST}: ${list.families.length} families, prices are ${list.vatIncluded ? 'final' : 'net'}\n`)

if (wanted === undefined) {
  for (const family of list.families) console.log(summary(family))
  console.log('\nPass a family name to see its rows and audit the seed against them.')
  process.exit(0)
}

const family = list.families.find((one) => one.label.toLowerCase().includes(wanted))

if (family === undefined) {
  console.log(`no family matches "${wanted}". They are:\n${list.families.map((one) => `  ${one.label}`).join('\n')}`)
  process.exit(1)
}

console.log(`${family.label}\n`)

for (const table of family.tables) {
  console.log(`  ${table.heading === '' ? '(no subheading)' : table.heading}`)
  if (table.columns.length > 0) console.log(`    columns: ${table.columns.join(' | ')}`)

  for (const row of table.rows) {
    const unit = row.unit === undefined ? '' : ` [${row.unit}]`
    console.log(`    ${row.kind.padEnd(8)} ${row.label}${unit}: ${row.prices.map(cell).join(' | ')}`)
  }

  console.log('')
}

// A family nobody loaded has no seed to disagree with, which is most of the list.
const seed = SEEDS[family.label]
if (seed === undefined) process.exit(0)

const audit = auditAgainstList(seed.items as SeedItem[], family)

console.log(`audit: ${seed.items.length} seed items against ${family.label}\n`)

for (const item of audit.wrong) {
  const carried = 'rate' in item ? percent(item.rate) : pesos(item.price)
  console.log(`  WRONG      ${item.id} carries ${carried}, which the list never states`)
}

for (const claim of audit.unclaimed) {
  const stated = typeof claim === 'number' ? pesos(claim) : percent(claim.rate)
  console.log(`  UNCLAIMED  the list states ${stated} and no seed item carries it`)
}

if (audit.wrong.length === 0 && audit.unclaimed.length === 0) {
  console.log('  every amount in the seed is an amount in the list, and every amount in the list is loaded')
  process.exit(0)
}

console.log(`\n${audit.wrong.length} wrong, ${audit.unclaimed.length} unclaimed`)
process.exit(1)

function summary(family: PriceListFamily): string {
  const rows = family.tables.flatMap((table) => table.rows)
  const kinds = (['sale', 'add_on', 'discount'] as const)
    .map((kind) => `${rows.filter((row) => row.kind === kind).length} ${kind}`)
    .join(', ')

  return `  ${family.label.padEnd(32)} ${family.tables.length} tables, ${rows.length} rows (${kinds})`
}

function cell(price: PriceCell): string {
  if (price === null) return 'not offered'
  if (price === 'on_request') return 'a consultar'
  // ADR 0022. This used to print `40%` as `$40`, which is how eighteen rates in the list read
  // as amounts for a day without anybody seeing it.
  if (typeof price === 'object') return percent(price.rate)

  return pesos(price)
}

function percent(rate: number): string {
  return `${rate > 0 ? '+' : ''}${(rate * 100).toLocaleString('es-AR')}%`
}

function pesos(amount: number): string {
  return `$${amount.toLocaleString('es-AR')}`
}
