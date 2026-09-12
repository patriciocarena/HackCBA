import { describe, expect, test } from 'bun:test'
import { adminAllowlist } from '../../src/security/allowlist'

const ignore = () => {}

describe('adminAllowlist', () => {
  test('denies everyone when the variable is unset', () => {
    const isAdmin = adminAllowlist({ ids: undefined, recordDenial: ignore })

    expect(isAdmin('123')).toBe(false)
  })
})
