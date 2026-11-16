// Fails when a commit that a push or a pull request adds, or the pull request's body, carries Claude attribution:
// a Co-Authored-By trailer naming Claude or Anthropic, a "Generated with Claude Code" line, or a Claude-Session link.
// Commits already on the branch it lands on are not judged, so the history from before this check stays as it is.
// In CI (.github/workflows/attribution.yml) the event's revisions and body come in the environment:
//   BASE_SHA, HEAD_SHA, BEFORE_SHA, DEFAULT_BRANCH, PR_BODY.
// By hand: node scripts/check-attribution.mjs [<revision range>] [--body <file>]
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export const ATTRIBUTION = [
  { name: 'a Co-Authored-By trailer naming Claude or Anthropic', pattern: /^[ \t]*co-authored-by:[^\n]*\b(?:claude|anthropic)\b.*$/im },
  { name: 'a Claude-Session link', pattern: /^[ \t]*claude-session:.*$/im },
  // The footer starts its line, after its robot emoji if it has one, so a sentence that names it is not one.
  { name: 'a "Generated with Claude Code" line', pattern: /^[ \t]*(?:\u{1F916}[ \t]*)?generated with \[?claude code\b.*$/imu },
]

// What attribution a text carries: each kind it holds, with the first line that holds it.
export const attributionIn = text =>
  ATTRIBUTION.flatMap(({ name, pattern }) => {
    const match = text.replace(/\r\n?/g, '\n').match(pattern)
    return match === null ? [] : [{ name, line: match[0].trim() }]
  })

// The `git log` arguments that list the commits an event adds.
// A pull request adds what its head has beyond its base; a push adds what it moved its branch past.
// A new branch, or a force push whose old head is gone, adds what it has beyond the default branch.
// Without any of those, only the head commit is judged.
export function commitsFor(env, isCommit) {
  const head = env.HEAD_SHA || 'HEAD'
  if (env.BASE_SHA) return [`${env.BASE_SHA}..${head}`]
  if (env.BEFORE_SHA && !/^0+$/.test(env.BEFORE_SHA) && isCommit(env.BEFORE_SHA)) return [`${env.BEFORE_SHA}..${head}`]
  const main = env.DEFAULT_BRANCH && `origin/${env.DEFAULT_BRANCH}`
  if (main && isCommit(main)) return [`${main}..${head}`]
  return ['-1', head]
}

const UNIT = '\x1f'
const RECORD = '\x1e'

// The commits `git log` lists for these arguments, each with its short hash, subject and message.
export function commits(args, cwd) {
  const log = execFileSync('git', ['log', `--format=%h${UNIT}%s${UNIT}%B${RECORD}`, ...args], { cwd, encoding: 'utf8' })
  return log
    .split(RECORD)
    .map(entry => entry.replace(/^\n/, ''))
    .filter(entry => entry.includes(UNIT))
    .map(entry => {
      const [hash, subject, message] = entry.split(UNIT)
      return { hash, subject, message }
    })
}

// The problems to report: one per attributed commit, and one for an attributed pull request body.
export function problems(found, body) {
  const listed = attribution => attribution.map(({ name, line }) => `  ${name}: ${line}`)
  const fromCommits = found.flatMap(({ hash, subject, message }) => {
    const attribution = attributionIn(message)
    if (attribution.length === 0) return []
    return [
      [
        `Commit ${hash} (${subject}) carries Claude attribution:`,
        ...listed(attribution),
        '  Remove it from the message: `git commit --amend` for the last commit, or `git rebase -i` with `reword` for an older one, then push again with `--force-with-lease`.',
      ].join('\n'),
    ]
  })
  const inBody = attributionIn(body ?? '')
  const fromBody =
    inBody.length === 0
      ? []
      : [
          [
            'The pull request body carries Claude attribution:',
            ...listed(inBody),
            "  Edit the pull request's description to remove it; editing it runs this check again.",
          ].join('\n'),
        ]
  return [...fromCommits, ...fromBody]
}

function isCommitIn(cwd) {
  return revision => {
    try {
      execFileSync('git', ['rev-parse', '--verify', '--quiet', `${revision}^{commit}`], { cwd, stdio: 'ignore' })
      return true
    } catch {
      return false
    }
  }
}

// A problem as GitHub Actions shows it: an error annotation, its newlines escaped.
const annotation = problem => `::error::${problem.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A')}`

function main(argv, env) {
  const cwd = process.cwd()
  const revisions = [...argv]
  let body = env.PR_BODY
  const at = revisions.indexOf('--body')
  if (at >= 0) body = readFileSync(revisions.splice(at, 2)[1], 'utf8')
  const args = revisions.length > 0 ? revisions : commitsFor(env, isCommitIn(cwd))
  const found = commits(args, cwd)
  const reported = problems(found, body)
  console.log(`Checked ${found.length} commit${found.length === 1 ? '' : 's'} (git log ${args.join(' ')})${body ? ' and the pull request body' : ''}.`)
  for (const problem of reported) console.error(env.GITHUB_ACTIONS === 'true' ? annotation(problem) : problem)
  return reported.length === 0 ? 0 : 1
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2), process.env)
