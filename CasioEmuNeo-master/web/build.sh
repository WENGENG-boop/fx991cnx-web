#!/usr/bin/env bash
#
# Builds the emulator core into WebAssembly.
#
#   bash web/build.sh            # optimised build -> web/dist/
#   DEBUG=1 bash web/build.sh    # unoptimised, with assertions -> web/dist/
#   bash web/build.sh clean      # wipe web/build + web/dist first
#
# Requires an emsdk installation.  The script looks for it in this order:
#   $EMSDK, ~/emsdk, /c/Users/$USERNAME/emsdk, and finally a plain `emcc` on PATH.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJ="$(cd "$HERE/.." && pwd)"
LUA_DIR="$HERE/third_party/lua-5.3.6"
OUT="$HERE/dist"
OBJ="$HERE/build"

DEBUG="${DEBUG:-0}"
JOBS="${JOBS:-8}"

if [ "${1:-}" = "clean" ]; then
	echo "== 清理 =="
	rm -rf "$OBJ" "$OUT"
fi

# ---------------------------------------------------------------- find emsdk

PY=""
for candidate in python python3 py; do
	if command -v "$candidate" >/dev/null 2>&1; then
		PY="$candidate"
		break
	fi
done
[ -n "$PY" ] || { echo "错误: 找不到 python, 没法调用 emcc" >&2; exit 1; }

EMCC=()
if [ -n "${EMSDK:-}" ] && [ -f "$EMSDK/upstream/emscripten/emcc.py" ]; then
	:
elif [ -f "$HOME/emsdk/upstream/emscripten/emcc.py" ]; then
	export EMSDK="$HOME/emsdk"
elif [ -n "${USERNAME:-}" ] && [ -f "/c/Users/$USERNAME/emsdk/upstream/emscripten/emcc.py" ]; then
	export EMSDK="/c/Users/$USERNAME/emsdk"
fi

if [ -n "${EMSDK:-}" ]; then
	EMCC=("$PY" "$EMSDK/upstream/emscripten/emcc.py")
	export EM_CONFIG="${EM_CONFIG:-$EMSDK/.emscripten}"
	export PATH="$EMSDK/upstream/emscripten:$EMSDK/node:$PATH"
elif command -v emcc >/dev/null 2>&1; then
	EMCC=(emcc)
else
	echo "错误: 找不到 emsdk. 设 EMSDK 环境变量, 或者把 emsdk 放到 ~/emsdk" >&2
	exit 1
fi

echo "== emcc 版本 =="
"${EMCC[@]}" --version | head -1

# ----------------------------------------------------------------- sources

CORE_SRC=(
	emulator/Emulator.cpp
	emulator/Logger.cpp
	emulator/Data/ModelInfo.cpp
	emulator/Chipset/Chipset.cpp
	emulator/Chipset/CPU.cpp
	emulator/Chipset/CPUArithmetic.cpp
	emulator/Chipset/CPUControl.cpp
	emulator/Chipset/CPULoadStore.cpp
	emulator/Chipset/CPUPushPop.cpp
	emulator/Chipset/InterruptSource.cpp
	emulator/Chipset/MMU.cpp
	emulator/Chipset/MMURegion.cpp
	emulator/Peripheral/BCDCalc.cpp
	emulator/Peripheral/BatteryBackedRAM.cpp
	emulator/Peripheral/Keyboard.cpp
	emulator/Peripheral/Miscellaneous.cpp
	emulator/Peripheral/Peripheral.cpp
	emulator/Peripheral/ROMWindow.cpp
	emulator/Peripheral/Screen.cpp
	emulator/Peripheral/StandbyControl.cpp
	emulator/Peripheral/Timer.cpp
	web/shims/sdl_soft.cpp
	web/src/web_api.cpp
)

