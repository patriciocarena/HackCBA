import { afterEach, describe, expect, it } from 'bun:test'
import { dbUrl } from '@/storage/sqlite'

const original = process.env.DATA_DIR

afterEach(() => {
  if (original === undefined) delete process.env.DATA_DIR
  else process.env.DATA_DIR = original
})

describe('dbUrl', () => {
  it('puts the database in DATA_DIR', () => {
    process.env.DATA_DIR = '/data'

    expect(dbUrl()).toBe('file:/data/dante.db')
  })

  it('falls back to the working directory', () => {
    delete process.env.DATA_DIR

    expect(dbUrl()).toBe('file:./dante.db')
  })
})
