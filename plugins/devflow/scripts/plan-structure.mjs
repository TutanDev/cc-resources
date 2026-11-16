// Checks a devflow feature plan against the structure its contract,
// references/feature-plan.md, gives it: the header, the nine sections in
// order, the Out of scope list, each use case's and each phase's fields, the
// ids, every use case traced through §4.3, §6 and §7.2, the questions in §8,
// the rounds in §9, and what the plan's status demands.
//
// It is pure: it takes the plan's text and returns the problems, each with its
// line and what to fix, so the command line (check-plan.mjs), the devflow
// hooks and the tests share it. It reads no file and imports nothing, since a
// hooks module has no Node. A message never names a line number, so a problem
// keeps its message when an edit above it moves it.

const STATUSES = ['draft', 'reviewed', 'approved', 'in-progress', 'done']
const DATE = /^\d{4}-\d{2}-\d{2}$/

const SECTIONS = [
  { name: 'Goal' },
  { name: 'Scope' },
  { name: 'Use Cases' },
  { name: 'Architecture Impact', subsections: ['4.1 Services', '4.2 Volatility', '4.3 Call Chains', '4.4 Messaging'] },
  { name: 'Domain Model Impact', subsections: ['5.1 Types', '5.2 Workflows', '5.3 Errors', '5.4 Boundaries'] },
  { name: 'Phases' },
  { name: 'Verification', subsections: ['7.1 Commands', '7.2 Scenarios'] },
  { name: 'Risks, Assumptions and Open Questions', subsections: ['Risks', 'Assumptions', 'Open Questions'], optional: ['Settled by Probe'] },
  { name: 'Decision Log' },
]

const USE_CASE_FIELDS = ['Trigger', 'Steps', 'Outcome', 'Failures']
const USE_CASE_HINTS = {
  Trigger: 'the actor or event that starts it',
  Steps: 'the main path, as the user or system sees it',
  Outcome: 'what is true when it succeeds',
  Failures: 'each way it can fail, and what the user sees',
}
const PHASE_FIELDS = ['Goal', 'Depends on', 'Changes', 'Acceptance criteria', 'Tests', 'Status']
const PHASE_HINTS = {
  Goal: 'what works after this phase that did not before',
  'Depends on': 'the earlier phases it needs, or none',
  Changes: 'the services, types and files to add or change, citing §4 and §5',
  'Acceptance criteria': 'one `AC-<phase>.<n>` sub-item per observable statement an agent can check',
  Tests: 'the tests to add or change, one line each with its kind',
  Status: 'pending, until the implementation workflow sets done',
}
const OPEN_FIELDS = ['Options', 'Recommendation', 'Depends on it']
const SETTLED_FIELDS = ['Observed', 'Evidence', 'Decision']