# Lua 5.3, minus the two files that each carry their own main().
LUA_SRC=()
for file in "$LUA_DIR"/src/*.c; do
	base="$(basename "$file")"
	case "$base" in
	lua.c | luac.c) continue ;;
	esac
	LUA_SRC+=("$file")
done
[ "${#LUA_SRC[@]}" -eq 33 ] || echo "警告: Lua 源文件数量是 ${#LUA_SRC[@]}, 预期 33" >&2

# Every emu_web_* defined in web_api.cpp gets exported to JavaScript.
EXPORTS="$(grep -o 'emu_web_[a-zA-Z_][a-zA-Z_0-9]*' "$HERE/src/web_api.cpp" | sort -u | sed 's/^/_/' | tr '\n' ',')"
EXPORTS="${EXPORTS}_malloc,_free"

INCLUDES=(
	-I"$PROJ/emulator"
	-I"$HERE/shims"
	-I"$LUA_DIR/src"
)

COMMON=(-DCASIOEMU_WEB "${INCLUDES[@]}")

if [ "$DEBUG" = "1" ]; then
	echo "== 调试构建 (O0, assertions) =="
	OPT_CFLAGS=(-O0 -g)
	OPT_CXXFLAGS=(-O0 -g)
	LINK_EXTRA=(-sASSERTIONS=2 -sSAFE_HEAP=1)
else
	OPT_CFLAGS=(-O2)
	OPT_CXXFLAGS=(-O2)
	LINK_EXTRA=(-sASSERTIONS=0)
fi

CFLAGS=("${OPT_CFLAGS[@]}" "${COMMON[@]}")
CXXFLAGS=("${OPT_CXXFLAGS[@]}" -std=c++17 "${COMMON[@]}")

LINK=(
	--no-entry
	-sDEFAULT_TO_CXX=1
	-sMODULARIZE=1
	-sEXPORT_NAME=CasioEmuWeb
	-sENVIRONMENT=web,node
	-sFORCE_FILESYSTEM=1
	-sALLOW_MEMORY_GROWTH=1
	-sINITIAL_MEMORY=67108864
	-sSTACK_SIZE=5242880
	-sEXIT_RUNTIME=0
	-sEXPORTED_FUNCTIONS="$EXPORTS"
	-sEXPORTED_RUNTIME_METHODS=FS,HEAPU8,HEAPU32,HEAP32,getValue,setValue,cwrap,UTF8ToString,stringToNewUTF8,lengthBytesUTF8
	"${LINK_EXTRA[@]}"
	-o "$OUT/casioemu_web.js"
)

mkdir -p "$OUT" "$OBJ" "$OBJ/logs"
rm -f "$OBJ"/logs/*.log

echo "== 导出符号 (${EXPORTS}) =="

# --------------------------------------------------------------- compile

# Appends "<objfile>|<lang>|<abs source>" lines for every file to build.
plan_file="$OBJ/plan.txt"
: >"$plan_file"
for src in "${LUA_SRC[@]}"; do
	obj="$OBJ/$(printf '%s' "$src" | sed 's#.*/lua-5\.3\.6/src/##; s#\.c$#.o#')"
	printf '%s|c|%s\n' "$obj" "$src" >>"$plan_file"
done
for src in "${CORE_SRC[@]}"; do
	obj="$OBJ/$(printf '%s' "$src" | tr '/' '_' | sed 's#\.cpp$#.o#')"
	printf '%s|cxx|%s\n' "$obj" "$PROJ/$src" >>"$plan_file"
done

total=$(wc -l <"$plan_file")
echo "== 编译 $total 个文件 (并行 $JOBS) =="

pids=()
names=()
while IFS='|' read -r obj lang src; do
	# Skip files that are already newer than their source.
	if [ -f "$obj" ] && [ "$obj" -nt "$src" ]; then
		continue
	fi
	if [ "$lang" = "c" ]; then
		flags=("${CFLAGS[@]}")
	else
		flags=("${CXXFLAGS[@]}")
	fi
	log="$OBJ/logs/$(basename "$obj").log"
	(
		"${EMCC[@]}" "${flags[@]}" -c "$src" -o "$obj" >"$log" 2>&1
	) &
	pids+=("$!")
	names+=("$src")
	if [ "${#pids[@]}" -ge "$JOBS" ]; then
		wait -n 2>/dev/null || true
		pids=()
	fi
done <"$plan_file"
wait 2>/dev/null || true

failed=0
for log in "$OBJ"/logs/*.log; do
	[ -s "$log" ] || continue
	if grep -qiE '(error|fatal error)[: ]|error generated|undefined symbol|ld: ' "$log"; then
		echo "--- 编译失败: $(basename "$log" .log) ---" >&2
		cat "$log" >&2
		failed=1
	fi
done
if [ "$failed" != "0" ]; then
	echo "编译有错误, 停下来。" >&2
	exit 1
fi

objs=()
while IFS='|' read -r obj lang src; do
	objs+=("$obj")
done <"$plan_file"

missing=0
for obj in "${objs[@]}"; do
	[ -f "$obj" ] || { echo "缺少目标文件: $obj" >&2; missing=1; }
done
[ "$missing" = "0" ] || exit 1

# ------------------------------------------------------------------ link

echo "== 链接 =="
cd "$PROJ"
"${EMCC[@]}" "${objs[@]}" "${LINK[@]}"

echo
echo "== 完成 =="
ls -lh "$OUT/casioemu_web.js" "$OUT/casioemu_web.wasm"
