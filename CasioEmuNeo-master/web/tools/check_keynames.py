#!/usr/bin/env python3
"""Checks that every key name in a model.lua resolves to an SDL keycode.

The emulator panics during startup if a name in `button_map` cannot be turned
into a keycode by SDL_GetKeyFromName().  The WebAssembly build replaces SDL
with web/shims/sdl_soft.cpp, so this re-implements that lookup and reports any
name the shim would reject.

    python web/tools/check_keynames.py release/fx991cnx/model.lua ...
"""

import re
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

# Must stay in sync with kKeyNames/kKeyCodes in web/shims/sdl_soft.cpp.
KEY_CODES = {
    "backspace": 0x08, "tab": 0x09, "return": 0x0D, "escape": 0x1B, "space": 0x20,
    "left": 0x40000050, "right": 0x4000004F, "up": 0x40000052, "down": 0x40000051,
    "home": 0x4000004A, "end": 0x4000004D,
    "pageup": 0x4000004B, "pagedown": 0x4000004E, "insert": 0x40000049,
    "delete": 0x4000004C, "capslock": 0x40000039,
    "leftshift": 0x400000E1, "rightshift": 0x400000E5,
    "leftctrl": 0x400000E0, "rightctrl": 0x400000E4,
    "leftalt": 0x400000E2, "rightalt": 0x400000E6,
    "f1": 0x4000003A, "f2": 0x4000003B, "f3": 0x4000003C, "f4": 0x4000003D,
    "f5": 0x4000003E, "f6": 0x4000003F, "f7": 0x40000040, "f8": 0x40000041,
    "f9": 0x40000042, "f10": 0x40000043, "f11": 0x40000044, "f12": 0x40000045,
    "keypad0": 0x40000062, "keypad1": 0x40000059, "keypad2": 0x4000005A,
    "keypad3": 0x4000005B, "keypad4": 0x4000005C, "keypad5": 0x4000005D,
    "keypad6": 0x4000005E, "keypad7": 0x4000005F, "keypad8": 0x40000060,
    "keypad9": 0x40000061, "keypad.": 0x40000063, "keypad/": 0x40000054,
    "keypad*": 0x40000055, "keypad-": 0x40000056, "keypad+": 0x40000057,
    "keypadenter": 0x40000058, "keypad=": 0x40000067,
}


def normalise(name):
    """Mirrors Normalise() in sdl_soft.cpp: lower-case, drop spaces/underscores."""
    return "".join(ch for ch in name if ch not in " _").lower()


def resolve(name):
    """Returns the keycode the shim would produce, or 0 for "not found"."""
    if not name:
        return 0
    if len(name) == 1:
        return ord(name)

    key = normalise(name)
    if key == "enter":
        key = "return"
    if key == "esc":
        key = "escape"
    if key in ("keypadenter", "kpenter", "numpadenter"):
        return 0x40000058
    if len(key) == 3 and key.startswith("kp") and key[2].isdigit():
        key = "keypad" + key[2]
    if key.startswith("keypad"):
        key = "keypad" + key[6:]
    if key.startswith("numpad"):
        key = "keypad" + key[6:]
    if key == "pagedn":
        key = "pagedown"
    if key in ("lshift", "leftshift"):
        return 0x400000E1
    if key in ("rshift", "rightshift"):
        return 0x400000E5
    return KEY_CODES.get(key, 0)


_LUA_ESCAPES = {"a": "\a", "b": "\b", "f": "\f", "n": "\n", "r": "\r",
                "t": "\t", "v": "\v", "\\": "\\", "'": "'", '"': '"'}


def _unescape(text):
    """Turns the raw source text of a Lua single-quoted string into its value."""
    out = []
    index = 0
    while index < len(text):
        ch = text[index]
        if ch != "\\":
            out.append(ch)
            index += 1
            continue
        index += 1
        if index >= len(text):
            break
        nxt = text[index]
        if nxt.isdigit():
            digits = ""
            while index < len(text) and len(digits) < 3 and text[index].isdigit():
                digits += text[index]
                index += 1
            out.append(chr(int(digits)))
            continue
        out.append(_LUA_ESCAPES.get(nxt, nxt))
        index += 1
    return "".join(out)


def names_in(path):
    text = open(path, encoding="utf-8").read()
    return [_unescape(raw) for raw in re.findall(r"""0x[0-9A-Fa-f]{2}\s*,\s*'([^']*)'""", text)]


def main(argv):
    if len(argv) < 2:
        print(__doc__)
        return 2

    failed = False
    for path in argv[1:]:
        names = names_in(path)
        if not names:
            print("%s: 没找到任何键名, 确认一下格式?" % path)
            failed = True
            continue
        bad = sorted({n for n in names if n and not resolve(n)})
        print("%s: %d 个按钮, %d 个解析失败" % (path, len(names), len(bad)))
        if bad:
            failed = True
            for name in bad:
                print("    无法解析: %r" % name)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
