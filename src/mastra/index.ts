import { Mastra } from '@mastra/core/mastra'
import { LibSQLStore } from '@mastra/libsql'
import { PinoLogger } from '@mastra/loggers'
import { catalogRows } from '../catalog/business-cards'
import { liveCatalog } from '../catalog/live-catalog'
import { healthDbRoute } from '../health/route'
import { migrateAtBoot } from '../storage/migrate'
import { inMemoryPriceVersions } from '../storage/price-versions'
import { dbUrl } from '../storage/sqlite'
import { telegramWebhookRoute } from '../telegram/route'
import { inMemoryPriceEdits } from '../voice/price-edit-proposal'

// Before anything is served. A route that answers a customer against a database with no tables
// is worse than a boot that failed, and /health/db now reports the difference either way.
await migrateAtBoot()

// The one catalog the process quotes from. Everything that reads prices reads it through
// `rows()`, and the owner's confirmed edit is the only thing that swaps it.
const catalog = liveCatalog(catalogRows)
const edits = inMemoryPriceEdits()
const versions = inMemoryPriceVersions()

export const mastra = new Mastra({
  storage: new LibSQLStore({ id: 'dante-storage', url: dbUrl() }),
  server: {
    apiRoutes: [
      healthDbRoute(),
      telegramWebhookRoute({}, { catalog, edits, record: versions.record }),
    ],
  },
  logger: new PinoLogger({ name: 'Dante', level: 'info' }),
})
