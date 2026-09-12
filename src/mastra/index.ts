import { randomUUID } from 'node:crypto'
import { Mastra } from '@mastra/core/mastra'
import { LibSQLStore } from '@mastra/libsql'
import { PinoLogger } from '@mastra/loggers'
import { catalogRows } from '../catalog/business-cards'
import { liveCatalog } from '../catalog/live-catalog'
import { healthDbRoute } from '../health/route'
import { adminAllowlistFromEnv } from '../security/allowlist'
import { inMemoryPriceVersions } from '../storage/price-versions'
import { dbUrl } from '../storage/sqlite'
import { confirmCallback } from '../telegram/confirm-callback'
import { telegramWebhookRoute } from '../telegram/route'
import { inMemoryPriceEdits } from '../voice/price-edit-proposal'

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
      telegramWebhookRoute({
        onCallback: confirmCallback({
          load: edits.load,
          save: edits.save,
          catalog,
          record: versions.record,
          isAdmin: adminAllowlistFromEnv(),
          versionId: () => randomUUID(),
          now: () => new Date().toISOString(),
        }),
      }),
    ],
  },
  logger: new PinoLogger({ name: 'Dante', level: 'info' }),
})
