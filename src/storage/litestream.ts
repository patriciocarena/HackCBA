import { resolve } from 'node:path'

export type ReplicaEnv = {
  DATA_DIR?: string
  LITESTREAM_REPLICA_URL?: string
}

export function dataDir(env: ReplicaEnv): string {
  return resolve(env.DATA_DIR ?? '.')
}

export function replicaUrl(env: ReplicaEnv): string {
  return env.LITESTREAM_REPLICA_URL ?? `file://${dataDir(env)}/replica`
}

export function litestreamConfig(env: ReplicaEnv): string {
  return [
    'dbs:',
    `  - path: ${dataDir(env)}/dante.db`,
    '    replicas:',
    `      - url: ${replicaUrl(env)}`,
    '',
  ].join('\n')
}
