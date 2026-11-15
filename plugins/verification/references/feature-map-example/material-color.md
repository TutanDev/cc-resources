# Change a material color

Change a material color lets a user select an object, set its material's base color in the inspector, see the viewport redraw it, undo and redo the change, and find the color still there after saving and reopening the scene.

## Sub-features

- `color-inspector` sets the base color through the inspector's Base Color field.
- `color-undo` restores the previous color with Edit, Undo or Ctrl+Z.
- `color-redo` applies it again with Edit, Redo or Ctrl+Y.
- `color-save` keeps the color in the saved scene file.

## How to get to it (user POV)

- Select an object in the viewport or the hierarchy, then edit Base Color in the inspector's Material section.
- Choose Edit, Undo, or press Ctrl+Z with the viewport focused.
- Choose Edit, Redo, or press Ctrl+Y with the viewport focused.
- Choose File, Save, or press Ctrl+S.

## Driving it with atlas-drive

Preconditions:

- Atlas is running from the baseline, after `atlas-drive seed samples/courtyard.scene` and `atlas-drive invoke file.open --path data:courtyard.scene`.
- The object `Fountain` has the base color `#808080`.

- **Select:** Click `Fountain` in the hierarchy.
  Run `atlas-drive ui click "Hierarchy/Fountain"`.
  `atlas-drive state` reports `selection` as `["Fountain"]`.
- **Before:** Capture the scene unchanged.
  Run `atlas-drive screenshot material-color/before.png`.
- **Set the color:** Type `#C03030` into Base Color and press Enter.
  Run `atlas-drive ui set "Inspector/Material/Base Color" "#C03030"`.
  `atlas-drive state` reports the material's `base_color` as `#C03030`.
- **Redraw:** Let the viewport redraw.
  Run `atlas-drive wait-frames 2` and `atlas-drive screenshot material-color/after.png`.
  Opened beside `before.png`, it shows the fountain red and nothing else changed.
- **Undo:** Press Ctrl+Z with the viewport focused.
  Run `atlas-drive key "ctrl+z"`, `atlas-drive wait-frames 2` and `atlas-drive screenshot material-color/undo.png`.
  `base_color` is `#808080` again, and `undo.png` matches `before.png`.
- **Redo:** Choose Edit, Redo.
  Run `atlas-drive invoke edit.redo`.
  `base_color` is `#C03030`.
- **Save and reopen:** Save, quit, and open the saved file in a fresh instance.
  Run `atlas-drive invoke file.save`, `atlas-drive quit`, `atlas-drive launch --instance reopen -- data:courtyard.scene` and `atlas-drive --instance reopen state`.
  `Fountain` has the base color `#C03030`.
- **Proof:** Capture the reopened scene.
  Run `atlas-drive --instance reopen screenshot material-color/reopen.png`.
  Opened in order, `before.png`, `after.png`, `undo.png` and `reopen.png` show the fountain grey, red, grey and red.

## Gotchas

- Never save over `samples/courtyard.scene`: the precondition seeds a copy into the run's data directory first.
- `state` reports colors as the inspector shows them, in sRGB, while the viewport shades in linear space, so a pixel's value never equals the field's value: check values through `state` and the picture by eye.
- Ctrl+Z pressed while the color field has focus undoes the typing inside the field, not the scene change.
- The first frame after a change can still show the old color while the material uploads, which is why the recipe waits two frames.