const FENCE = /^\s{0,3}(`{3,}|~{3,})/
const BULLET = /^[-*]\s+\S/
const SUB_BULLET = /^\s+[-*]\s+\S/

const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const names = (text, id) => new RegExp(`\\b${escape(id)}\\b`).test(text)
const isBlank = line => line.raw.trim() === ''
const shown = text => (text.length > 60 ? `${text.slice(0, 57)}...` : text)

// Every line with its number, whether a code fence holds it, and its heading
// level and title when it is a heading outside a fence.
const parse = text => {
  let fence = null
  return text.split(/\r?\n/).map((raw, i) => {
    const marker = raw.match(FENCE)
    let fenced = fence !== null
    if (marker && fence === null) {
      fence = marker[1][0]
      fenced = true
    } else if (marker && marker[1][0] === fence) {
      fence = null
    }
    const heading = fenced ? null : raw.match(/^(#{1,6})\s+(.*?)\s*$/)
    return { no: i + 1, raw, fenced, level: heading ? heading[1].length : 0, title: heading ? heading[2] : '' }
  })
}

// The headings of `level` between `start` and `end`, each with the lines it
// holds: up to the next heading of the same level or above.
const spansAt = (lines, start, end, level) => {
  const spans = []
  for (let i = start; i < end; i++) {
    if (lines[i].level !== level) continue
    let next = i + 1
    while (next < end && !(lines[next].level > 0 && lines[next].level <= level)) next++
    spans.push({ head: i, title: lines[i].title, line: lines[i].no, start: i + 1, end: next })
  }
  return spans
}

const bodyOf = (lines, span) => lines.slice(span.start, span.end)
const textOf = (lines, span) => bodyOf(lines, span).map(line => line.raw).join('\n')

export function checkPlan(text) {
  const lines = parse(text)
  const problems = []
  const add = (line, message) => {
    if (!problems.some(p => p.line === line && p.message === message)) problems.push({ line, message })
  }

  // Each field is a top-level item `- **<Field>:**`, in the order given.
  const fields = (span, label, order, hints) => {
    const body = bodyOf(lines, span).filter(line => !line.fenced)
    const found = {}
    let last = -1
    let ordered = true
    for (const name of order) {
      const at = body.findIndex(line => line.raw.startsWith(`- **${name}:**`))
      if (at < 0) {
        add(span.line, `${label} lacks \`- **${name}:**\`: ${hints[name]}.`)
        continue
      }
      if (at < last) ordered = false
      last = Math.max(last, at)
      found[name] = { line: body[at].no, text: body[at].raw.slice(`- **${name}:**`.length).trim(), index: body[at].no - 1 }
    }
    if (!ordered) add(span.line, `${label}'s fields go in the order ${order.join(', ')}.`)
    return found
  }

  // ---------- header ----------
  const first = lines.findIndex(line => !isBlank(line))
  if (first < 0) return [{ line: 1, message: 'The plan is empty: start from references/plan-template.md.' }]
  if (!/^# Plan:\s*\S/.test(lines[first].raw)) add(lines[first].no, 'The plan opens with its title, `# Plan: <Feature Title>`.')
  let at = first + 1
  while (at < lines.length && isBlank(lines[at])) at++
  const quote = []
  while (at < lines.length && lines[at].raw.startsWith('>')) quote.push(lines[at++])
  const headerLine = quote.length ? quote[quote.length - 1].no : lines[first].no
  const headerField = name => {
    const index = quote.findIndex(line => new RegExp(`^>\\s*${name}:`).test(line.raw))
    return index < 0 ? undefined : { index, line: quote[index].no, text: quote[index].raw.replace(new RegExp(`^>\\s*${name}:`), '').trim() }
  }
  const source = headerField('Source')
  const statusField = headerField('Status')
  const revision = headerField('Revision')
  if (!source) add(headerLine, 'The header lacks `> Source:`: put it under the title, with the request in one line, then every file the plan was built from.')
  else if (!source.text) add(source.line, '`> Source:` is empty: give the request in one line, then every file the plan was built from.')
  if (!statusField) add(headerLine, 'The header lacks `> Status:`: put it after `> Source:`, as draft, reviewed, approved, in-progress or done.')
  else if (!STATUSES.includes(statusField.text)) add(statusField.line, `\`> Status: ${shown(statusField.text)}\` is no status: use draft, reviewed, approved, in-progress or done.`)
  if (!revision) add(headerLine, 'The header lacks `> Revision: <n>, <YYYY-MM-DD>`: put it after `> Status:`.')
  else {
    const value = revision.text.match(/^(\d+),\s*(\S+)$/)
    if (!value || !DATE.test(value[2])) add(revision.line, '`> Revision:` reads `<n>, <YYYY-MM-DD>`, such as `3, 2026-11-16`.')
  }
  const indices = [source, statusField, revision].filter(Boolean).map(field => field.index)
  if (indices.some((index, i) => i > 0 && index < indices[i - 1])) add(headerLine, 'The header lines go in the order Source, Status, Revision.')
  const status = statusField && STATUSES.includes(statusField.text) ? statusField.text : undefined

  // ---------- the nine sections ----------
  const sections = new Map()
  let highest = 0
  for (const span of spansAt(lines, 0, lines.length, 2)) {
    const numbered = span.title.match(/^(\d+)\.\s+(.+)$/)
    if (!numbered) {
      add(span.line, `\`## ${shown(span.title)}\` is not one of the plan's nine sections: move what it holds into the section that owns it.`)
      continue
    }
    const n = Number(numbered[1])
    const spec = SECTIONS[n - 1]
    if (!spec) {
      add(span.line, `§${n} does not exist: a plan has nine sections, numbered 1 to 9.`)
      continue
    }
    if (numbered[2] !== spec.name && !numbered[2].startsWith(`${spec.name} (`)) add(span.line, `§${n} is named ${spec.name}: write \`## ${n}. ${spec.name}\`.`)
    if (sections.has(n)) {
      add(span.line, `§${n} appears twice: merge the two.`)
      continue
    }
    if (n < highest) add(span.line, `§${n} comes after §${highest}: the sections go in order, 1 to 9.`)
    highest = Math.max(highest, n)
    sections.set(n, span)
    if (bodyOf(lines, span).every(isBlank)) add(span.line, `§${n} is empty: a section that does not apply stays, with one line saying why.`)
  }
  SECTIONS.forEach((spec, i) => {
    const n = i + 1
    if (sections.has(n)) return
    const next = [...sections.keys()].filter(k => k > n).sort((a, b) => a - b)[0]
    const line = next === undefined ? lines.length : sections.get(next).line
    add(line, `§${n} ${spec.name} is missing: add \`## ${n}. ${spec.name}\` ${n === 1 ? 'after the header' : `after §${n - 1}`}; a section that does not apply stays, with one line saying why.`)
  })

  const subsections = n => {
    const span = sections.get(n)
    if (!span) return {}
    const spec = SECTIONS[n - 1]
    const allowed = [...spec.subsections, ...(spec.optional ?? [])]
    const found = {}
    let last = -1
    for (const sub of spansAt(lines, span.start, span.end, 3)) {
      const index = allowed.indexOf(sub.title)
      if (index < 0) {
        add(sub.line, `\`### ${shown(sub.title)}\` is not a subsection of §${n}: its subsections are ${allowed.map(name => `\`### ${name}\``).join(', ')}.`)
        continue
      }
      if (found[sub.title]) {
        add(sub.line, `\`### ${sub.title}\` appears twice in §${n}: merge the two.`)
        continue
      }
      if (index < last) add(sub.line, `\`### ${sub.title}\` is out of order: §${n}'s subsections go ${allowed.join(', ')}.`)
      last = Math.max(last, index)
      found[sub.title] = sub
      if (bodyOf(lines, sub).every(isBlank)) add(sub.line, `\`### ${sub.title}\` is empty: a part that does not apply stays, with one line saying why.`)
    }
    for (const name of spec.subsections) {
      if (!found[name]) add(span.line, `§${n} lacks \`### ${name}\`: add it in its place; a part that does not apply stays, with one line saying why.`)
    }
    return found
  }

  // ---------- §2 Scope ----------
  const scope = sections.get(2)
  if (scope) {
    const body = bodyOf(lines, scope).filter(line => !line.fenced)
    const isLabel = line => /^\*\*[^*]+\*\*:?$/.test(line.raw.trim())
    for (const name of ['In scope', 'Out of scope']) {
      const index = body.findIndex(line => new RegExp(`^\\*\\*${name}:?\\*\\*:?$`, 'i').test(line.raw.trim()))
      if (index < 0) {
        add(scope.line, `§2 has no **${name}** list: add the label, then at least one item.${name === 'Out of scope' ? ' Reviewers and the judge use it to reject scope creep.' : ''}`)
        continue
      }
      let next = index + 1
      while (next < body.length && !isLabel(body[next])) next++
      if (!body.slice(index + 1, next).some(line => BULLET.test(line.raw))) add(body[index].no, `§2's **${name}** list is empty: add at least one item.`)
    }
  }

  // ---------- §3 Use Cases ----------
  const useCases = []
  const useCaseSection = sections.get(3)
  if (useCaseSection) {
    for (let i = useCaseSection.start; i < useCaseSection.end; i++) {
      const line = lines[i]
      if (line.level < 3) continue
      const heading = line.title.match(/^UC-(\d+):\s*(\S.*)?$/)
      if (!heading || !heading[2]) {
        if (/^UC\b/.test(line.title) || line.level === 3) add(line.no, `\`${'#'.repeat(line.level)} ${shown(line.title)}\` is not a use case heading: write \`### UC-<n>: <name>\`.`)
        continue
      }
      const id = `UC-${heading[1]}`
      if (useCases.some(useCase => useCase.id === id)) {
        add(line.no, `${id} appears twice in §3: a new use case takes the next free number.`)
        continue
      }
      useCases.push({ id, line: line.no })
      const span = spansAt(lines, i, useCaseSection.end, line.level)[0]
      fields(span, id, USE_CASE_FIELDS, USE_CASE_HINTS)
    }
  }

  // ---------- §4 and §5 ----------
  const architecture = subsections(4)
  subsections(5)
  const chains = architecture['4.3 Call Chains']
  if (chains) {
    const text = textOf(lines, chains)
    for (const useCase of useCases) {
      if (!names(text, useCase.id)) add(chains.line, `§4.3 has no call chain for ${useCase.id}: add its chain, hop by hop.`)
    }
  }

  // ---------- §6 Phases ----------
  const phases = []
  const criteria = new Set()
  const phaseSection = sections.get(6)
  if (phaseSection) {
    const spans = spansAt(lines, phaseSection.start, phaseSection.end, 3)
    if (!spans.length) add(phaseSection.line, '§6 has no phase: add `### Phase 1: <name>`, in the shape the contract gives.')
    for (const span of spans) {
      const heading = span.title.match(/^Phase (\d+):\s*(\S.*)?$/)
      if (!heading || !heading[2]) {
        add(span.line, `\`### ${shown(span.title)}\` is not a phase heading: write \`### Phase <n>: <name>\`.`)
        continue
      }
      const n = Number(heading[1])
      if (phases.some(phase => phase.n === n)) {
        add(span.line, `Phase ${n} appears twice: each phase has its own number.`)
        continue
      }
      if (!phases.length && n !== 1) add(span.line, `The first phase is Phase ${n}: number the phases from 1.`)
      if (phases.length && n < phases[phases.length - 1].n) add(span.line, `Phase ${n} comes after Phase ${phases[phases.length - 1].n}: the phases go in order.`)
      const label = `Phase ${n}`
      const found = fields(span, label, PHASE_FIELDS, PHASE_HINTS)
      const phase = { n, line: span.line, done: false }
      phases.push(phase)

      if (found.Status) {
        phase.status = found.Status
        phase.done = /^done\.?$/.test(found.Status.text)
        if (!/^(pending|done)\.?$/.test(found.Status.text)) add(found.Status.line, `${label}'s Status is \`${shown(found.Status.text)}\`: it is pending or done.`)
      }

      if (found['Depends on'] && !/^none\.?$/i.test(found['Depends on'].text)) {
        const refs = [...found['Depends on'].text.matchAll(/\bPhases?\s+(\d+(?:\s*(?:,|and|&|or)\s*\d+)*)/gi)].flatMap(match => match[1].match(/\d+/g).map(Number))
        if (!refs.length) add(found['Depends on'].line, `${label}'s Depends on names no phase: write none, or the earlier phases it needs, such as \`Phase 1\`.`)
        phase.depends = { line: found['Depends on'].line, refs }
      }

      const criteriaField = found['Acceptance criteria']
      if (criteriaField) {
        let end = criteriaField.index + 1
        while (end < span.end && !lines[end].raw.startsWith('- **') && lines[end].level === 0) end++
        const items = lines.slice(criteriaField.index + 1, end).filter(line => !line.fenced && SUB_BULLET.test(line.raw))
        if (!items.length) add(criteriaField.line, `${label} has no acceptance criterion: add a sub-item \`AC-${n}.1\`, an observable statement an agent can check.`)
        for (const item of items) {
          const id = item.raw.match(/^\s+[-*]\s+`(AC-(\d+)\.(\d+))`\s*\S/)
          if (!id) {
            add(item.no, `An acceptance criterion opens with its id in code, then the statement: \`AC-${n}.<m>\` <statement>.`)
            continue
          }
          if (Number(id[2]) !== n) add(item.no, `\`${id[1]}\` is in ${label}: a criterion's id starts with its phase's number, \`AC-${n}.<m>\`.`)
          if (criteria.has(id[1])) add(item.no, `\`${id[1]}\` is used twice: a new criterion takes the next free number.`)
          criteria.add(id[1])
        }
      }
    }
    for (const phase of phases) {
      for (const k of phase.depends?.refs ?? []) {
        if (k >= phase.n) add(phase.depends.line, `Phase ${phase.n} depends on Phase ${k}, which is not earlier: a phase depends only on earlier phases.`)
        else if (!phases.some(other => other.n === k)) add(phase.depends.line, `Phase ${phase.n} depends on Phase ${k}, which does not exist.`)
      }
    }
    const text = textOf(lines, phaseSection)
    for (const useCase of useCases) {
      if (!names(text, useCase.id)) add(phaseSection.line, `${useCase.id} is completed by no phase: name it in the Goal of the phase that completes it.`)
    }
  }

  // ---------- §7 Verification ----------
  const verification = subsections(7)
  const commands = verification['7.1 Commands']
  if (commands && !bodyOf(lines, commands).some(line => line.fenced && !FENCE.test(line.raw) && !isBlank(line))) {
    add(commands.line, '§7.1 has no command: put the build and test commands in a code block.')
  }
  const scenarios = verification['7.2 Scenarios']
  if (scenarios) {
    const body = bodyOf(lines, scenarios).filter(line => !line.fenced)
    if (!body.some(line => /^\d+\.\s+\S/.test(line.raw))) add(scenarios.line, '§7.2 has no scenario: add a numbered scenario for the main path of every use case.')
    const text = textOf(lines, scenarios)
    for (const useCase of useCases) {
      if (!names(text, useCase.id)) add(scenarios.line, `${useCase.id} has no scenario in §7.2: add one that covers its main path, and name it as \`(${useCase.id})\`.`)
    }
  }

  // ---------- §8 questions ----------
  const risks = subsections(8)
  const questions = (span, order, hints) => {
    if (!span) return []
    const body = bodyOf(lines, span)
    const items = []
    body.forEach((line, i) => {
      if (line.fenced || !BULLET.test(line.raw) || /^[-*]\s+(?:none|no\b)/i.test(line.raw)) return
      const item = line.raw.match(/^[-*]\s+`(Q-(\d+))`\s*(\S.*)?$/)
      if (!item || !item[3]) {
        add(line.no, `\`${shown(line.raw.trim())}\` is not a question: write \`- \`Q-<n>\` <question>\`, with its fields as sub-items.`)
        return
      }
      items.push({ id: item[1], line: line.no, i })
    })
    items.forEach((item, k) => {
      const end = k + 1 < items.length ? items[k + 1].i : body.length
      const sub = body.slice(item.i + 1, end).filter(line => !line.fenced)
      for (const name of order) {
        if (!sub.some(line => new RegExp(`^\\s+[-*]\\s+\\*\\*${escape(name)}:\\*\\*`).test(line.raw))) add(item.line, `${item.id} lacks \`**${name}:**\`: ${hints[name]}.`)
      }
    })
    return items
  }
  const open = questions(risks['Open Questions'], OPEN_FIELDS, {
    Options: 'the choices, separated by semicolons',
    Recommendation: 'the option to take, and why',
    'Depends on it': 'the sections or phases its answer changes',
  })
  const settled = questions(risks['Settled by Probe'], SETTLED_FIELDS, {
    Observed: 'what the probe showed',
    Evidence: 'the command, and the output that decided it',
    Decision: 'the option it picks, and the sections it was applied in',
  })
  const asked = new Set()
  for (const question of [...open, ...settled]) {
    if (asked.has(question.id)) add(question.line, `${question.id} appears twice in §8: a new question takes the next free number.`)
    asked.add(question.id)
  }

  // ---------- §9 Decision Log ----------
  const rounds = []
  const log = sections.get(9)
  const logText = log ? textOf(lines, log) : ''
  if (log) {
    for (const line of bodyOf(lines, log)) {
      if (line.level !== 4 || !/^Round\b/.test(line.title)) continue
      const round = line.title.match(/^Round (\d+), (\S+) \((.+)\)$/)
      if (!round || !DATE.test(round[2])) {
        add(line.no, 'A round\'s heading is `#### Round <n>, <YYYY-MM-DD> (<report file name>)`.')
        continue
      }
      const n = Number(round[1])
      const expected = rounds.length + 1
      if (n !== expected) add(line.no, `Round ${n} is logged where round ${expected} belongs: rounds are numbered one after another, from 1.`)
      rounds.push(n)
    }
  }
  const answered = new Set([...logText.matchAll(/\b(Q-\d+) (?:answered|settled by probe),/g)].map(match => match[1]))
  for (const question of open) {
    if (answered.has(question.id)) add(question.line, `${question.id} is still open in §8, but §9 records it answered: move it out of Open Questions.`)
  }

  // ---------- what the status demands ----------
  if (status === 'approved') {
    for (const question of open) add(question.line, `${question.id} is open, and an approved plan has no open question: get the user's answer, or set the status back to reviewed.`)
    if (!/Approved by the user, \d{4}-\d{2}-\d{2}\./.test(logText)) add(statusField.line, 'The plan is approved, but §9 records no `Approved by the user, <YYYY-MM-DD>.`: only the user approves a plan, and §9 records it.')
  }
  if (status === 'reviewed' && !rounds.length) add(statusField.line, 'The plan is reviewed, but §9 logs no review round: it stays draft until a round is logged.')
  if (['draft', 'reviewed', 'approved'].includes(status)) {
    for (const phase of phases.filter(phase => phase.done)) add(phase.status.line, `Phase ${phase.n} is done, but the plan is ${status}: only the implementation workflow sets done, once the plan is in progress.`)
  }
  if (status === 'in-progress' && phases.length && !phases.some(phase => phase.done)) add(statusField.line, 'The plan is in-progress, but no phase is done: it is approved until the first phase is.')
  if (status === 'done') {
    for (const phase of phases.filter(phase => phase.status && !phase.done)) add(phase.status.line, `Phase ${phase.n} is not done, but the plan is done: every phase of a done plan is done.`)
  }

  return problems.sort((a, b) => a.line - b.line)
}
