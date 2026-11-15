# Verification Skill Contract

A verification skill is a project-local skill that drives the real app the way a user does and keeps the proof.
It lives at `.claude/skills/verify-<app>/` in the project, where `<app>` is the app's short name in kebab case.
It is read cold, in the middle of another task, by an agent that has never seen the app, so it says exactly what to run and what to see.
`verification:create` writes one, `verification:maintain` keeps it true, and both hold it to this contract.

The skill stands on its own.
An agent that reads it may not have the `verification` plugin, so it never points into the plugin, and its feature map carries its own entry contract.

## Layout

```
.claude/skills/verify-<app>/
├── SKILL.md          Frontmatter, the proof status, and the six sections below
├── features/
│   ├── README.md     Baseline, driving conventions, proof rules, entry contract, index
│   └── <feature>.md  One per user-facing feature
└── scripts/          The helpers, when the skill ships any
```

## SKILL.md

The frontmatter has `name: verify-<app>` and a `description` that names the app and its surface, and says when to reach for the skill: reproducing a bug end to end, proving that a change works the way a user meets it, and looking at what the app draws or returns.
A skill without frontmatter never registers.

The first line under the title is the proof status, which both plugin skills keep current:

- `Proven: <YYYY-MM-DD> (run <run-id>), from launch to cleanup, driving <feature>.`, with the UTC date and the id of the run that proved it, and the feature file's name without `.md`.
- `Not proven: <what stops a run>.`

Every command in the skill runs from the repository root, and the skill says so once.
On Windows it names the shell its commands were proven in, and whether the other shell runs them too.
Each tool call an agent makes starts a fresh shell, so no step relies on a shell variable set in an earlier call.

Six sections follow, each grounded in what the repository holds, with no placeholder left (a token that varies per run, such as `<run-id>`, is not a placeholder):

1. **Launch:** the exact command that starts the app for verification, and the signal that it is ready.
   It starts the app without changing its code, on a port and a data directory of its own.
   Ready means usable, not only that a process answers: a database can pass its health check while its init scripts still run.
   Launch reaches a usable state from an empty data directory, migrations and seed data included.
   It polls the ready signal itself until a timeout, never with a fixed sleep, and returns once the app is usable, leaving it running.
   It records the id of the app's own process, not a wrapper's, and confirms it against the id the app reports wherever the app reports one.
   It creates the run's id and prints it, and keeps the run's state (its id, its process ids, its scratch folder) in `.verify/<run-id>/run.json`.
   Every later command acts on the run launched last, unless it names another.
   For a short-lived CLI there is nothing to keep alive: launch builds the binary once, and each drive starts its own process.
2. **Doctor:** one read-only check that says whether this instance is worth driving: our process is up, the build is the expected one, the port or channel is ours, auth is valid.
   The expected build is the commit it was built from, or, for an app with no build step, the version it reports and the source files it loaded, unchanged on disk since launch.
   It runs before the first drive, after any failed drive, and whenever anything looks off.
3. **Drive:** the harness, with this repository's real commands and handles, not examples.
   A drive takes the path a user takes: the command a menu item or a shortcut runs, the control a user clicks, the CLI a user types, the route a client calls, never an internal setter or a test-only endpoint.
   Stable handles (command ids, accessible names, prompt strings, routes) beat screen coordinates and tab order.
4. **Evidence:** what each proof captures, and where it goes.
   A proof captures the action and the state it led to, not only the final screen, and checks side effects (files written, rows inserted, messages sent) beside what is visible.
   A screenshot, a saved response or a transcript proves something only once an agent has opened it with the Read tool and compared it with the expected result, and anything else in it that looks off is reported too.
   Mocks stand only where a production boundary already isolates the external system.
   A dry run or a test mode is trusted only for what it is seen to skip (files, network, git refs), not for what its name promises.
   Evidence goes under `.verify/<run-id>/<feature>/` at the repository root, unless the repository already has a place for it, and that folder is ignored by git.
   `.verify/<run-id>/` itself holds only the run's record and logs.
   `<run-id>` is the launch's UTC time as `yyyyMMdd-HHmmss`.
   Scratch state (data directories, profiles, copies of the project) lives outside `.verify/`, in the OS temp folder, so cleanup can remove it whole.
5. **Cleanup:** how to stop what the run started and remove its scratch state.
   It stops processes by the ids recorded at launch, and only while each id is still the app's process (its command line or start time matches), since the OS reuses ids: never by name, and never the person's own instance.
   It never removes anything under `.verify/`.
6. **Helpers:** every script the skill ships, each runnable exactly as its invocation here shows: by its path from the repository root, unless the skill installs it.
   A shorthand for a long invocation is fine once the skill defines it.
   Helpers grow into one small CLI for the app, `<app>-drive`, with `launch`, `doctor`, a subcommand per kind of action, `state`, `screenshot` where the surface draws, and `cleanup`.
   Every subcommand prints JSON, and every one that can delete or overwrite data or stop a process takes `--dry-run` on every call.
   A helper the reader has to reverse-engineer is not a helper.

The skill also says whether two instances can run side by side (ports, data directories, profiles, project locks).
When they cannot, it says to refuse to drive any instance the run did not start: refusing beats corrupting the person's session.

## The Feature Map

`features/README.md`, in the skill's folder, has five sections:

1. **Baseline:** the state every recipe starts from: how the instance is launched, its isolated data, the seed data, and what doctor must report.
2. **Driving conventions:** which harness command runs which kind of action, and how commands are quoted.
3. **Proof rules:** what a proof of each kind holds, that each artifact names the sub-feature and entry point it proves, and that an entry point not reached is reported with the command tried and the precondition missing, never as proven through another entry point.
4. **Feature entry contract:** the shape below, copied in from the example README's section of that name, with the harness's name in place of `atlas-drive`.
5. **Features:** one linked line per feature file.

Each feature file describes one user-facing feature from the user's side.
It starts with an H1 title and one paragraph on the behavior a user sees, then exactly four H2 sections, in this order:

1. `Sub-features`: short ids, one line for each behavior.
2. `How to get to it (user POV)`: every entry point a user has.
3. `Driving it with <harness>`: `Preconditions:`, then bullets labeled `**<Step>:**` that each pair a user action with the exact command and the result to observe, ending with a `**Proof:**` bullet that names the artifacts.
4. `Gotchas`: the traps that waste or invalidate a run.

The map names user paths, stable handles, required state, commands and observable proof, and no implementation detail.
When the seed data lacks a precondition that a journey needs, the journey fails and the reason goes in that feature's `Gotchas`: a journey is never weakened to pass.
A proof that drives one convenient entry point is incomplete while the map lists others.

`references/feature-map-example/` in the plugin shows the shape, for a desktop app driven through a command channel.
