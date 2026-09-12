import { describe, expect, test } from 'bun:test'
import { sqliteCheck } from '../../src/storage/check'
import { ESCALATION_REASONS, ORDER_STATES, UNITS } from '../../src/domain/types'

describe('sqliteCheck', () => {
  test('builds the constraint from the domain array', () => {
    expect(sqliteCheck('unit', UNITS)).toBe(
      "CHECK (unit IN ('unit', 'linear_meter', 'square_meter', 'set'))",
    )
  })

  test('carries every order state, so adding one to the array reaches the column', () => {
    const constraint = sqliteCheck('state', ORDER_STATES)

    for (const state of ORDER_STATES) {
      expect(constraint).toContain(`'${state}'`)
    }
  })

  test('carries every escalation reason', () => {
    const constraint = sqliteCheck('reason', ESCALATION_REASONS)

    for (const reason of ESCALATION_REASONS) {
      expect(constraint).toContain(`'${reason}'`)
    }
  })

  test('escapes a quote in a value instead of ending the literal', () => {
    expect(sqliteCheck('kind', ["it's"])).toBe("CHECK (kind IN ('it''s'))")
  })

  test('refuses an empty set, which would deny every row', () => {
    expect(() => sqliteCheck('unit', [])).toThrow('unit has no allowed values')
  })

  test('refuses a column name that is not an identifier', () => {
    expect(() => sqliteCheck('unit); DROP TABLE items; --', UNITS)).toThrow(
      'unit); DROP TABLE items; -- is not a column name',
    )
  })
})
