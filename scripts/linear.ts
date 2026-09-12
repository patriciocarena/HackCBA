// Reads and moves issues on the DAN team. Reading is safe from a lane; moving state is
// the orchestrator's job, because four lanes writing one board is four races.
//   bun scripts/linear.ts view DAN-11
//   bun scripts/linear.ts list
//   bun scripts/linear.ts move DAN-11 "In Progress"
import '../src/config/load-env'
import { requireEnv } from '../src/config/env'

const KEY = requireEnv('LINEAR_API_KEY')
const TEAM = requireEnv('LINEAR_TEAM')

async function gql(query: string, variables: Record<string, unknown> = {}) {
  const res = await fetch('https://api.linear.app/graphql', {
    method: 'POST',
    headers: { Authorization: KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  })
  const body = (await res.json()) as { data?: any; errors?: unknown }
  if (body.errors) throw new Error(JSON.stringify(body.errors))
  return body.data
}

const byIdentifier = async (identifier: string) => {
  const data = await gql(
    `query($t:String!){ issues(first:100, filter:{team:{key:{eq:$t}}}){ nodes{ id identifier title description state{ name } } } }`,
    { t: TEAM },
  )
  const issue = data.issues.nodes.find((n: any) => n.identifier === identifier)
  if (!issue) throw new Error(`no issue ${identifier} on ${TEAM}`)
  return issue
}

const [command, ...args] = process.argv.slice(2)

if (command === 'view') {
  const issue = await byIdentifier(args[0]!)
  console.log(`${issue.identifier} [${issue.state.name}] ${issue.title}\n\n${issue.description ?? ''}`)
} else if (command === 'list') {
  const data = await gql(
    `query($t:String!){ issues(first:100, filter:{team:{key:{eq:$t}}}){ nodes{ identifier title state{ name } } } }`,
    { t: TEAM },
  )
  for (const n of data.issues.nodes.sort((a: any, b: any) => a.title.localeCompare(b.title))) {
    console.log(`${n.identifier.padEnd(8)} ${n.state.name.padEnd(14)} ${n.title}`)
  }
} else if (command === 'move') {
  const issue = await byIdentifier(args[0]!)
  const wanted = args[1]!
  const states = await gql(
    `query($t:String!){ workflowStates(filter:{team:{key:{eq:$t}}}){ nodes{ id name } } }`,
    { t: TEAM },
  )
  const state = states.workflowStates.nodes.find((s: any) => s.name === wanted)
  if (!state) throw new Error(`no state ${wanted}`)
  await gql(`mutation($i:String!,$s:String!){ issueUpdate(id:$i, input:{stateId:$s}){ success } }`, {
    i: issue.id,
    s: state.id,
  })
  console.log(`${issue.identifier} -> ${wanted}`)
} else {
  throw new Error('usage: linear.ts view|list|move')
}
