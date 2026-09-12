import { createClient } from '@libsql/client'
import { Mastra } from '@mastra/core/mastra'
import { LibSQLStore } from '@mastra/libsql'
import { PinoLogger } from '@mastra/loggers'
import { catalogRows } from '../catalog/business-cards'
import { liveCatalog } from '../catalog/live-catalog'
import { healthDbRoute } from '../health/route'
import { sqliteInboundLog } from '../storage/inbound-log'
import { migrate } from '../storage/migrate'
import { inMemoryPriceVersions } from '../storage/price-versions'
import { dbUrl } from '../storage/sqlite'
import { telegramWebhookRoute } from '../telegram/route'
import { inMemoryPriceEdits } from '../voice/price-edit-proposal'

// The one catalog the process quotes from. Everything that reads prices reads it through
// `rows()`, and the owner's confirmed edit is the only thing that swaps it.
const catalog = liveCatalog(catalogRows)
const edits = inMemoryPriceEdits()
const versions = inMemoryPriceVersions()

// The one connection the app writes through, and the tables it needs, before it listens. A
// volume that cannot be opened has to kill the boot here rather than at the first customer,
// which is the same bargain `/health/db` already makes every thirty seconds.
//
// Only the inbound log is on it. Conversation state, sales, receipts and price edits are still
// in memory and still die on restart; each moves the day its store has a table.
const db = createClient({ url: dbUrl() })
await migrate(db)

export const mastra = new Mastra({
  storage: new LibSQLStore({ id: 'dante-storage', url: dbUrl() }),
  server: {
    apiRoutes: [
      healthDbRoute(),
      telegramWebhookRoute({ log: sqliteInboundLog(db) }, { catalog, edits, record: versions.record }),
    ],
  },
  logger: new PinoLogger({ name: 'Dante', level: 'info' }),
})
