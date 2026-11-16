// Tests for scripts/check-docs.mjs: a copy of this repository passes, and each kind of drift the check guards against,
// seeded into a fresh copy, is reported at its line, with no other problem beside it.
// Run: node scripts/check-docs.test.mjs
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkDocs } from './check-docs.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SCRIPT = fileURLToPath(new URL('./check-docs.mjs', import.meta.url))
const FILES = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: ROOT, encoding: 'utf8' })
  .split('\0').filter(file => file && existsSync(join(ROOT, file)))
const scratch = mkdtempSync(join(tmpdir(), 'check-docs-'))
let copies = 0

// A copy of the repository as git sees it, in a git repository of its own, with helpers that seed drift into it.
function copy() {
  const dir = join(scratch, String(++copies))
  for (const file of FILES) {
    mkdirSync(dirname(join(dir, file)), { recursive: true })
    cpSync(join(ROOT, file), join(dir, file))
  }
  execFileSync('git', ['init', '-q'], { cwd: dir })
  const path = file => join(dir, file)
  const holding = (file, text) => {
    const body = readFileSync(path(file), 'utf8')
    assert.ok(body.includes(text), `${file} holds ${JSON.stringify(text)}`)
    return body
  }
  return {
    dir,
    lineOf: (file, text) => {
      const body = holding(file, text)
      return body.slice(0, body.indexOf(text)).split('\n').length
    },
    edit: (file, from, to) => writeFileSync(path(file), holding(file, from).replace(from, to)),
    json: (file, change) => {
      const value = JSON.parse(readFileSync(path(file), 'utf8'))
      change(value)
      writeFileSync(path(file), `${JSON.stringify(value, null, 2)}\n`)
    },
    write: (file, body) => {
      mkdirSync(dirname(path(file)), { recursive: true })
      writeFileSync(path(file), body)
    },
    move: (from, to) => {
      assert.ok(existsSync(path(from)), `${from} exists`)
      renameSync(path(from), path(to))
    },
  }
}

const cases = []
// Each expected entry is one problem the seed must cause, matched by inclusion. at() builds one whose line is the line
// of the given text in the seeded copy, so no test hard-codes a line of the README it reads.
const drift = (name, seed, expected) => cases.push({ name, seed, expected })
const at = (file, text, message) => repo => `${file}:${repo.lineOf(file, text)} ${message}`
const ROW = name => `| [\`${name}\`]`

drift('a renamed skill', repo => {
  repo.move('plugins/verification/skills/maintain', 'plugins/verification/skills/upkeep')
  repo.edit('plugins/verification/skills/upkeep/SKILL.md', 'name: maintain', 'name: upkeep')
}, [
  at('plugins/verification/README.md', '| `maintain` |', 'lists skill maintain, which plugins/verification/skills/ does not hold'),
  at('plugins/verification/README.md', '## Skills', 'does not list skill upkeep'),
  'names verification:maintain, but verification has no skill, agent or workflow maintain',
])

drift('a skill whose frontmatter names another', repo => {
  repo.edit('plugins/dmf/skills/orchestrator/SKILL.md', 'name: orchestrator', 'name: router')
}, ['plugins/dmf/skills/orchestrator/SKILL.md:2 has the name router, but its folder is orchestrator'])

drift('an agent whose frontmatter has no name', repo => {
  repo.edit('plugins/verification/agents/feature-reader.md', 'name: feature-reader\n', '')
}, ['plugins/verification/agents/feature-reader.md:1 has no name in its frontmatter'])

drift('a new agent', repo => {
  repo.write('plugins/verification/agents/run-checker.md', '---\nname: run-checker\ndescription: Checks a run.\n---\n\nChecks a run.\n')
}, [
  at('README.md', ROW('verification'), 'says "1 agent" for verification, but plugins/verification/agents/ holds 2'),
  at('plugins/verification/README.md', '## Agents', 'does not list agent run-checker'),
])

drift('a count with the wrong number', repo => {
  repo.edit('README.md', '| 10 skills, 2 agents, 2 workflows |', '| 10 skills, 1 agent, 2 workflows |')
}, [at('README.md', ROW('lowy'), 'says "1 agent" for lowy, but plugins/lowy/agents/ holds 2')])

drift('a count with the wrong grammar', repo => {
  repo.edit('README.md', '| 1 skill, 3 agents, 1 workflow, and function hooks', '| 1 skills, 3 agents, 1 workflow, and function hooks')
}, [at('README.md', ROW('devflow'), 'says "1 skills" for devflow: write "1 skill"')])

