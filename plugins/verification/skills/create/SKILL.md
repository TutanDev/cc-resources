---
name: create
description: "Generates a project-local verification skill, .claude/skills/verify-<app>/, that launches the real app, checks it is healthy, drives it the way a user does, captures evidence and cleans up, with a feature map of one file per user-facing feature. Works on any stack, with recipes for web UIs, CLIs, HTTP services, .NET desktop apps that draw with their own renderer, and Unity. The skill counts only once its own steps ran end to end and the evidence survived the cleanup. Use when the user asks for a verification, control or end-to-end skill for a repository, or when a task needs to drive the running app (reproduce a bug end to end, prove a change, look at what is drawn) and the project has no verify-* skill."
argument-hint: "[the app or surface to verify, when the repository has several]"
---

Part of the `verification` plugin.

Create a verification skill for: $ARGUMENTS (default: the repository's primary app).

**Read** `${CLAUDE_PLUGIN_ROOT}/references/verify-skill.md` first: the skill you write must meet it.
The skill is read cold, mid-task, by an agent that has never seen the app, so write it for that agent and not for a person.

List `.claude/skills/`: when a `verify-*` skill is there, offer `verification:maintain` instead.
When you came here from another task rather than at the person's request, tell them the project has no verification skill and ask before generating one.

## 1. Interview the Repository

Answer these from the code, its scripts and its docs, and ask the person only what you cannot observe:

- **Surface:** what a user touches: a web UI, a desktop app, a game, a CLI or TUI, an HTTP API, a library.
  Pick the primary one, and note the others.
- **Run:** how the app starts locally, from the repository's own documented commands (scripts, `README.md`, the Verification section of `cc-docs/architecture.md`), and the ports, environment, seed data and auth it needs.
- **Drive:** how an agent can act on it: an existing harness first (Playwright specs, a debug port, an editor bridge, a command channel), then a recipe from `${CLAUDE_PLUGIN_ROOT}/references/drive-recipes.md`.
- **Observe:** what evidence it can give: screenshots, accessibility snapshots, terminal transcripts, response bodies, logs, exit codes, stored state.
- **Isolate:** whether two instances can run side by side: ports, data directories, profiles, project locks.

Before writing anything, build and launch the checkout without changing its code, on a port and a data directory of your own, then stop it by its process id and remove its data: this launch is not evidence.
When it does not build or start, report exactly what fails and ask before changing product code: a skill written against a broken base teaches wrong steps.
A missing asset that only blocks startup (a sample config, an empty static folder) may be created by the skill as verification scaffolding, marked as such, and removed in its cleanup.

When the stack has no way in, such as a GPU-drawn editor or a Unity player without a command channel, the driver is the repository's own work and you do not write it.
Write the skill against the driver's interface as the recipe describes it, set its proof status to `Not proven: <the driver it needs>.`, and tell the person what the driver must provide.

## 2. Write the Skill

Write `.claude/skills/verify-<app>/SKILL.md` to the contract: the frontmatter, the proof status, and Launch, Doctor, Drive, Evidence, Cleanup and Helpers, each from what the interview found, with no placeholder left.
When evidence goes under `.verify/` and git does not ignore it yet, add `.verify/` to `.gitignore`.

## 3. Seed the Feature Map

In the skill's folder, write `features/README.md` and one file per user-facing feature, the top three to five to start, found in the menus, commands, routes or docs.
Follow the shape in `${CLAUDE_PLUGIN_ROOT}/references/feature-map-example/`, and copy the example README's Feature entry contract into the README with your harness's name in it, so the map stands without this plugin.

## 4. Prove It

Run the skill's own steps once, end to end, exactly as written: launch, doctor, drive one mapped feature through every entry point its file lists, capture its evidence, clean up.
Pick the feature whose drive exercises the most of the harness: a change of state, a side effect, a restart.
Open each screenshot, or for a surface that draws nothing each saved response or transcript, and compare it with the result the feature file expects.
After the cleanup, check that the evidence is still at its named location: a cleanup that eats the proof fails this step.
Fix what fails in the skill, and run the skill's cleanup after every failed attempt, so no process or port is stranded.
After a fix, start again from launch, with a new run: only a run that passed from launch to cleanup is the proof, and trial runs are not evidence.
Then set the proof status from that run, as the contract says.

A skill whose steps never ran is a draft, and stays `Not proven`.
When the proof ran on a stand-in for the real target (a container for a fresh machine, a local stack for a remote one), list each setup step the stand-in did that the target will not: they stay unverified until a run on the target covers them.

## 5. Hand Over

Tell the person the skill's path, its proof status, the feature driven and the run whose evidence proves it, the features mapped, and what is left: features not yet mapped, steps not yet proven, a driver to build.
Point them at `verification:maintain` to keep the map true as the app changes.
