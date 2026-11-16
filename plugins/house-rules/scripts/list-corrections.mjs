#!/usr/bin/env node
// Prints what the person said to the agents in one project's Claude Code
// transcripts, each message with the tool calls the agent made just before it,
// oldest first. `/house-rules:correct` reads it to find repeated corrections.
//
//   node list-corrections.mjs [<project folder>] [--since YYYY-MM-DD] [--max N]
//
// It reads only the given project's own transcripts folder (the current
// folder by default), never another project's. Exits 2 when it finds no
// transcripts folder for the project.

import { readdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { correctionsIn, format, transcriptFolderName } from './corrections.mjs'

const args = process.argv.slice(2)
const option = name => {
  const index = args.indexOf(name)
  if (index === -1) return undefined
  const [value] = args.splice(index, 2).slice(1)
  return value
}
const since = option('--since') ?? ''
const max = Number(option('--max') ?? 150)
if (!/^(?:\d{4}-\d{2}-\d{2})?$/.test(since) || !Number.isInteger(max) || max < 1 || args.length > 1) {
  console.error('usage: node list-corrections.mjs [<project folder>] [--since YYYY-MM-DD] [--max N]')
  process.exit(2)
}

const project = resolve(args[0] ?? process.cwd())
const config = process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude')
const folder = join(config, 'projects', transcriptFolderName(project))

let files
try {
  files = readdirSync(folder).filter(name => name.endsWith('.jsonl'))
} catch {
  console.error(`No transcripts folder for ${project} at ${folder}.`)
  process.exit(2)
}

const records = files
  .flatMap(name => correctionsIn(readFileSync(join(folder, name), 'utf8').split('\n'), name.slice(0, 8)))
  .filter(record => record.at >= since)
  .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0))
  .slice(-max)

console.log(format(records, project))
