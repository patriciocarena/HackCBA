import { createHmac, randomBytes } from 'node:crypto'
import type { UntrustedText } from '../domain/types'

const NONCE_LENGTH = 32
const LABEL = /^[a-z][a-z0-9_]*$/

export function fencer(secret: string) {
  return function fence(text: string, label: string): UntrustedText {
    if (!LABEL.test(label)) throw new Error(`fence label ${JSON.stringify(label)} is not a slug`)

    const nonce = createHmac('sha256', secret)
      .update(Buffer.from(`${label} ${text}`, 'utf16le'))
      .digest('hex')
      .slice(0, NONCE_LENGTH)

    return `<${label}:${nonce}>\n${text}\n</${label}:${nonce}>` as UntrustedText
  }
}

export const fence = fencer(process.env.FENCE_SECRET ?? randomBytes(32).toString('hex'))