drift('a new workflow', repo => {
  repo.write('plugins/verification/workflows/sweep.js', "export const meta = {\n  name: 'sweep',\n  description: 'Drives every feature',\n}\n")
}, [
  at('README.md', ROW('verification'), "does not count verification's 1 workflow"),
  'plugins/verification/README.md:1 has no Workflows section for its 1 workflow',
  at('README.md', '| The Workflow tool |', 'says "The Workflow tool" is needed by devflow, lowy, but the tree says devflow, lowy, verification'),
  at('README.md', '| The Workflow tool |', "does not name verification's sweep as needing the Workflow tool"),
])

drift('a workflow whose meta names another', repo => {
  repo.edit('plugins/lowy/workflows/design-check.js', "name: 'design-check'", "name: 'check-design'")
}, [at('plugins/lowy/workflows/design-check.js', "name: 'check-design'", 'has the name check-design, but its file is design-check.js')])

drift('new function hooks', repo => {
  repo.write('plugins/verification/hooks/hooks.json', '{ "modules": ["./register.ts"] }\n')
  repo.write('plugins/verification/hooks/register.ts', 'export default () => {}\n')
}, [
  at('README.md', ROW('verification'), 'does not say verification has function hooks'),
  at('README.md', '| Function hooks |', 'says "Function hooks" is needed by devflow, dmf, house-rules, lowy, but the tree says devflow, dmf, house-rules, lowy, verification'),
])

drift('a new command hook event', repo => {
  repo.json('plugins/workstation/hooks/hooks.json', hooks => { hooks.hooks.Stop = hooks.hooks.SessionStart })
}, [
  at('README.md', ROW('workstation'), "does not name workstation's Stop hook"),
  'plugins/workstation/README.md:1 does not name its Stop hook',
])

drift('hooks claimed where there are none', repo => {
  repo.edit('README.md', '| 2 skills, 1 agent |', '| 2 skills, 1 agent, a hook on session start |')
}, [at('README.md', ROW('verification'), 'says verification has hooks, but plugins/verification/hooks/hooks.json does not exist')])

drift('a new dependency inside the marketplace', repo => {
  repo.json('plugins/verification/.claude-plugin/plugin.json', manifest => { manifest.dependencies = ['dmf'] })
}, [
  at('README.md', ROW('verification'), "does not name verification's dependency dmf"),
  at('README.md', '| Plugin dependencies |', 'says "Plugin dependencies" is needed by devflow, lowy, workstation, but the tree says devflow, lowy, verification, workstation'),
  at('README.md', '| `dmf@cc-resources` |', 'says "`dmf@cc-resources`" is needed by devflow, lowy, but the tree says devflow, lowy, verification'),
  // dmf's function hooks come with it
  at('README.md', '| Function hooks |', 'says "Function hooks" is needed by devflow, dmf, house-rules, lowy, but the tree says devflow, dmf, house-rules, lowy, verification'),
])

drift('a new dependency on another marketplace', repo => {
  repo.json('plugins/workstation/.claude-plugin/plugin.json', manifest => { manifest.dependencies.push('playwright@claude-plugins-official') })
}, [
  at('README.md', ROW('workstation'), "does not name workstation's dependency playwright"),
  at('README.md', '### Plugins and Marketplaces', 'Plugins and Marketplaces has no row for `playwright@claude-plugins-official`'),
])

drift('a dependency on a marketplace that is not allowed', repo => {
  repo.json('.claude-plugin/marketplace.json', marketplace => { marketplace.allowCrossMarketplaceDependenciesOn = [] })
}, [
  '.claude-plugin/marketplace.json:1 does not allow dependencies on claude-plugins-official, which workstation depends on for context7',
  '.claude-plugin/marketplace.json:1 does not allow dependencies on claude-plugins-official, which workstation depends on for serena',
])

drift('a dependency on a plugin that is not here', repo => {
  repo.json('plugins/verification/.claude-plugin/plugin.json', manifest => { manifest.dependencies = ['recorder'] })
}, [
  at('plugins/verification/.claude-plugin/plugin.json', '"recorder"', 'depends on recorder, which plugins/ does not hold'),
  at('README.md', ROW('verification'), "does not name verification's dependency recorder"),
  at('README.md', '| Plugin dependencies |', 'says "Plugin dependencies" is needed by'),
  at('README.md', '### Plugins and Marketplaces', 'Plugins and Marketplaces has no row for `recorder@cc-resources`'),
])

drift('a dependency named that plugin.json does not reach', repo => {
  repo.edit('README.md', '| `lowy` (and through it `dmf`) |', '| `lowy` (and through it `dmf` and `workstation`) |')
}, [at('README.md', ROW('devflow'), 'names workstation as a dependency of devflow, which its plugin.json does not reach')])

