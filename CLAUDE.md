# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

See also `AGENTS.md` (style, commit, and PR conventions). The workspace root is not a Git repository. Most READMEs are written in Chinese.

## Workspace layout (what matters)

- `CasioEmuNeo-master/` — nX-U8 (ClassWiz) emulator. `emulator/` is the shared C++ core (`Chipset/` CPU+MMU, `Peripheral/` screen/keyboard/timers/BCD, `Gui/` ImGui debugger, desktop only). `web/` compiles that same core to WASM.
- `frontend/` — the actual FX-991CN X web app (vanilla ES modules, no bundler, no npm deps). Uses `CasioEmuNeo-master/web/js/casioemu-client.js` and `release/fx991cnx/`.
- `website-dist/` — **generated** by `node frontend/package.mjs`; don't edit by hand.
- `website/` — separate standalone marketing page (port 5175). It does not import frontend JS, WASM, or ROM; keep it that way.
- `showcase/` — second standalone presentation site, scroll-driven industrial design (port 5176, `node showcase/server.mjs [--host 0.0.0.0]`). Same isolation rules as `website/`; QA via `showcase/tests/browser-check.mjs <playwright-core/index.mjs> <chrome.exe>`. Its LCD animations replay real ROM frames from `showcase/assets/lcd-frames.json`, regenerated with `node showcase/tools/capture-lcd.mjs`; don't fake LCD glyphs with system fonts.
- `release/fx991cnx/`, `release/fx991cncw/` — model dirs (`model.lua`, `rom.bin`, `interface.png`, `_disas.txt`). ROMs are copyrighted; don't redistribute.
- `991CN-X-CW-Decompilation-main/` — reverse-engineering reference only. `ghidra_*` — vendor distribution, don't edit.

## Commands

All web/frontend commands run from the workspace root:

```powershell
node CasioEmuNeo-master/web/build.mjs            # WASM build (native Windows, no Bash); --debug for -O0 + assertions
node frontend/server.mjs                          # http://127.0.0.1:5173/frontend/  (--host 0.0.0.0, --port N, --dist)
node frontend/package.mjs                         # produce website-dist/
```

`build.mjs` needs an activated emsdk (`$EMSDK` or `~/emsdk`) plus Python; it reads the source list from `CORE_SRC=(...)` in `web/build.sh`, so add new core `.cpp` files there. `bash web/build.sh` (from `CasioEmuNeo-master/`) is the equivalent Bash build. Output: `web/dist/casioemu_web.{js,wasm}`.

Desktop build, from `CasioEmuNeo-master/` (the README's `cd emulator` is wrong; `xmake.lua` is at the project root): `xmake f -p mingw && xmake`, then `xmake run CasioEmuX ../release/fx991cnx`. Requires MinGW64 **POSIX** threads, and `unifont.otf` in the project root.

Tests (require built `web/dist/`; no test runner beyond `node --test`):

```powershell
node CasioEmuNeo-master/web/test/run_node.js [--model fx991cncw] [--frames 400] [--keys "1,=,2,Return"] [--png out.png]
node CasioEmuNeo-master/web/test/cnx-regression.mjs      # real-ROM result-glyph regression
node --test frontend/tests/device.test.mjs                # single unit test file; also guide/display .test.mjs
node frontend/tools/check-skin.mjs
python CasioEmuNeo-master/web/tools/check_keynames.py release/fx991cnx/model.lua
```

`run_node.js` prints the LCD twice (from VRAM `0xF800` and from the rendered framebuffer); the two must match. Browser tests (`frontend/tests/browser-*.mjs`) take absolute paths to an existing `playwright-core/index.mjs` and Chromium executable as arguments and write to `frontend/qa-output/`.

## Architecture

**Web core.** Built with `-DCASIOEMU_WEB`. Every change to shared `emulator/` files must sit behind `#ifdef/#ifndef CASIOEMU_WEB` so the desktop build behaves the same as before. The web build leaves out `casioemu.cpp`, `Gui/`, `utils.cpp`, and `Config/Config.cpp`, so it has no ImGui. `web/shims/` replaces SDL2 with a single-threaded software renderer. `IMG_Load` doesn't decode anything: JS decodes `interface.png` and passes the RGBA in through `emu_web_set_interface_image()`, which must be the first call. The file still has to exist in MEMFS because upstream code `fopen`s it. Lua 5.3.6 is compiled in, so `model.lua` runs as-is. There is no tick thread: JS drives time with `emu_web_run(elapsed_ms)`, capped at 100 ms per call.

**C API** (`web/src/web_api.cpp`, `emu_web_*`): lifecycle, run, framebuffer (re-fetch the pointer every frame because heap growth moves it), key/pointer input, button rects/names (from `model.lua`), battery RAM save/load (CNX 8 KB, CNCW 24 KB), mem read/write, Lua command. `web/README.md` documents it in full.

**Input quirk (from upstream):** any key release calls `ReleaseAll()`, so real multi-key chords don't work. SHIFT/ALPHA work by pressing and releasing first, then pressing the target key. A right-click locks a key until the next release.

**JS client** (`web/js/casioemu-client.js`, class `CasioEmu`): fetches the model, writes it to MEMFS, runs the rAF clock, converts SDL key names, and maps atlas coordinates. Node tests use it too, so it must work without the DOM.

**Frontend.** `app.js` wires everything together. `skin.js` holds the realistic 344×720 faceplate (cropped from `assets/source-cover.png`): its LCD placement and `keyRects`, whose order **must match `model.lua`'s `button_map`**, plus disjoint `touchRects`. `layout.js` is pure sizing math. `interaction.js` holds the pointer/touch state machine (180 ms long-press, 10 px swipe cancel). `guide.js` is the operation guide, based on the official manual RJA530830-001V02 (CNX only, cites printed page numbers). The LCD is drawn from the 192×63 VRAM, not from a redrawn screen. Memory autosaves to localStorage. A RAM backup is not a CPU snapshot, so restoring reboots the ROM.

**When you add a frontend file or asset**, update both the path whitelist regex in `frontend/server.mjs` (it returns 404 for anything not listed) and the copy list and path rewrites in `frontend/package.mjs`.

## Verification notes

Record browser results in `frontend/VERIFICATION.md` / `design-qa.md`. A ROM that boots doesn't prove that every calculator function works, and Chromium touch emulation doesn't replace testing in real iPad Safari. Exercise both models when you change core or web API code.
