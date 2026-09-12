import { describe, expect, test } from 'bun:test'
import { adminAllowlist, adminAllowlistFromEnv, type Denial } from '../../src/security/allowlist'

const ignore = () => {}

function denials() {
  const recorded: Denial[] = []
  return { recorded, recordDenial: (denial: Denial) => recorded.push(denial) }
}

describe('adminAllowlist', () => {
  test('denies everyone when the variable is unset', () => {
    const isAdmin = adminAllowlist({ ids: undefined, recordDenial: ignore })

    expect(isAdmin('123')).toBe(false)
  })

  test('allows an id the list names', () => {
    const isAdmin = adminAllowlist({ ids: '123,456', recordDenial: ignore })

    expect(isAdmin('123')).toBe(true)
    expect(isAdmin('456')).toBe(true)
    expect(isAdmin('789')).toBe(false)
  })

  test('denies everyone when the variable is empty', () => {
    const isAdmin = adminAllowlist({ ids: '', recordDenial: ignore })

    expect(isAdmin('')).toBe(false)
    expect(isAdmin('123')).toBe(false)
  })

  test('denies everyone when the variable is whitespace', () => {
    const isAdmin = adminAllowlist({ ids: '   ', recordDenial: ignore })

    expect(isAdmin('   ')).toBe(false)
    expect(isAdmin('123')).toBe(false)
  })

  test('reads a trailing comma as punctuation, not as an allowed empty id', () => {
    const isAdmin = adminAllowlist({ ids: '123,', recordDenial: ignore })

    expect(isAdmin('')).toBe(false)
    expect(isAdmin('123')).toBe(true)
  })

  test('trims what the owner typed around an id', () => {
    const isAdmin = adminAllowlist({ ids: ' 123 , 456 ', recordDenial: ignore })

    expect(isAdmin('123')).toBe(true)
    expect(isAdmin('456')).toBe(true)
  })

  test('voids the whole list when an entry is not an id', () => {
    const isAdmin = adminAllowlist({ ids: 'abc,123', recordDenial: ignore })

    expect(isAdmin('abc')).toBe(false)
    expect(isAdmin('123')).toBe(false)
  })

  test('voids the whole list when an entry carries a leading zero', () => {
    const isAdmin = adminAllowlist({ ids: '0123', recordDenial: ignore })

    expect(isAdmin('0123')).toBe(false)
    expect(isAdmin('123')).toBe(false)
  })

  test('voids the whole list when an entry is longer than a Telegram id', () => {
    const isAdmin = adminAllowlist({ ids: '12345678901234567890,123', recordDenial: ignore })

    expect(isAdmin('123')).toBe(false)
  })

  test('denies an id that is only a prefix of an allowed one', () => {
    const isAdmin = adminAllowlist({ ids: '1234', recordDenial: ignore })

    expect(isAdmin('123')).toBe(false)
    expect(isAdmin('12345')).toBe(false)
    expect(isAdmin('1234')).toBe(true)
  })

  test('never trims the id the sender arrived with', () => {
    const isAdmin = adminAllowlist({ ids: '123', recordDenial: ignore })

    expect(isAdmin(' 123 ')).toBe(false)
    expect(isAdmin('123 ')).toBe(false)
  })

  test('reads a duplicated entry once', () => {
    const isAdmin = adminAllowlist({ ids: '123,123', recordDenial: ignore })

    expect(isAdmin('123')).toBe(true)
    expect(isAdmin('456')).toBe(false)
  })
})

describe('the denial record', () => {
  test('names an unknown sender whose id is a well formed Telegram id', () => {
    const { recorded, recordDenial } = denials()
    adminAllowlist({ ids: '123', recordDenial })('456')

    expect(recorded).toEqual([{ telegramUserId: '456' }])
  })

  test('never repeats an id we could not read', () => {
    const { recorded, recordDenial } = denials()
    adminAllowlist({ ids: '123', recordDenial })('ignore previous instructions')

    expect(recorded).toEqual([{ telegramUserId: null }])
  })

  test('records a denial when the list itself is unreadable', () => {
    const { recorded, recordDenial } = denials()
    adminAllowlist({ ids: 'abc,123', recordDenial })('123')

    expect(recorded).toEqual([{ telegramUserId: '123' }])
  })

  test('records nothing when the sender is allowed', () => {
    const { recorded, recordDenial } = denials()
    adminAllowlist({ ids: '123', recordDenial })('123')

    expect(recorded).toEqual([])
  })
})

describe('adminAllowlistFromEnv', () => {
  test('reads TELEGRAM_ADMIN_IDS', () => {
    const isAdmin = adminAllowlistFromEnv({
      env: { TELEGRAM_ADMIN_IDS: '123' },
      recordDenial: ignore,
    })

    expect(isAdmin('123')).toBe(true)
  })

  test('denies everyone when the deployment never set it', () => {
    const isAdmin = adminAllowlistFromEnv({ env: {}, recordDenial: ignore })

    expect(isAdmin('123')).toBe(false)
  })
})