drift('a plugin missing from the index', repo => {
  const readme = readFileSync(join(repo.dir, 'README.md'), 'utf8')
  repo.edit('README.md', `${readme.split('\n').find(line => line.startsWith(ROW('verification')))}\n`, '')
}, [at('README.md', '## Plugin Index', 'Plugin Index has no row for verification')])

drift('an index row linked to the wrong README', repo => {
  repo.edit('README.md', '[`lowy`](plugins/lowy/README.md)', '[`lowy`](plugins/dmf/README.md)')
}, [at('README.md', '[`lowy`](plugins/dmf/README.md)', 'links lowy to plugins/dmf/README.md, not plugins/lowy/README.md')])

drift('an index row for a plugin that is not here', repo => {
  repo.edit('README.md', ROW('lowy'), `| [\`recorder\`](plugins/recorder/README.md) | Records | Nothing | Nothing |\n${ROW('lowy')}`)
}, [
  at('README.md', '| [`recorder`]', 'indexes recorder, which plugins/ does not hold'),
  at('README.md', '| [`recorder`]', 'links to plugins/recorder/README.md, which does not exist'),
])

drift('a plugin count that is out of date', repo => {
  repo.edit('README.md', 'It holds six plugins:', 'It holds seven plugins:')
}, [at('README.md', 'It holds seven plugins:', 'says "seven plugins", but plugins/ holds 6')])

drift('a plugin list that does not add up', repo => {
  repo.edit('README.md', ' one that proves the product works by driving it,', '')
}, [at('README.md', 'It holds six plugins:', 'counts 5 plugins after "six plugins:", but plugins/ holds 6')])

drift('a plugin missing from the marketplace', repo => {
  repo.json('.claude-plugin/marketplace.json', marketplace => {
    marketplace.plugins = marketplace.plugins.filter(entry => entry.name !== 'verification')
  })
}, [at('.claude-plugin/marketplace.json', '"plugins"', 'does not list plugin verification')])

drift('a marketplace entry with the wrong source', repo => {
  repo.json('.claude-plugin/marketplace.json', marketplace => {
    marketplace.plugins.find(entry => entry.name === 'lowy').source = './plugins/lowy-method'
  })
}, [at('.claude-plugin/marketplace.json', '"name": "lowy"', 'gives lowy the source ./plugins/lowy-method, not ./plugins/lowy')])

drift('a plugin whose plugin.json names another', repo => {
  repo.json('plugins/house-rules/.claude-plugin/plugin.json', manifest => { manifest.name = 'rules' })
}, [at('plugins/house-rules/.claude-plugin/plugin.json', '"name"', 'names the plugin rules, but its folder is plugins/house-rules/')])

drift('a dead relative link', repo => {
  repo.edit('plugins/dmf/README.md', '(../lowy/README.md)', '(../lowy/READ.md)')
}, [at('plugins/dmf/README.md', '(../lowy/READ.md)', 'links to ../lowy/READ.md, which does not exist')])

drift('a dead anchor', repo => {
  repo.edit('plugins/devflow/README.md', '(#permissions)', '(#permission)')
}, [at('plugins/devflow/README.md', '(#permission)', 'links to #permission, but plugins/devflow/README.md has no heading with that anchor')])

drift('a link into a code span, which is not a link', repo => {
  repo.edit('plugins/dmf/README.md', 'add the [`lowy`](../lowy/README.md) plugin', 'add the `[lowy](../lowy/READ.md)` plugin')
}, [])

drift('a reference file that moved', repo => {
  repo.move('plugins/verification/references/drive-recipes.md', 'plugins/verification/references/recipes.md')
}, [
  at('plugins/verification/README.md', '(references/drive-recipes.md)', 'links to references/drive-recipes.md, which does not exist'),
  at('plugins/verification/skills/create/SKILL.md', '${CLAUDE_PLUGIN_ROOT}/references/drive-recipes.md',
    'names ${CLAUDE_PLUGIN_ROOT}/references/drive-recipes.md, which plugins/verification/ does not hold'),
])

drift('a renamed agent that a workflow still names', repo => {
  repo.move('plugins/lowy/agents/lowy-reviewer.md', 'plugins/lowy/agents/structure-reviewer.md')
  repo.edit('plugins/lowy/agents/structure-reviewer.md', 'name: lowy-reviewer', 'name: structure-reviewer')
  repo.edit('plugins/lowy/README.md', '`lowy:lowy-reviewer`', '`lowy:structure-reviewer`')
}, [
  at('plugins/lowy/workflows/arch-audit.js', "agentType: 'lowy:lowy-reviewer'", 'names lowy:lowy-reviewer, but lowy has no skill, agent or workflow lowy-reviewer'),
  // and every other file that still names it
  'names lowy:lowy-reviewer, but lowy has no skill, agent or workflow lowy-reviewer',
])

