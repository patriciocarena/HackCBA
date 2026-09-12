import { migrate } from './migrate'
import { withDb } from './sqlite'

await withDb(migrate)
