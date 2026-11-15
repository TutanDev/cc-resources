# Open a scene

Open a scene lets a user load a saved scene into the editor from the menu, a shortcut, the recent list or the command line, see it drawn in the viewport, and keep their current scene when the file they pick is gone.

## Sub-features

- `open-menu` opens a scene through File, Open.
- `open-shortcut` opens the same dialog with Ctrl+O.
- `open-recent` reopens a scene from File, Recent.
- `open-cli` opens a scene passed on the command line at launch.
- `open-missing` reports a scene file that no longer exists, and keeps the current scene.

## How to get to it (user POV)

- Choose File, Open, and pick a `.scene` file.
- Press Ctrl+O while the viewport has focus.
- Choose a scene under File, Recent.
- Start Atlas with a scene path as its argument.

## Driving it with atlas-drive

Preconditions:

- Atlas is running from the baseline, with `samples/empty.scene` open.
- `atlas-drive doctor` reports the expected channel and process id.

- **Menu entry:** Choose File, Open, and pick `courtyard.scene`.
  Run `atlas-drive invoke file.open --path samples/courtyard.scene`.
  `atlas-drive state` reports `document` as `courtyard.scene`, `loading` as `false`, and `title` as `courtyard - Atlas`.
- **Shortcut entry:** Press Ctrl+O with the viewport focused.
  Run `atlas-drive key "ctrl+o"`.
  `atlas-drive state` reports `dialog` as `open-scene`; `atlas-drive key "escape"` closes it, and `dialog` is `none`.
- **Recent entry:** Open `empty.scene`, then choose `courtyard.scene` under File, Recent.
  Run `atlas-drive invoke file.open --path samples/empty.scene` and `atlas-drive invoke file.open-recent --index 1`.
  `atlas-drive state` reports `document` as `courtyard.scene`.
- **Command line entry:** Start a second instance with the scene as its argument.
  Run `atlas-drive launch --instance cli -- samples/courtyard.scene` and `atlas-drive --instance cli state`.
  `document` is `courtyard.scene`; stop that instance with `atlas-drive --instance cli quit`.
- **Missing file:** Pick a file that is gone.
  Run `atlas-drive invoke file.open --path samples/gone.scene`.
  `atlas-drive state` reports `last_error` as `Scene not found: gone.scene` and `document` still as `courtyard.scene`.
- **Proof:** Capture the opened scene and the error.
  Run `atlas-drive wait-frames 2` and `atlas-drive screenshot open-scene/open-menu.png` after the menu entry, and the same with `open-scene/open-missing.png` after the missing file.
  Open both: the first shows the courtyard with its fountain in the viewport, and the second shows the same courtyard under an error toast naming `gone.scene`.

## Gotchas

- `--path` skips the OS file dialog, so the dialog itself is proven only by the shortcut entry reaching it.
- Ctrl+O typed while an inspector text field has focus goes into the field.
- The swapchain screenshot holds the client area only: check the window title with `state`.
- The recent list belongs to the data directory, so it is empty on a fresh launch until a scene has been opened.
- A scene compiles its shaders on first open: wait for `loading` to be `false` before a screenshot, not for a fixed number of frames.
