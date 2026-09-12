import { describe, expect, it } from 'bun:test'
import { createClient } from '@libsql/client'
import { dbHealth } from '@/health/route'
import { migrate, migrateAtBoot } from '@/storage/migrate'
import { schemaTables } from '@/storage/schema'

const AT = '2026-09-12T09:00:00.000Z'

describe('what /health/db knows', () => {
  it('names every table the schema declares, so the list cannot drift from the DDL', () => {
    const tables = schemaTables()

    expect(tables).toContain('telegram_updates')
    expect(tables).toContain('inbound_messages')
    expect(tables).toContain('items')
    expect(tables).toContain('price_edits')
    // A view is not a table. catalog_items is created as a view and dropped on every migrate.
    expect(tables).not.toContain('catalog_items')
  })

  it('is unhealthy on a database the migration never touched', async () => {
    const client = createClient({ url: 'file::memory:' })

    const health = await dbHealth(client, 'boot-1', AT)

    expect(health.ok).toBe(false)
    expect(health.missingTables).toEqual(schemaTables())
  })

  it('is healthy once migrate has run, and still beats', async () => {
    const client = createClient({ url: 'file::memory:' })
    await migrate(client)

    const health = await dbHealth(client, 'boot-1', AT)

    expect(health.ok).toBe(true)
    expect(health.missingTables).toEqual([])
    expect(health.beats).toBe(1)
    expect(health.bootId).toBe('boot-1')
  })

  it('names the one table that went missing, not just that something did', async () => {
    const client = createClient({ url: 'file::memory:' })
    await migrate(client)
    await client.execute('DROP TABLE telegram_updates')

    const health = await dbHealth(client, 'boot-1', AT)

    expect(health.ok).toBe(false)
    expect(health.missingTables).toEqual(['telegram_updates'])
  })
})

describe('boot', () => {
  it('leaves a database the process can serve from, which nothing did before', async () => {
    const url = `file:${process.env.TMPDIR ?? '/tmp'}/dante-boot-${crypto.randomUUID()}.db`

    await migrateAtBoot(url)

    const client = createClient({ url })
    const health = await dbHealth(client, 'boot-1', AT)
    client.close()

    expect(health.ok).toBe(true)
    expect(health.missingTables).toEqual([])
  })

  it('runs twice without complaint, because every boot runs it', async () => {
    const url = `file:${process.env.TMPDIR ?? '/tmp'}/dante-boot-${crypto.randomUUID()}.db`

    await migrateAtBoot(url)
    await migrateAtBoot(url)

    const client = createClient({ url })
    const health = await dbHealth(client, 'boot-2', AT)
    client.close()

    expect(health.ok).toBe(true)
  })
})
