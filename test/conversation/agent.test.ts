import { describe, expect, test } from 'bun:test'
import { agentWrite, OBSERVER_MODEL, routerModel, type Generate } from '@/conversation/agent'

function recording(text = 'una respuesta') {
  const calls: { message: string; options: Parameters<Generate>[1] }[] = []

  const generate: Generate = async (message, options) => {
    calls.push({ message, options })

    return { text }
  }

  return { calls, write: agentWrite({ generate }) }
}

const WHOSE = { thread: 'telegram:42:customer', resource: '42' }

describe('the model the router is given', () => {
  test('sends the writer through OpenRouter, because that is the only credential this repo has', () => {
    expect(routerModel('anthropic/claude-sonnet-5')).toBe('openrouter/anthropic/claude-sonnet-5')
  })

  test('leaves a string that already names the provider alone', () => {
    expect(routerModel('openrouter/anthropic/claude-opus-5')).toBe('openrouter/anthropic/claude-opus-5')
  })

  // Mastra's default observer is a bare `google/...`, which would ask for a Google key that
  // ADR 0002 says does not exist here. Naming it is what keeps one credential.
  test('sends the observer through OpenRouter too', () => {
    expect(OBSERVER_MODEL).toStartWith('openrouter/')
  })
})

describe('the writer, as an agent turn', () => {
  test('names the conversation and the person, because a memory without a thread throws', async () => {
    const { calls, write } = recording()

    await write({ system: 'sos dante', user: 'los bloques', ...WHOSE })

    expect(calls[0]?.options.memory).toEqual({ thread: WHOSE.thread, resource: WHOSE.resource })
  })

  test('sends the blocks as the message and the prompt as the instructions for this call', async () => {
    const { calls, write } = recording()

    await write({ system: 'sos dante', user: 'los bloques', ...WHOSE })

    expect(calls[0]?.message).toBe('los bloques')
    expect(calls[0]?.options.instructions).toBe('sos dante')
  })

  test('returns the text, which is the whole reply', async () => {
    const { write } = recording('Te cotizo $45.000 final con IVA incluido.')

    expect(await write({ system: 's', user: 'u', ...WHOSE })).toBe('Te cotizo $45.000 final con IVA incluido.')
  })

  test('throws on an empty answer, because a reply nobody wrote is not a reply', async () => {
    const { write } = recording('   ')

    expect(write({ system: 's', user: 'u', ...WHOSE })).rejects.toThrow()
  })
})
