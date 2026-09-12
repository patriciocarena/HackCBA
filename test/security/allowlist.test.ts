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
})
