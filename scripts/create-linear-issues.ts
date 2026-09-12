// Creates every ticket in tasks.json as a Linear issue, then wires the blocking
// relations. Run once: LINEAR_API_KEY=lin_api_... LINEAR_TEAM=HACK bun scripts/create-linear-issues.ts
// Add DRY_RUN=1 to print what it would do without touching Linear.
import tasks from '../tasks.json'

const KEY = process.env.LINEAR_API_KEY
const TEAM = process.env.LINEAR_TEAM
const DRY = process.env.DRY_RUN === '1'
if (!KEY || !TEAM) throw new Error('set LINEAR_API_KEY and LINEAR_TEAM')

async function gql(query: string, variables: Record<string, unknown> = {}) {
  const res = await fetch('https://api.linear.app/graphql', {
    method: 'POST',
    headers: { Authorization: KEY!, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  })
  const body = await res.json()
  if (body.errors) throw new Error(JSON.stringify(body.errors))
  return body.data
}

const body = (t: (typeof tasks.tasks)[number]) =>
  [
    t.description,
    '',
    '**Done when**',
    ...t.acceptance_criteria.map((a) => `- [ ] ${a}`),
    '',
    `Window: ${t.starts} to ${t.ends} · ${t.hours} h · ${t.crew.join(' + ')}`,
    t.critical_chain ? 'On the critical chain.' : '',
  ].join('\n')

const team = (await gql(`query($k:String!){ teams(filter:{key:{eq:$k}}){ nodes{ id key } } }`, { k: TEAM }))
  .teams.nodes[0]
if (!team) throw new Error(`no team with key ${TEAM}`)

const existing = (await gql(`query($t:ID!){ issueLabels(filter:{team:{id:{eq:$t}}}){ nodes{ id name } } }`, { t: team.id }))
  .issueLabels.nodes as { id: string; name: string }[]
const labelId: Record<string, string> = Object.fromEntries(existing.map((l) => [l.name, l.id]))

const wanted = [...new Set(tasks.tasks.flatMap((t) => [`lane-${t.lane.toLowerCase()}`, ...(t.critical_chain ? ['critical-chain'] : [])]))]
for (const name of wanted) {
  if (labelId[name] || DRY) continue
  const r = await gql(
    `mutation($i:IssueLabelCreateInput!){ issueLabelCreate(input:$i){ issueLabel{ id name } } }`,
    { i: { name, teamId: team.id } },
  )
  labelId[name] = r.issueLabelCreate.issueLabel.id
}

const created: Record<string, string> = {}
for (const t of tasks.tasks) {
  const input = {
    teamId: team.id,
    title: `${t.id} ${t.title}`,
    description: body(t),
    estimate: Math.max(1, Math.round(t.hours)),
    priority: t.critical_chain ? 1 : 2,
    labelIds: [labelId[`lane-${t.lane.toLowerCase()}`], ...(t.critical_chain ? [labelId['critical-chain']] : [])].filter(Boolean),
  }
  if (DRY) {
    console.log('would create', input.title)
    continue
  }
  const r = await gql(`mutation($i:IssueCreateInput!){ issueCreate(input:$i){ issue{ id identifier } } }`, { i: input })
  created[t.id] = r.issueCreate.issue.id
  console.log('created', r.issueCreate.issue.identifier, t.title)
}

for (const t of tasks.tasks) {
  for (const b of t.blocked_by) {
    if (DRY) {
      console.log('would link', b, 'blocks', t.id)
      continue
    }
    await gql(
      `mutation($i:IssueRelationCreateInput!){ issueRelationCreate(input:$i){ success } }`,
      { i: { issueId: created[b], relatedIssueId: created[t.id], type: 'blocks' } },
    )
    console.log('linked', b, 'blocks', t.id)
  }
}
console.log(DRY ? 'dry run, nothing written' : `done: ${Object.keys(created).length} issues`)
