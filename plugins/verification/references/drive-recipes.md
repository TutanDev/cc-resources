# Drive Recipes

How to launch, drive, capture and clean up, per surface, for when the repository has no harness of its own.
A harness the repository already has (Playwright specs, an expect script, a debug port, an editor bridge) always comes first.
Where a stack has no way in, the driver is the repository's own work: the generated skill names what it needs and stays `Not proven` until it exists.

On every surface:

- The skill's launcher starts the app detached, records the app's process id, polls the ready signal until a timeout, and returns once the app is usable.
  The agent then drives it with ordinary commands, and never waits with a fixed sleep.
- On Windows, the app must outlive the tool call that launched it: in Node, `spawn` with `detached: true`, its output sent to a file, then `unref()`; in PowerShell, `Start-Process -PassThru` with its output redirected to a file.
- Start the app's own executable, not a package script or a build tool (`npm start`, `dotnet run`): their processes sit between, and stopping their id can leave the app running.
- In Git Bash on Windows, `$!` is the MSYS process id, not the Windows one.
  Take the id from `Start-Process -PassThru` in PowerShell, from the launcher's own spawn call, or from the app's health answer.
- In Git Bash, an argument to a native program that starts with `/` is rewritten into a Windows path: `/health` reaches the program as `C:/Program Files/Git/health`.
  Write routes without the leading slash, or set `MSYS_NO_PATHCONV=1` for the call.

## Web UI

- **Drive:** Playwright, from the repository's own specs and config when it has them, with locators by role and accessible name.
  Claude in Chrome can look at a local instance, but it acts in the person's real browser with their sign-ins: drive only local URLs with it, and nothing that changes an account.
- **Evidence:** an accessibility snapshot and a screenshot with the app's identity visible, and for a change of data a second, read-only view of the stored value.
- **Isolate:** a port and a data directory per run.

## .NET Desktop App with Its Own Renderer

For an app that draws with Vulkan, Direct3D or OpenGL.
What it draws has no accessibility tree, so neither UI Automation nor screen coordinates reach it reliably.
The app needs a driver of its own, compiled in for verification and off unless a flag turns it on:

- **Command channel:** started by a flag such as `--drive <channel>`, on a named pipe or a localhost port, one JSON object per line each way.
  A command runs through the app's own command registry, the same entry a menu item or a shortcut runs, so a drive takes the user's path.
  A widget with no command behind it is reached by its window and label, the handle the UI itself knows it by.
  A feature reached only by pointer input (a drag, a gizmo) gets its input injected where the windowing layer delivers it, never a call into the tool's handler.
- **Ready and doctor:** the app logs a ready line once its first frame has been presented, and a `ping` command returns the build, the process id and the frame number.
- **Screenshot:** a `screenshot <path>` command that waits for the next frame, copies its swapchain image into host memory just before it is presented, swizzles it from the swapchain's format (often BGRA) to PNG, and returns the path, the size and the frame number.
  A Vulkan swapchain image can be copied only when the swapchain was created with `VK_IMAGE_USAGE_TRANSFER_SRC_BIT`.
  The swapchain holds the client area only: the window title and OS chrome are checked through `state`.
  An OS capture of the window is a fallback: it can return a black or stale frame for a GPU-drawn surface, so the swapchain copy is the proof of what was drawn.
- **State:** a `state` command that returns as JSON what a user could see: the open document, the selection, the window title, the last error, whether loading is done.
  It settles what a picture cannot, and never replaces looking at the picture.
- **Isolate:** a data directory per run, for settings, recent files and layout files such as `imgui.ini`, and a channel name with the run id in it.
- **Cleanup:** `quit` over the channel, then stop the recorded process id if it is still alive.

Standard OS dialogs the app opens (file pickers, message boxes) do have an accessibility tree: drive them through UI Automation, or give the command a path argument that skips the dialog and say so in the feature's `Gotchas`.

## Unity

Unity refuses to open a project that another editor has open, and holds `Temp/UnityLockfile` while one does.
Never drive the person's open editor: drive a copy of the project, or a player build.
Run the editor version that `ProjectSettings/ProjectVersion.txt` pins.

- **Editor, batchmode:** `Unity -batchmode -projectPath <copy> -executeMethod <Namespace.Class.Method> -logFile <run>/unity.log`.
  The method lives in an Editor assembly, logs a ready line, and ends the editor itself with `EditorApplication.Exit(code)`, so leave `-quit` off when it waits on frames.
  `-nographics` creates no graphics device: leave it off whenever a drive takes a screenshot.
  Batchmode has no Game view, so a screenshot renders the camera into a `RenderTexture`, reads it with `Texture2D.ReadPixels` and writes `EncodeToPNG()`.
  A camera render leaves out Screen Space - Overlay canvases, so the proof of such UI comes from a player.
- **Play mode:** PlayMode tests through the Unity Test Framework, run with `-batchmode -runTests -testPlatform PlayMode -testResults <run>/results.xml -logFile <run>/unity.log` and without `-quit`.
  A test loads the scene the user starts from, presses keys and buttons with the Input System's `InputTestFixture`, or clicks a uGUI control through `ExecuteEvents.Execute` with `pointerClickHandler` rather than invoking its `onClick`, and captures as in batchmode.
- **Player:** a development build with the command channel of the desktop recipe behind a scripting define, launched with `-logFile <run>/player.log -screen-fullscreen 0 -screen-width 1280 -screen-height 720` and the channel flag.
  Every run of a player shares one `Application.persistentDataPath`, so the verification build takes a flag that moves saves into the run's data directory.
  `ScreenCapture.CaptureScreenshotAsTexture()` after `WaitForEndOfFrame` captures the whole screen, overlay UI included.
- **Evidence:** the log, the test results XML, and the screenshots, each opened and looked at.

## CLI and TUI

- **Drive:** each drive in its own process, from a clean working directory and a data directory per run.
  A TUI needs a pseudo-terminal: tmux on Linux, macOS and WSL, and a `pywinpty` or `node-pty` script on Windows.
- **Evidence:** the command, stdout, stderr and the exit code, with JSON output wherever the CLI offers it.

## HTTP Service

- **Drive:** `curl`, or the skill's `<app>-drive` wrapping the same requests, against the routes a client calls, with the auth a client uses.
- **Evidence:** the request, the status, the body, and for a change of data a second read of the stored value.
- **Isolate:** a port and a database per run.

## Library

A library has no user surface of its own: its user is the program that calls it.
Drive a sample or a consumer program in the repository.
When there is none, say so: the test suite is then the library's proof, and a verification skill has nothing to drive.
