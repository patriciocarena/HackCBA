import { describe, expect, test } from 'bun:test'
import { DELEGATE, OUT_OF_CATALOG } from '../../src/domain/handoff'

/**
 * What a customer reads when the engine is not certain. ADR 0021: the shop answers, and Dante
 * does not narrate that a bot stopped and a person started. The sentence still has to promise
 * an answer, because ADR 0011 makes it the last thing Dante ever says in that conversation.
 *
 * One module for both, because the same two sentences were copied into four files and a
 * rewording was a four file change.
 */
describe('the handoff sentences', () => {
  test('neither hands the customer to a person in words', () => {
    for (const sentence of [DELEGATE, OUT_OF_CATALOG]) {
      expect(sentence).not.toMatch(/humano|persona|delego|derivo/i)
    }
  })

  test('both promise an answer, because nothing else will be said', () => {
    for (const sentence of [DELEGATE, OUT_OF_CATALOG]) {
      expect(sentence).toMatch(/te contestamos/i)
    }
  })

  test('the out of catalog one says the thing is not loaded, which the other does not', () => {
    expect(OUT_OF_CATALOG).toMatch(/no lo tengo/i)
    expect(DELEGATE).not.toMatch(/no lo tengo/i)
  })
})
