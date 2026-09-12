import { Mastra } from '@mastra/core/mastra'
import { LibSQLStore } from '@mastra/libsql'
import { PinoLogger } from '@mastra/loggers'
import { healthDbRoute } from '../health/route'
import { telegramWebhookRoute } from '../telegram/route'
import { dbUrl } from '../storage/sqlite'

export const mastra = new Mastra({
  storage: new LibSQLStore({ id: 'dante-storage', url: dbUrl() }),
  server: {
    apiRoutes: [healthDbRoute(), telegramWebhookRoute()],
  },
  logger: new PinoLogger({ name: 'Dante', level: 'info' }),
})
