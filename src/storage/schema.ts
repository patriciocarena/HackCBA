import { ITEM_TIERS } from '@/catalog/tiers'
import { ORDER_STATES, PRICE_EDIT_SOURCES, PRICE_EDIT_STATES, UNITS } from '@/domain/types'
import { sqliteCheck } from './check'

const jsonObject = (column: string) => `CHECK (json_type(${column}) = 'object')`
const jsonArray = (column: string) => `CHECK (json_type(${column}) = 'array')`
const flag = (column: string) => `CHECK (${column} IN (0, 1))`
const together = (one: string, other: string) => `CHECK ((${one} IS NULL) = (${other} IS NULL))`

export const SCHEMA: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS families (
    slug TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    unit TEXT NOT NULL ${sqliteCheck('unit', UNITS)},
    vat_rate REAL NOT NULL,
    vat_included INTEGER NOT NULL ${flag('vat_included')},
    quote_validity_days INTEGER,
    module_width_cm REAL,
    module_height_cm REAL,
    attributes TEXT NOT NULL ${jsonArray('attributes')},
    module_discounts TEXT NOT NULL DEFAULT '[]' ${jsonArray('module_discounts')},
    ${together('module_width_cm', 'module_height_cm')}
  )`,

  `CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    family_slug TEXT NOT NULL REFERENCES families (slug) ON DELETE CASCADE,
    tier TEXT NOT NULL ${sqliteCheck('tier', ITEM_TIERS)},
    label TEXT NOT NULL,
    unit TEXT ${sqliteCheck('unit', UNITS)},
    attributes TEXT NOT NULL DEFAULT '{}' ${jsonObject('attributes')},
    attributes_key TEXT GENERATED ALWAYS AS (json(attributes)) VIRTUAL,
    applies_to_family INTEGER NOT NULL DEFAULT 0 ${flag('applies_to_family')},
    extra_business_days INTEGER NOT NULL DEFAULT 0,
    note TEXT,
    source_note TEXT
  )`,

  `CREATE UNIQUE INDEX IF NOT EXISTS items_identity
    ON items (family_slug, tier, attributes_key) WHERE tier = 'sale'`,

  `CREATE TABLE IF NOT EXISTS item_applications (
    item_id INTEGER NOT NULL REFERENCES items (id) ON DELETE CASCADE,
    applies_to_id INTEGER NOT NULL REFERENCES items (id) ON DELETE CASCADE,
    PRIMARY KEY (item_id, applies_to_id)
  ) WITHOUT ROWID`,

  `CREATE TABLE IF NOT EXISTS price_versions (
    id INTEGER PRIMARY KEY,
    item_id INTEGER NOT NULL REFERENCES items (id) ON DELETE CASCADE,
    price INTEGER NOT NULL CHECK (price >= 0),
    price_edit_id TEXT REFERENCES price_edits (id),
    recorded_at TEXT NOT NULL
  )`,

  `CREATE INDEX IF NOT EXISTS price_versions_by_item ON price_versions (item_id, id)`,

  'DROP VIEW IF EXISTS catalog_items',

  `CREATE VIEW catalog_items AS
    SELECT item.*, version.price, version.id AS price_version_id
    FROM items AS item
    JOIN price_versions AS version
      ON version.id = (SELECT max(id) FROM price_versions WHERE item_id = item.id)`,

  `CREATE TABLE IF NOT EXISTS facts (
    key TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    value TEXT,
    confirmed_on TEXT
  ) WITHOUT ROWID`,

  `CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    quote_id TEXT NOT NULL,
    conversation_id TEXT NOT NULL,
    breakdown TEXT NOT NULL ${jsonObject('breakdown')},
    state TEXT NOT NULL ${sqliteCheck('state', ORDER_STATES)},
    quoted_at TEXT NOT NULL,
    valid_until TEXT NOT NULL,
    deposit_alias TEXT,
    deposit_confirmed_by TEXT,
    deposit_confirmed_at TEXT,
    ${together('deposit_confirmed_by', 'deposit_confirmed_at')}
  )`,

  `CREATE TABLE IF NOT EXISTS price_edits (
    id TEXT PRIMARY KEY,
    operation TEXT NOT NULL ${jsonObject('operation')},
    state TEXT NOT NULL ${sqliteCheck('state', PRICE_EDIT_STATES)},
    source TEXT NOT NULL ${sqliteCheck('source', PRICE_EDIT_SOURCES)},
    media_id TEXT,
    proposed_by TEXT NOT NULL,
    proposed_at TEXT NOT NULL,
    resolved_by TEXT,
    resolved_at TEXT,
    ${together('resolved_by', 'resolved_at')},
    CHECK (state = 'proposed' OR resolved_at IS NOT NULL)
  )`,

  `CREATE TABLE IF NOT EXISTS price_edit_lines (
    price_edit_id TEXT NOT NULL REFERENCES price_edits (id) ON DELETE CASCADE,
    item_id INTEGER NOT NULL REFERENCES items (id) ON DELETE CASCADE,
    old_price INTEGER NOT NULL CHECK (old_price >= 0),
    new_price INTEGER NOT NULL CHECK (new_price >= 0),
    PRIMARY KEY (price_edit_id, item_id)
  ) WITHOUT ROWID`,
]
