import { createHash } from 'node:crypto'
import type { UntrustedText } from '../domain/types'

const NONCE_LENGTH = 16
const LABEL = /^[a-z][a-z0-9_]*$/

export function fence(text: string, label: string): UntrustedText {
  if (!LABEL.test(label)) throw new Error(`fence label ${JSON.stringify(label)} is not a slug`)

  const nonce = createHash('sha256')
    .update(`${label} ${text}`)
    .digest('hex')
    .slice(0, NONCE_LENGTH)

  return `<${label}:${nonce}>\n${text}\n</${label}:${nonce}>` as UntrustedText
}