drift('a Layout that is out of date', repo => {
  repo.edit('plugins/dmf/README.md', '└── types/ ', '└── typings/ ')
  repo.write('plugins/dmf/scripts/build.sh', '#!/usr/bin/env bash\n')
}, [
  at('plugins/dmf/README.md', '└── typings/', 'lays out typings/, which plugins/dmf/ does not hold'),
  at('plugins/dmf/README.md', '## Layout', 'Layout does not list scripts/'),
  at('plugins/dmf/README.md', '## Layout', 'Layout does not list types/'),
])

drift('README paths that are gone', repo => {
  repo.edit('plugins/lowy/README.md', '`tests/fitness/Fixture/Shop.cs`', '`tests/fitness/Fixture/Store.cs`')
  repo.edit('README.md', '`bash scripts/check-shared.sh`', '`bash scripts/check-contracts.sh`')
}, [
  at('plugins/lowy/README.md', '`tests/fitness/Fixture/Store.cs`', 'names tests/fitness/Fixture/Store.cs, which plugins/lowy/ does not hold'),
  at('README.md', '`bash scripts/check-contracts.sh`', 'names scripts/check-contracts.sh, which the repository does not hold'),
])

drift('a skill named without its plugin', repo => {
  repo.edit('plugins/devflow/README.md', '`/devflow:plan-feature <what the feature does>`', '`/plan-feature <what the feature does>`')
}, [at('plugins/devflow/README.md', '`/plan-feature', 'names /plan-feature, which Claude Code calls /devflow:plan-feature')])

drift('a Needed by cell that names a missing part', repo => {
  repo.edit('README.md', "| `lowy`'s `fitness-tests` |", "| `lowy`'s `fitness-test` |")
}, [at('README.md', "`lowy`'s `fitness-test` |", 'names fitness-test after lowy, which has no skill, agent or workflow by that name')])

drift('a Needed by cell that names a skill as a workflow', repo => {
  repo.edit('README.md', "`devflow`'s `review-plan` |", "`devflow`'s `review-plan` and `plan-feature` |")
}, [at('README.md', '| The Workflow tool |', "names devflow's plan-feature, a skill, as needing the Workflow tool")])

drift('a Skills table row from another plugin', repo => {
  repo.edit('plugins/verification/README.md', '| `create` |', '| `dmf:create` |')
}, [
  at('plugins/verification/README.md', '| `dmf:create` |', 'lists dmf:create under Skills, outside the verification namespace'),
  at('plugins/verification/README.md', '| `dmf:create` |', 'names dmf:create, but dmf has no skill, agent or workflow create'),
])

drift('an Agents section for a plugin with no agents', repo => {
  repo.edit('plugins/house-rules/README.md', '## Limits', '## Agents\n\n| Agent | Role |\n|---|---|\n| `house-rules:checker` | Checks |\n\n## Limits')
}, [
  at('plugins/house-rules/README.md', '## Agents', 'has the section Agents, but plugins/house-rules/agents/ holds none'),
  at('plugins/house-rules/README.md', '`house-rules:checker`', 'names house-rules:checker, but house-rules has no skill, agent or workflow checker'),
])

let passed = 0
try {
  const clean = copy()
  assert.deepEqual(checkDocs(clean.dir).problems, [], 'a copy of the repository passes')
  passed++

  for (const { name, seed, expected } of cases) {
    const repo = copy()
    seed(repo)
    const wanted = expected.map(entry => typeof entry === 'function' ? entry(repo) : entry)
    const { problems } = checkDocs(repo.dir)
    const unexpected = problems.filter(problem => !wanted.some(entry => problem.includes(entry)))
    const missing = wanted.filter(entry => !problems.some(problem => problem.includes(entry)))
    assert.deepEqual({ unexpected, missing }, { unexpected: [], missing: [] }, name)
    passed++
  }

  const run = dir => spawnSync(process.execPath, [SCRIPT, dir], { encoding: 'utf8' })
  const ok = run(clean.dir)
  assert.equal(ok.status, 0, ok.stdout + ok.stderr)
  assert.match(ok.stdout, /^tree: 6 plugins, /m)
  assert.match(ok.stdout, /^0 problems\n$/m)
  const broken = copy()
  broken.edit('plugins/devflow/README.md', '(#permissions)', '(#permission)')
  const failed = run(broken.dir)
  assert.equal(failed.status, 1, failed.stdout + failed.stderr)
  assert.match(failed.stdout, /^FAIL plugins\/devflow\/README\.md:\d+ links to #permission, /m)
  assert.match(failed.stdout, /^1 problem\n$/m)
  passed++
} finally {
  rmSync(scratch, { recursive: true, force: true })
}
console.log(`${passed} passed`)
