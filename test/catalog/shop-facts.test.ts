import { describe, expect, it } from 'bun:test'
import { shopFacts } from '../../src/catalog/shop-facts'
import { answerFromFacts, factsBlock } from '../../src/domain/facts'

describe('the facts the shop is allowed to state', () => {
  it('answers a loaded fact with exactly what the owner confirmed', () => {
    const answer = answerFromFacts('hours', shopFacts)

    expect(answer.kind).toBe('fact')
    if (answer.kind !== 'fact') return
    expect(answer.value).toContain('9 a 18:30')
  })

  it('escalates a fact that exists with no value yet', () => {
    const answer = answerFromFacts('delivery_times', shopFacts)

    expect(answer.kind).toBe('escalate')
    if (answer.kind !== 'escalate') return
    expect(answer.reason).toBe('unknown_fact')
  })

  it('escalates a fact nobody declared, which is where the invented branches die', () => {
    const answer = answerFromFacts('northern_branch', shopFacts)

    expect(answer.kind).toBe('escalate')
    if (answer.kind !== 'escalate') return
    expect(answer.reason).toBe('unknown_fact')
  })

  // The rule the seed exists to hold. A value with no source is how a plausible sentence
  // becomes a fact, and a plausible sentence is what the bot before us was made of.
  it('carries a confirmation date for every value it states', () => {
    const stated = shopFacts.filter((fact) => fact.value !== null)

    expect(stated.length).toBeGreaterThan(0)
    for (const fact of stated) expect(fact.confirmedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('keeps a pending fact out of the block rather than filling it in', () => {
    const block = factsBlock(shopFacts)

    expect(block).toContain('Horarios')
    expect(block).not.toContain('Plazos de entrega')
  })
})
