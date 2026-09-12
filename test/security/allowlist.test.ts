import { describe, expect, test } from 'bun:test'
import { adminAllowlist } from '../../src/security/allowlist'

const ignore = () => {}

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
})
