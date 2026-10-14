# Repository Guidelines

## Project Structure & Module Organization

This workspace combines source archives and runtime resources; it has no root Git metadata.

- `CasioEmuNeo-master/`: emulator project. `emulator/` contains C++ CPU, peripherals, configuration, and GUI code; `asm/` contains Python tooling and assembly examples; `disas/` contains the disassembler; `docs/` and `lang/` contain documentation and translations.
- `CasioEmuNeo-master/web/`: WebAssembly API (`src/`), SDL replacements (`shims/`), JavaScript client (`js/`), smoke tests (`test/`), and examples.
- `991CN-X-CW-Decompilation-main/`: reverse-engineering references, ROP programs, tutorials, and supporting assets.
- `release/`: Windows executable, libraries, and `fx991cnx/` / `fx991cncw/` model resources.
- `ghidra_12.1.4_PUBLIC/`: bundled analysis tool; avoid editing its distribution files.

## Build, Test, and Development Commands

Run these from `CasioEmuNeo-master/`:

- `xmake f -p mingw`, then `xmake`: configure and build the C++17 desktop target using MinGW64 POSIX, SDL2, Lua 5.3, and ImGui.
- `xmake run CasioEmuX ../release/fx991cnx`: launch with the workspace's model directory.
- `bash web/build.sh`: build WASM using Emscripten; outputs go to `web/dist/`. In Bash, prefix with `DEBUG=1` for assertions.
- `make -C disas`: build the optional disassembler with GNU Make and a C++14 compiler.
- `node web/test/run_node.js`: run the WASM smoke test; requires built artifacts and Python on PATH.

For browser checks, serve the workspace root with `python -m http.server 8080`; ensure example model URLs resolve to the root `release/` directory.

## Coding Style & Naming Conventions

Match surrounding code: C++ and JavaScript generally use tabs; Python uses four spaces. Preserve PascalCase C++ class/method names, camelCase JavaScript APIs, and `emu_web_*` C exports. Keep shared-core web adaptations behind `CASIOEMU_WEB`. No project-wide formatter or linter configuration is supplied; avoid unrelated reformatting and vendor changes.

## Testing Guidelines

Tests use standalone scripts, with no declared coverage threshold. Exercise both models, including `node web/test/run_node.js --model fx991cncw --frames 400`. Compare memory-derived and rendered LCD output, test key input, and verify browser rendering separately. Add regression scenarios under `web/test/` and document reproduction commands.

## Commit & Pull Request Guidelines

These source archives contain no local Git history to establish message conventions. Use concise imperative subjects, optionally scoped, such as `web: Fix key release handling`. PRs should describe affected models, linked issues, validation commands and results, and screenshots for display changes. Exclude generated builds, test output, personal configuration, and ROM binaries unless redistribution is explicitly permitted.
