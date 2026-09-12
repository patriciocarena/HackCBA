import { describe, expect, test } from 'bun:test'
import { fence } from '../../src/security/fence'

describe('a fenced block', () => {
  test('wraps the text in a labelled delimiter pair', () => {
    const block = fence('cien tarjetas', 'message')

    expect(block).toMatch(/^<message:[0-9a-f]{16}>\ncien tarjetas\n<\/message:[0-9a-f]{16}>$/)
  })

  test('opens and closes on the same nonce', () => {
    const block = fence('cien tarjetas', 'message')
    const [open, close] = [block.slice(0, block.indexOf('>') + 1), block.slice(block.lastIndexOf('<'))]

    expect(close).toBe(open.replace('<', '</'))
  })
})

describe('the fence is deterministic', () => {
  test('the same text and label fence identically', () => {
    expect(fence('cien tarjetas', 'message')).toBe(fence('cien tarjetas', 'message'))
  })

  test('a different label fences under a different nonce', () => {
    const message = fence('cien tarjetas', 'message')
    const transcript = fence('cien tarjetas', 'transcript')

    expect(message.slice(9, 25)).not.toBe(transcript.slice(12, 28))
  })
})
