import { createClient } from '@libsql/client'
import { describe, expect, it } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadCatalog } from '@/catalog/load'
import { litestreamConfig, replicaUrl } from '@/storage/litestream'
import { migrate } from '@/storage/migrate'
import { litestreamBin } from '@test/storage/litestream-binary'

describe('replicaUrl', () => {
  it('takes the bucket the environment names', () => {
    expect(replicaUrl({ LITESTREAM_REPLICA_URL: 's3://dante/backups' })).toBe('s3://dante/backups')
  })

  it('falls back to a file beside the database, so a deploy with no bucket still replicates', () => {
    expect(replicaUrl({ DATA_DIR: '/data' })).toBe('file:///data/replica')
  })

  it('resolves the directory, because file://./replica names the root of the disk', () => {
    expect(replicaUrl({ DATA_DIR: '.' })).toBe(`file://${process.cwd()}/replica`)
  })
})

describe('litestreamConfig', () => {
  it('points the database at the replica', () => {
    expect(litestreamConfig({ DATA_DIR: '/data' })).toBe(
      ['dbs:', '  - path: /data/dante.db', '    replicas:', '      - url: file:///data/replica', ''].join('\n'),
    )
  })
})

describe('a restore', () => {
  it('brings the rows back after the database is deleted', async () => {
    const litestream = await litestreamBin()
    const directory = await mkdtemp(join(tmpdir(), 'dante-litestream-'))
    const database = join(directory, 'dante.db')
    const config = join(directory, 'litestream.yml')

    await writeFile(config, litestreamConfig({ DATA_DIR: directory }))

    const before = createClient({ url: `file:${database}` })
    await migrate(before)
    await loadCatalog(before, await Bun.file('seed/business-cards.json').json(), '2026-09-12T08:00:00.000Z')
    before.close()

    await run(litestream, ['replicate', '-config', config, '-once'])
    await rm(database)
    await rm(`${database}-wal`, { force: true })
    await rm(`${database}-shm`, { force: true })
    await run(litestream, ['restore', '-config', config, database])

    const after = createClient({ url: `file:${database}` })
    const priced = await after.execute("SELECT price FROM catalog_items WHERE slug = 'bc_special_100_front'")
    after.close()
    await rm(directory, { recursive: true, force: true })

    expect(priced.rows[0]?.price).toBe(12100)
  }, 120000)
})

async function run(command: string, args: string[]): Promise<void> {
  const child = Bun.spawn([command, ...args], { stdout: 'ignore', stderr: 'pipe' })
  const reported = await new Response(child.stderr).text()
  const code = await child.exited

  if (code !== 0) throw new Error(`${command} ${args.join(' ')} exited ${code}: ${reported}`)
}
