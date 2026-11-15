# verification

A Claude Code plugin that gives a project a scripted way to drive its real app the way a user does, and to keep the proof.
It writes a project-local skill, `.claude/skills/verify-<app>/`, that launches the app, checks it is healthy, drives it, captures evidence and cleans up, with a map of the app's user-facing features, and it keeps that skill true as the app changes.

A bug fix starts from reproducing the bug end to end, and a change to what an app draws is looked at before it is called done.
Both need a way to run the product, which no other plugin in this marketplace has: their reviewers read code, and `lowy`'s fitness tests check architecture rules over compiled assemblies, not behavior.

It is adapted from pstack's verification skills (see [Sources](#sources)), rebuilt for Claude Code, with drive recipes for .NET desktop apps that draw with their own renderer and for Unity.

## Install

```
claude plugin marketplace add TutanDev/cc-resources
claude plugin install verification@cc-resources
```

Then run `/reload-plugins` or start a new session.
It depends on no other plugin.

## Skills

| Skill | Role |
|---|---|
| `create` | Interviews the repository, writes `verify-<app>` and seeds its feature map, then runs the skill's own steps once, end to end, before handing it over |
| `maintain` | Reads every feature's source in parallel, drives every feature live, and ends clean, changed (one change of proven corrections) or blocked |

## Agents

| Agent | Role |
|---|---|
| `verification:feature-reader` | Read-only: explains one feature from the source, cites where its feature file drifted, and returns one recipe to drive it |

## Quick Start

| You want to... | Say |
|---|---|
| Give a repository a verification skill | `/verification:create` |
| Verify one surface of a repository that has several | `/verification:create <the surface>` |
| Bring a verification skill back in step with the app | `/verification:maintain` |
| Reproduce a bug or prove a change in the running app | Ask for it: the project's `verify-<app>` skill triggers by its description |

## How It Works

### The Generated Skill

```
.claude/skills/verify-<app>/
├── SKILL.md          Proof status, then Launch, Doctor, Drive, Evidence, Cleanup, Helpers
├── features/
│   ├── README.md     Baseline, driving conventions, proof rules, entry contract, index
│   └── <feature>.md  Sub-features, entry points, the drive recipe, gotchas
└── scripts/          The helpers, growing into one small <app>-drive CLI
```

It lives in the project, is committed with it, and stands on its own: an agent that uses it needs no plugin.
Its first line says whether it was proven, when, by which run, and by driving which feature.
Evidence goes under `.verify/<run-id>/` at the repository root, which `create` adds to `.gitignore`, and survives every cleanup.
[`references/verify-skill.md`](references/verify-skill.md) is the contract both skills hold it to, and [`references/feature-map-example/`](references/feature-map-example/README.md) shows a feature map for a desktop editor.

### Proof

`create` hands over a skill only once its own steps ran from launch to cleanup, drove one mapped feature through every entry point it lists, and left the evidence in place.
Until then it is a draft, marked `Not proven` with what stops a run.
A screenshot, a saved response or a transcript counts once an agent has opened it and compared it with what the feature file expects.
The skill's helper keeps each run's state in `.verify/<run-id>/run.json`, since no shell variable survives from one of an agent's tool calls to the next, and scratch data lives in the OS temp folder, apart from the evidence.
A drive takes the user's path: the command a menu item runs, the control a user clicks, never an internal setter or a test-only endpoint.

### Drivers

[`references/drive-recipes.md`](references/drive-recipes.md) holds a recipe per surface: web UIs, .NET desktop apps with their own renderer, Unity, CLIs and TUIs, HTTP services, and libraries.
A harness the repository already has always comes first.

A GPU-drawn app has nothing an outside tool can click.
It needs a driver of its own: a command channel that runs the app's own commands, and a screenshot copied from the swapchain.
Unity is driven in batchmode, through PlayMode tests, or as a player build with the same command channel, and never in the editor you have open.
Building such a driver is the project's work, not this plugin's: `create` writes the skill against the driver's interface, marks it `Not proven`, and says what the driver must provide.

### Maintenance

`maintain` changes only the skill's own folder, never product code.
A feature that stopped working is a product gap, reported with its evidence; a feature file that no longer matches working behavior is drift, and is fixed.
It runs one `feature-reader` per feature file in parallel, then drives every feature itself, in one session.
A change is committed only when you ask.

## Limits

- Without a driver, a GPU-drawn editor or a Unity player can be mapped but not proven.
- Claude in Chrome acts in your real browser with your sign-ins, so the web recipe uses it only on local URLs and for nothing that changes an account; Playwright drives the rest.
- Two Unity editors cannot open one project, so Unity drives run on a copy of the project or on a player build.
- A TUI on Windows needs a pseudo-terminal script (`pywinpty`, `node-pty`) or WSL, since tmux does not run there natively.
- Claude Code asks you to approve every write under `.claude/`, so run `create` and `maintain` in the foreground, where you can answer.

## Maintaining

Bump `version` in `.claude-plugin/plugin.json` with every change you want users to receive, and run `claude plugin validate plugins/verification` before pushing.
Keep the ported text's notice in [`NOTICE`](NOTICE) when you change the files it lists.

## Sources

- pstack by Lauren Tan, `create-verification-skill` and `maintain-verification-skill`, at [`bf0c7cd80a`](https://github.com/cursor/plugins/tree/bf0c7cd80a/pstack), MIT: see [`NOTICE`](NOTICE).
- Lauren Tan, [The Complete Guide to pstack Pt. 1](https://x.com/poteto/article/2094457600259842065), for the small agent-friendly CLI a verification skill grows into.
