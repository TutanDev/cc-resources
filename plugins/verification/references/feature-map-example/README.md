# Atlas verification map

This directory is the maintained source for verifying what a user of Atlas can do.
Atlas is a .NET desktop scene editor drawn with Vulkan, driven through its command channel by `atlas-drive`.
Read this index before driving the app, then follow the matching feature file as the recipe.

## Baseline

- Run every command from the repository root, in PowerShell.
- `atlas-drive` below stands for `pwsh -File .claude/skills/verify-atlas/scripts/atlas-drive.ps1`.
- Build once with `dotnet build src/Atlas.App -c Release`.
- `atlas-drive launch` starts a run: it makes a run id, an empty data directory in the OS temp folder, starts `Atlas.App --drive atlas-<run-id> --data-dir <that directory>`, waits for the ready line, and records the process id and the paths in `.verify/<run-id>/run.json`.
- `samples/` holds the seed scenes `courtyard.scene` and `empty.scene`, and `atlas-drive seed <file>` copies one into the run's data directory.
- `atlas-drive doctor` must report the run's channel, the commit the build came from, and the process id recorded at launch.
- `atlas-drive cleanup` stops every process the run recorded and removes its data directory, and keeps `.verify/<run-id>/`.
- Never drive an Atlas this run did not start.

## Driving conventions

- Run every action through `atlas-drive`, which prints one JSON object per command and exits non-zero on an error.
- Every command acts on the run launched last, so nothing depends on a shell variable surviving from one call to the next.
- `atlas-drive launch --instance <name>` starts a second instance in the same run, and `--instance <name>` on any command addresses it.
- Run editor commands by their command id with `atlas-drive invoke <id>`, as the menus and the shortcuts do.
- Reach a widget that has no command with `atlas-drive ui`, by its window and label.
- Press keys with `atlas-drive key`, and send pointer input with `atlas-drive pointer` only where a feature has no command id.
- A path that starts with `data:` names a file in the run's data directory.
- Run `atlas-drive wait-frames 2` after any command that changes what is drawn, before a screenshot.
- Treat every command as literal, and keep quoted names unchanged.

## Proof rules

- A drawing proof is a swapchain screenshot from `atlas-drive screenshot <feature-id>/<name>.png`, written under `.verify/<run-id>/`, opened and looked at, plus `atlas-drive state` for what the picture cannot settle.
- A file proof reopens the file in a fresh instance and checks it again.
- Every artifact is named after the sub-feature and the entry point it proves.
- An entry point not reached is reported with the command tried and the precondition missing, never as proven through another entry point.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the behavior a user sees.
It then has exactly four H2 sections, in this order:

1. `Sub-features` lists short ids, one line for each behavior.
2. `How to get to it (user POV)` lists every entry point a user has.
3. `Driving it with atlas-drive` starts with `Preconditions:`, then bullets labeled `**<Step>:**` that pair each user action with the exact command and the result to observe, and ends with a `**Proof:**` bullet.
4. `Gotchas` lists the traps that waste or invalidate a run.

Keep implementation details out of the map.
Name only user paths, stable handles, required state, commands and observable proof.

## Features

- [Open a scene](./open-scene.md) covers the menu, the shortcut, the recent list, the command line and a missing file.
- [Change a material color](./material-color.md) covers the inspector field, undo and redo, and the saved file.
