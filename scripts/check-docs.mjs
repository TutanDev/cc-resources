#!/usr/bin/env node
// Lists every plugin's skills, agents, workflows and hooks from the tree, and fails when the docs drift from it: the
// root README's plugin count, its Plugin Index and the External Dependencies rows the tree decides, each plugin
// README's Skills, Agents and Workflows tables, its Layout and the paths it names, the marketplace entries, relative
// links and their anchors, namespaced names such as dmf:fp-reviewer, and ${CLAUDE_PLUGIN_ROOT} paths.
// Prose the tree cannot decide, such as what a tool on the machine is for, is left to review.
// The tree is what git sees: tracked files, and new files it does not ignore.
// Run: node scripts/check-docs.mjs [repository root]. Prints FAIL <file>:<line> <problem> for each drift, exits 1 on any.
import { execFileSync } from 'node:child_process'
import { readFileSync, realpathSync, statSync } from 'node:fs'
import { dirname, join, posix, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Ids that share the <plugin>:<name> form but name no skill, agent or workflow.
const NOT_COMPONENTS = new Set([
  'dmf:routing', // the system prompt section the dmf hook adds
])
const NUMBERS = 'zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty'.split(' ')
const KINDS = [
  { key: 'skills', noun: 'skill', heading: 'Skills' },
  { key: 'agents', noun: 'agent', heading: 'Agents' },
  { key: 'workflows', noun: 'workflow', heading: 'Workflows' },
]
const TEXT = /\.(?:md|js|mjs|ts|tsx|json|sh|yml)$/
const COUNT = /\b(\d+|[a-z]+) (skill|agent|workflow)(s?)\b/gi
const LINK = /!?\[[^\]]*\]\(<?([^)\s>]+)>?(?:\s+"[^"]*")?\)/g
const SLASH = /(?<=^|[\s`(|"'>])\/([a-z][a-z0-9-]*)(?![\w/<:-]|\.\w)/gm
const PLUGIN_ROOT_PATH = /\$\{CLAUDE_PLUGIN_ROOT\}\/([^\s`"')\\]*)/g
const PLURAL = (n, noun) => `${n} ${noun}${n === 1 ? '' : 's'}`

const toNumber = word => /^\d+$/.test(word) ? Number(word) : NUMBERS.indexOf(word.toLowerCase())
const codeSpans = text => [...text.matchAll(/(`+)([\s\S]*?)\1/g)].map(match => match[2].trim())
const unique = list => [...new Set(list)].sort()
const sameList = (a, b) => a.length === b.length && a.every((item, i) => item === b[i])
const listed = list => list.length ? list.join(', ') : 'none'

function listFiles(root) {
  const out = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 26 })
  return unique(out.split('\0').filter(Boolean)).filter(file => {
    try { return statSync(join(root, file)).isFile() } catch { return false }
  })
}

function frontmatterName(text) {
  const block = /^---\n([\s\S]*?)\n---/.exec(text)
  const name = block && /^name:\s*(.*?)\s*$/m.exec(block[1])
  return name ? name[1].replace(/^["']|["']$/g, '') : undefined
}

// Lines of Markdown, each marked when it sits in a fenced code block, fence lines included.
function parseMarkdown(text) {
  let fence
  return text.split('\n').map((raw, i) => {
    const marker = /^\s*(`{3,}|~{3,})/.exec(raw)?.[1]
    if (fence !== undefined) {
      if (marker !== undefined && marker[0] === fence[0] && marker.length >= fence.length) fence = undefined
      return { n: i + 1, raw, fenced: true }
    }
    if (marker !== undefined) fence = marker
    return { n: i + 1, raw, fenced: marker !== undefined }
  })
}

const headingOf = line => line.fenced ? undefined : /^(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/.exec(line.raw)

function cells(row) {
  const out = []
  let cell = ''
  let code = false
  for (const ch of row.trim().replace(/^\|/, '').replace(/\|$/, '')) {
    if (ch === '`') code = !code
    if (ch === '|' && !code) {
      out.push(cell.trim())
      cell = ''
    } else cell += ch
  }
  out.push(cell.trim())
  return out
}

// The first table in a run of lines: its header cells and its body rows.
function tableIn(lines) {
  const isRow = line => !line.fenced && line.raw.trimStart().startsWith('|')
  const first = lines.findIndex(isRow)
  if (first < 0) return undefined
  const rows = []
  for (let i = first; i < lines.length && isRow(lines[i]); i++) rows.push({ n: lines[i].n, cells: cells(lines[i].raw) })
  const [header, , ...body] = rows
  return { n: header.n, header: header.cells, rows: body }
}

// GitHub's heading anchors: inline markup dropped, lower case, punctuation removed, spaces as hyphens, repeats numbered.
function anchorsOf(lines) {
  const seen = new Map()
  const found = new Set()
  for (const line of lines) {
    const heading = headingOf(line)
    if (!heading) continue
    const slug = heading[2].replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[`*]/g, '').trim().toLowerCase()
      .replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s/g, '-')
    const repeat = seen.get(slug) ?? 0
    seen.set(slug, repeat + 1)
    found.add(repeat ? `${slug}-${repeat}` : slug)
  }
  return found
}

export function checkDocs(root) {
  const files = listFiles(root)
  const fileSet = new Set(files)
  const dirSet = new Set(files.flatMap(file => {
    const parts = file.split('/').slice(0, -1)
    return parts.map((_, i) => parts.slice(0, i + 1).join('/'))
  }))
  const exists = path => fileSet.has(path.replace(/\/+$/, '')) || dirSet.has(path.replace(/\/+$/, ''))
  const texts = new Map()
  const read = file => {
    if (!texts.has(file)) texts.set(file, readFileSync(join(root, file), 'utf8').replace(/\r/g, ''))
    return texts.get(file)
  }
  const parsed = new Map()
  const markdown = file => {
    if (!parsed.has(file)) parsed.set(file, parseMarkdown(read(file)))
    return parsed.get(file)
  }
  const problems = []
  const fail = (file, line, message) => problems.push(`${file}:${line} ${message}`)
  const lineAt = (file, index) => read(file).slice(0, index).split('\n').length
  const lineOf = (file, needle) => {
    const index = read(file).indexOf(needle)
    return index < 0 ? 1 : lineAt(file, index)
  }
  const json = file => {
    try {
      return JSON.parse(read(file))
    } catch (error) {
      fail(file, 1, `is not valid JSON: ${error.message}`)
      return undefined
    }
  }
  const section = (file, level, title) => {
    const lines = markdown(file)
    const start = lines.findIndex(line => {
      const heading = headingOf(line)
      return heading && heading[1].length === level && heading[2] === title
    })
    if (start < 0) return undefined
    const after = lines.slice(start + 1)
    const end = after.findIndex(line => {
      const heading = headingOf(line)
      return heading && heading[1].length <= level
    })
    return { heading: lines[start], lines: end < 0 ? after : after.slice(0, end) }
  }
  const counts = { links: 0, namespaced: 0, pluginRootPaths: 0, readmePaths: 0 }

  // The tree.
  const MARKETPLACE = '.claude-plugin/marketplace.json'
  const marketplace = fileSet.has(MARKETPLACE) ? json(MARKETPLACE) : (fail(MARKETPLACE, 1, 'does not exist'), undefined)
  const ownMarketplace = marketplace?.name ?? 'cc-resources'
  const plugins = new Map()
  for (const file of files) {
    const name = /^plugins\/([^/]+)\/\.claude-plugin\/plugin\.json$/.exec(file)?.[1]
    if (!name) continue
    const base = `plugins/${name}/`
    const own = files.filter(path => path.startsWith(base)).map(path => path.slice(base.length))
    const pick = pattern => unique(own.map(path => pattern.exec(path)?.[1]).filter(Boolean))
    const hooks = own.includes('hooks/hooks.json') ? json(`${base}hooks/hooks.json`) ?? {} : undefined
    plugins.set(name, {
      name,
      base,
      manifestFile: file,
      manifest: json(file) ?? {},
      skills: pick(/^skills\/([^/]+)\/SKILL\.md$/),
      agents: pick(/^agents\/([^/]+)\.md$/),
      workflows: pick(/^workflows\/([^/]+)\.js$/),
      functionHooks: Array.isArray(hooks?.modules) && hooks.modules.length > 0,
      events: Object.keys(hooks?.hooks ?? {}),
      topDirs: unique(own.filter(path => path.includes('/')).map(path => path.split('/')[0])),
      deps: [],
    })
  }
  for (const plugin of plugins.values()) {
    if (plugin.manifest.name !== plugin.name) {
      fail(plugin.manifestFile, lineOf(plugin.manifestFile, '"name"'), `names the plugin ${plugin.manifest.name}, but its folder is ${plugin.base}`)
    }
    for (const dep of plugin.manifest.dependencies ?? []) {
      if (typeof dep !== 'string') {
        fail(plugin.manifestFile, lineOf(plugin.manifestFile, '"dependencies"'), `has a dependency this check cannot read: ${JSON.stringify(dep)}`)
        continue
      }
      const [name, from = ownMarketplace] = dep.split('@')
      plugin.deps.push({ name, marketplace: from, key: `${name}@${from}` })
      if (from === ownMarketplace && !plugins.has(name)) {
        fail(plugin.manifestFile, lineOf(plugin.manifestFile, `"${dep}"`), `depends on ${name}, which plugins/ does not hold`)
      }
    }
  }
  const allDeps = (plugin, seen = new Map()) => {
    for (const dep of plugin.deps) {
      if (seen.has(dep.key)) continue
      seen.set(dep.key, dep)
      if (dep.marketplace === ownMarketplace && plugins.has(dep.name)) allDeps(plugins.get(dep.name), seen)
    }
    return [...seen.values()]
  }
  const dependents = name => [...plugins.values()].filter(plugin => allDeps(plugin).some(dep => dep.key === `${name}@${ownMarketplace}`)).map(plugin => plugin.name)
  const externalNames = new Set([...plugins.values()].flatMap(plugin => allDeps(plugin)
    .filter(dep => dep.marketplace !== ownMarketplace).flatMap(dep => [dep.name, dep.marketplace])))
  const kindOf = (plugin, name) => KINDS.find(kind => plugin[kind.key].includes(name))

  // Names inside the plugin files.
  for (const plugin of plugins.values()) {
    for (const skill of plugin.skills) {
      const file = `${plugin.base}skills/${skill}/SKILL.md`
      const name = frontmatterName(read(file))
      if (name !== skill) fail(file, name ? lineOf(file, 'name:') : 1, name ? `has the name ${name}, but its folder is ${skill}` : 'has no name in its frontmatter')
    }
    for (const agent of plugin.agents) {
      const file = `${plugin.base}agents/${agent}.md`
      const name = frontmatterName(read(file))
      if (name !== agent) fail(file, name ? lineOf(file, 'name:') : 1, name ? `has the name ${name}, but its file is ${agent}.md` : 'has no name in its frontmatter')
    }
    for (const workflow of plugin.workflows) {
      const file = `${plugin.base}workflows/${workflow}.js`
      const name = /export const meta = \{[\s\S]*?\bname:\s*['"]([^'"]+)['"]/.exec(read(file))?.[1]
      if (name !== workflow) fail(file, name ? lineOf(file, 'name:') : 1, name ? `has the name ${name}, but its file is ${workflow}.js` : 'has no name in its meta')
    }
  }

  // The marketplace.
  if (marketplace) {
    const entries = Array.isArray(marketplace.plugins) ? marketplace.plugins : []
    for (const entry of entries) {
      const line = lineOf(MARKETPLACE, `"name": "${entry.name}"`)
      if (!plugins.has(entry.name)) fail(MARKETPLACE, line, `lists ${entry.name}, which plugins/ does not hold`)
      else if (entry.source !== `./plugins/${entry.name}`) fail(MARKETPLACE, line, `gives ${entry.name} the source ${entry.source}, not ./plugins/${entry.name}`)
    }
    for (const name of plugins.keys()) {
      if (!entries.some(entry => entry.name === name)) fail(MARKETPLACE, lineOf(MARKETPLACE, '"plugins"'), `does not list plugin ${name}`)
    }
    const allowed = marketplace.allowCrossMarketplaceDependenciesOn ?? []
    for (const plugin of plugins.values()) {
      for (const dep of plugin.deps) {
        if (dep.marketplace !== ownMarketplace && !allowed.includes(dep.marketplace)) {
          fail(MARKETPLACE, 1, `does not allow dependencies on ${dep.marketplace}, which ${plugin.name} depends on for ${dep.name}`)
        }
      }
    }
  }

  // The root README.
  const README = 'README.md'
  if (!fileSet.has(README)) fail(README, 1, 'does not exist')
  else {
    const lines = markdown(README)
    const firstSection = lines.findIndex(line => headingOf(line)?.[1].length === 2)
    for (const line of lines.slice(0, firstSection < 0 ? lines.length : firstSection)) {
      if (line.fenced) continue
      for (const claim of line.raw.matchAll(/\b(?:holds|has|ships|all|the) (\w+) plugins\b(:?)([^.]*)/gi)) {
        const claimed = toNumber(claim[1])
        if (claimed < 0) continue
        if (claimed !== plugins.size) fail(README, line.n, `says "${claim[1]} plugins", but plugins/ holds ${plugins.size}`)
        if (!claim[2]) continue
        const parts = claim[3].split(',').map(part => toNumber(part.trim().replace(/^and\s+/, '').split(/\s+/)[0] ?? ''))
        const sum = parts.reduce((total, part) => total + part, 0)
        if (parts.every(part => part >= 0) && sum !== plugins.size) {
          fail(README, line.n, `counts ${sum} plugins after "${claim[1]} plugins:", but plugins/ holds ${plugins.size}`)
        }
      }
    }

    const index = section(README, 2, 'Plugin Index')
    const table = index && tableIn(index.lines)
    const columns = table && ['Plugin', 'Contents', 'Depends on'].map(name => table.header.indexOf(name))
    if (!table || columns.includes(-1)) fail(README, index?.heading.n ?? 1, 'has no Plugin Index table with Plugin, Contents and Depends on columns')
    else {
      const [pluginColumn, contentsColumn, dependsColumn] = columns
      const rows = new Set()
      for (const row of table.rows) {
        const cell = row.cells[pluginColumn] ?? ''
        const name = codeSpans(cell)[0]
        const plugin = plugins.get(name)
        if (!plugin) {
          fail(README, row.n, `indexes ${name ?? cell}, which plugins/ does not hold`)
          continue
        }
        rows.add(name)
        const link = /\]\(([^)]+)\)/.exec(cell)?.[1]
        if (link !== `plugins/${name}/README.md`) fail(README, row.n, `links ${name} to ${link ?? 'nothing'}, not plugins/${name}/README.md`)

        const contents = row.cells[contentsColumn] ?? ''
        for (const kind of KINDS) {
          const have = plugin[kind.key].length
          const claims = [...contents.matchAll(COUNT)].filter(claim => claim[2].toLowerCase() === kind.noun && toNumber(claim[1]) >= 0)
          if (!claims.length && have) fail(README, row.n, `does not count ${name}'s ${PLURAL(have, kind.noun)}`)
          for (const claim of claims) {
            const claimed = toNumber(claim[1])
            if (claimed !== have) fail(README, row.n, `says "${claim[0]}" for ${name}, but ${plugin.base}${kind.key}/ holds ${have}`)
            else if ((claimed === 1) !== (claim[3] === '')) fail(README, row.n, `says "${claim[0]}" for ${name}: write "${PLURAL(have, kind.noun)}"`)
          }
        }
        if (plugin.functionHooks && !/function hooks/i.test(contents)) fail(README, row.n, `does not say ${name} has function hooks`)
        for (const event of plugin.events) if (!contents.includes(event)) fail(README, row.n, `does not name ${name}'s ${event} hook`)
        if (!plugin.functionHooks && !plugin.events.length && /\bhooks?\b/i.test(contents)) {
          fail(README, row.n, `says ${name} has hooks, but ${plugin.base}hooks/hooks.json does not exist`)
        }

        const depends = row.cells[dependsColumn] ?? ''
        const named = codeSpans(depends)
        const reached = allDeps(plugin)
        const allowedNames = new Set([...reached.map(dep => dep.name), ...reached.filter(dep => dep.marketplace !== ownMarketplace).map(dep => dep.marketplace)])
        if (!plugin.deps.length && depends !== 'Nothing') fail(README, row.n, `says ${name} depends on "${depends}", but its plugin.json has no dependencies`)
        for (const dep of plugin.deps) if (!named.includes(dep.name)) fail(README, row.n, `does not name ${name}'s dependency ${dep.name}`)
        for (const token of named) if (!allowedNames.has(token)) fail(README, row.n, `names ${token} as a dependency of ${name}, which its plugin.json does not reach`)
      }
      for (const name of plugins.keys()) if (!rows.has(name)) fail(README, index.heading.n, `Plugin Index has no row for ${name}`)
    }

    const external = section(README, 2, 'External Dependencies')
    if (!external) fail(README, 1, 'has no External Dependencies section')
    else {
      const tables = new Map()
      external.lines.forEach((line, i) => {
        const heading = headingOf(line)
        if (!heading || heading[1].length !== 3) return
        const rest = external.lines.slice(i + 1)
        const end = rest.findIndex(next => headingOf(next))
        const found = tableIn(end < 0 ? rest : rest.slice(0, end))
        if (found) tables.set(heading[2], { heading: line, ...found })
      })
      // A Needed by cell names plugins, their dependencies, and a skill, agent or workflow of the plugin named before it.
      const neededBy = (table, row) => {
        const column = table.header.indexOf('Needed by')
        const found = { plugins: [], parts: [] }
        let owner
        for (const token of codeSpans(row.cells[column] ?? '')) {
          if (plugins.has(token)) {
            owner = plugins.get(token)
            found.plugins.push(token)
          } else if (externalNames.has(token)) continue
          else if (owner && kindOf(owner, token)) found.parts.push({ plugin: owner.name, name: token, kind: kindOf(owner, token) })
          else fail(README, row.n, owner ? `names ${token} after ${owner.name}, which has no skill, agent or workflow by that name` : `names ${token}, which is no plugin here and no dependency of one`)
        }
        found.plugins = unique(found.plugins)
        return found
      }
      for (const table of tables.values()) {
        if (table.header.includes('Needed by')) for (const row of table.rows) neededBy(table, row)
      }

      const features = tables.get('Claude Code Features')
      const row = (table, label) => {
        const found = table.rows.find(candidate => candidate.cells[table.header.indexOf('Dependency')] === label)
        if (!found) fail(README, table.heading.n, `${table.heading.raw.replace(/^#+\s*/, '')} has no "${label}" row`)
        return found
      }
      const expectNeededBy = (table, label, expected) => {
        const found = row(table, label)
        if (!found) return undefined
        const needed = neededBy(table, found)
        if (!sameList(needed.plugins, unique(expected))) fail(README, found.n, `says "${label}" is needed by ${listed(needed.plugins)}, but the tree says ${listed(unique(expected))}`)
        return { row: found, needed }
      }
      if (!features) fail(README, external.heading.n, 'has no Claude Code Features table')
      else {
        const all = [...plugins.values()]
        expectNeededBy(features, 'Plugin dependencies', all.filter(plugin => plugin.deps.length).map(plugin => plugin.name))
        const hooked = all.filter(plugin => plugin.functionHooks).map(plugin => plugin.name)
        expectNeededBy(features, 'Function hooks', [...hooked, ...hooked.flatMap(dependents)])
        const workflowTool = expectNeededBy(features, 'The Workflow tool', all.filter(plugin => plugin.workflows.length).map(plugin => plugin.name))
        if (workflowTool) {
          const named = workflowTool.needed.parts
          for (const plugin of all) {
            for (const workflow of plugin.workflows) {
              if (!named.some(part => part.plugin === plugin.name && part.name === workflow)) fail(README, workflowTool.row.n, `does not name ${plugin.name}'s ${workflow} as needing the Workflow tool`)
            }
          }
          for (const part of named) if (part.kind.key !== 'workflows') fail(README, workflowTool.row.n, `names ${part.plugin}'s ${part.name}, a ${part.kind.noun}, as needing the Workflow tool`)
        }
      }

      const packages = tables.get('Plugins and Marketplaces')
      if (!packages) fail(README, external.heading.n, 'has no Plugins and Marketplaces table')
      else {
        const expected = new Map()
        const need = (label, name) => expected.set(label, unique([...(expected.get(label) ?? []), name]))
        for (const plugin of plugins.values()) {
          for (const dep of allDeps(plugin)) {
            need(`\`${dep.key}\``, plugin.name)
            if (dep.marketplace !== ownMarketplace) need(`The \`${dep.marketplace}\` marketplace`, plugin.name)
          }
        }
        const column = packages.header.indexOf('Dependency')
        const seen = new Set()
        for (const found of packages.rows) {
          const label = found.cells[column] ?? ''
          seen.add(label)
          if (!expected.has(label)) {
            fail(README, found.n, `lists ${label} under Plugins and Marketplaces, which no plugin's plugin.json reaches`)
            continue
          }
          const needed = neededBy(packages, found)
          if (!sameList(needed.plugins, expected.get(label))) fail(README, found.n, `says "${label}" is needed by ${listed(needed.plugins)}, but the tree says ${listed(expected.get(label))}`)
        }
        for (const label of expected.keys()) if (!seen.has(label)) fail(README, packages.heading.n, `Plugins and Marketplaces has no row for ${label}`)
      }
    }
  }

  // Each plugin's README.
  const repoTop = new Set(files.filter(file => file.includes('/')).map(file => file.split('/')[0]))
  const checkPaths = (file, plugin) => {
    for (const line of markdown(file)) {
      if (line.fenced) continue
      // A path that is a link's text is the link check's to judge.
      for (const span of codeSpans(line.raw.replace(LINK, ''))) {
        for (const word of span.split(/\s+/)) {
          const path = word.replace(/[.,;]+$/, '')
          if (!path.includes('/') || /^[./~]/.test(path) || /[<>*{}$:()[\]"'=@]/.test(path)) continue
          // A plugin README's path is the plugin's own or the repository's, whichever folder its first part names.
          const first = path.split('/')[0]
          const bases = [plugin?.topDirs.includes(first) && plugin.base, repoTop.has(first) && ''].filter(base => base !== false && base !== undefined)
          if (!bases.length) continue
          counts.readmePaths++
          if (bases.some(base => exists(base + path))) continue
          const where = bases.map(base => base || 'the repository')
          fail(file, line.n, `names ${path}, which ${where.length > 1 ? `neither ${where.join(' nor ')} holds` : `${where[0]} does not hold`}`)
        }
      }
    }
  }
  if (fileSet.has(README)) checkPaths(README)
  for (const plugin of plugins.values()) {
    const file = `${plugin.base}README.md`
    if (!fileSet.has(file)) {
      fail(file, 1, 'does not exist')
      continue
    }
    checkPaths(file, plugin)
    for (const kind of KINDS) {
      const have = plugin[kind.key]
      const found = section(file, 2, kind.heading)
      if (!found) {
        if (have.length) fail(file, 1, `has no ${kind.heading} section for its ${PLURAL(have.length, kind.noun)}`)
        continue
      }
      if (!have.length) {
        fail(file, found.heading.n, `has the section ${kind.heading}, but ${plugin.base}${kind.key}/ holds none`)
        continue
      }
      const table = tableIn(found.lines)
      if (!table) {
        fail(file, found.heading.n, `has no ${kind.heading} table`)
        continue
      }
      const names = new Set()
      for (const entry of table.rows) {
        const token = codeSpans(entry.cells[0] ?? '')[0]?.split(/\s+/)[0].replace(/^\//, '')
        if (!token) {
          fail(file, entry.n, `has a ${kind.heading} row with no name in code`)
          continue
        }
        const [space, name] = token.includes(':') ? token.split(':') : [plugin.name, token]
        if (space !== plugin.name) fail(file, entry.n, `lists ${token} under ${kind.heading}, outside the ${plugin.name} namespace`)
        names.add(name)
        if (!have.includes(name)) fail(file, entry.n, `lists ${kind.noun} ${name}, which ${plugin.base}${kind.key}/ does not hold`)
      }
      for (const name of have) if (!names.has(name)) fail(file, found.heading.n, `does not list ${kind.noun} ${name}`)
    }
    for (const event of plugin.events) if (!read(file).includes(event)) fail(file, 1, `does not name its ${event} hook`)
    const layout = section(file, 2, 'Layout')
    if (layout) {
      const entries = layout.lines.filter(line => line.fenced).map(line => ({ n: line.n, path: /^[├└]── (\S+)/.exec(line.raw)?.[1] })).filter(entry => entry.path)
      for (const entry of entries) if (!exists(plugin.base + entry.path)) fail(file, entry.n, `lays out ${entry.path}, which ${plugin.base} does not hold`)
      const covered = new Set(entries.map(entry => entry.path.split('/')[0]))
      for (const dir of plugin.topDirs) if (!covered.has(dir)) fail(file, layout.heading.n, `Layout does not list ${dir}/`)
    }
  }

  // Every Markdown file: relative links and their anchors, and plugin skills or workflows named without their plugin.
  const slashNames = new Map()
  for (const plugin of plugins.values()) {
    for (const name of [...plugin.skills, ...plugin.workflows]) slashNames.set(name, [...(slashNames.get(name) ?? []), plugin.name])
  }
  const markdownFiles = files.filter(file => file.endsWith('.md'))
  for (const file of markdownFiles) {
    for (const line of markdown(file)) {
      if (line.fenced) continue
      const prose = line.raw.replace(/(`+)[\s\S]*?\1/g, code => ' '.repeat(code.length))
      for (const match of prose.matchAll(LINK)) {
        const href = match[1]
        if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//')) continue
        counts.links++
        const [target, anchor] = href.split('#')
        let path = file
        if (target) {
          try {
            path = posix.normalize(posix.join(posix.dirname(file), decodeURI(target))).replace(/\/$/, '')
          } catch {
            path = target
          }
        }
        if (!exists(path)) fail(file, line.n, `links to ${href}, which does not exist`)
        else if (anchor !== undefined && path.endsWith('.md') && !anchorsOf(markdown(path)).has(anchor)) fail(file, line.n, `links to ${href}, but ${path} has no heading with that anchor`)
      }
    }
    for (const match of read(file).matchAll(SLASH)) {
      const owners = slashNames.get(match[1])
      if (owners) fail(file, lineAt(file, match.index), `names /${match[1]}, which Claude Code calls ${owners.map(owner => `/${owner}:${match[1]}`).join(' or ')}`)
    }
  }

  // Every plugin file and every Markdown file: <plugin>:<name> names, and the ${CLAUDE_PLUGIN_ROOT} paths of a plugin's
  // own files. The repository's own tooling ships with no plugin, so its fixtures may name what does not exist.
  const namespaced = new RegExp(`(?<![\\w.@-])(${[...plugins.keys()].join('|')}):([a-z][a-z0-9-]*)`, 'g')
  for (const file of files.filter(path => TEXT.test(path) && (path.startsWith('plugins/') || path.endsWith('.md')))) {
    if (plugins.size) {
      for (const match of read(file).matchAll(namespaced)) {
        const [whole, space, name] = match
        if (NOT_COMPONENTS.has(whole)) continue
        counts.namespaced++
        if (!kindOf(plugins.get(space), name)) fail(file, lineAt(file, match.index), `names ${whole}, but ${space} has no skill, agent or workflow ${name}`)
      }
    }
    const owner = plugins.get(/^plugins\/([^/]+)\//.exec(file)?.[1])
    if (!owner) continue
    for (const match of read(file).matchAll(PLUGIN_ROOT_PATH)) {
      const path = match[1].replace(/[.,;:]+$/, '')
      if (!path || /[<>*{}$]/.test(path)) continue
      counts.pluginRootPaths++
      if (!exists(owner.base + path)) fail(file, lineAt(file, match.index), `names \${CLAUDE_PLUGIN_ROOT}/${path}, which ${owner.base} does not hold`)
    }
  }

  const all = [...plugins.values()]
  const total = key => all.reduce((sum, plugin) => sum + plugin[key].length, 0)
  const summary = [
    `tree: ${PLURAL(plugins.size, 'plugin')}, ${PLURAL(total('skills'), 'skill')}, ${PLURAL(total('agents'), 'agent')}, ` +
      `${PLURAL(total('workflows'), 'workflow')}, hooks in ${listed(all.filter(plugin => plugin.functionHooks || plugin.events.length).map(plugin => plugin.name))}`,
    `docs: ${PLURAL(markdownFiles.length, 'Markdown file')}, ${PLURAL(counts.links, 'relative link')}, ${PLURAL(counts.namespaced, 'namespaced name')}, ` +
      `${PLURAL(counts.pluginRootPaths, 'plugin-root path')}, ${PLURAL(counts.readmePaths, 'README path')}`,
  ]
  return { problems, summary }
}

const invoked = process.argv[1] && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))
if (invoked) {
  const root = resolve(process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..'))
  const { problems, summary } = checkDocs(root)
  for (const line of summary) console.log(line)
  for (const problem of problems) console.log(`FAIL ${problem}`)
  console.log(PLURAL(problems.length, 'problem'))
  process.exitCode = problems.length ? 1 : 0
}
