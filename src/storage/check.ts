const COLUMN_NAME = /^[a-z_][a-z0-9_]*$/

export function sqliteCheck(column: string, values: readonly string[]): string {
  if (!COLUMN_NAME.test(column)) throw new Error(`${column} is not a column name`)
  if (values.length === 0) throw new Error(`${column} has no allowed values`)

  const literals = values.map((value) => `'${value.replaceAll("'", "''")}'`).join(', ')

  return `CHECK (${column} IN (${literals}))`
}
