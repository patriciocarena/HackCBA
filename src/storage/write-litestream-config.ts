import { litestreamConfig } from './litestream'

const path = process.env.LITESTREAM_CONFIG ?? '/etc/litestream.yml'

await Bun.write(
  path,
  litestreamConfig({
    DATA_DIR: process.env.DATA_DIR,
    LITESTREAM_REPLICA_URL: process.env.LITESTREAM_REPLICA_URL,
  }),
)
