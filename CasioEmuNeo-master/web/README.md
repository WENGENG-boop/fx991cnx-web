# 网页版核心（WASM）

完整 FX-991CN X 网页应用位于工作区的 [`frontend/`](../../frontend/README.md)。在工作区根目录运行 `node frontend/server.mjs`，访问 `http://127.0.0.1:5173/frontend/`。Windows 原生构建可使用 `node CasioEmuNeo-master/web/build.mjs`，无需 Bash。

把 `emulator/` 里的模拟器核心编译成 WebAssembly，并给前端留了一套纯 C 的接口。
**这里没有界面代码**，界面随便你怎么写；这个目录只负责「核心 + 怎么把核心接起来」。

---

## 一、目录里都有什么

| 路径 | 作用 |
| --- | --- |
| `build.sh` | 一键编译。跑完产出 `dist/casioemu_web.js` + `dist/casioemu_web.wasm` |
| `shims/SDL.h`、`shims/SDL_image.h` | 自己写的 SDL2 头文件替身，只声明核心真正用到的那几十个函数 |
| `shims/sdl_soft.cpp` | 上面那套替身的实现：一个纯软件渲染器，没有 GL、没有线程、没有真窗口 |
| `src/web_api.cpp` | 导出给 JS 的 `emu_web_*` 接口 |
| `js/casioemu-client.js` | 前端接线层。取模型、解图、驱动时钟、送按键、拿画面，都在这儿 |
| `tools/png_to_rgba.py` | 纯 Python 的 PNG 解码/编码（Node 测试用，浏览器里用不着） |
| `tools/check_keynames.py` | 校验 `model.lua` 里的键名能被 SDL 替身认出来 |
| `test/run_node.js` | 不开浏览器的端到端测试，把液晶屏用字符画打到终端 |
| `examples/minimal.html` | 最小验证页（不是成品界面，只有 40 行，用来看「跑没跑起来」） |
| `third_party/lua-5.3.6/` | 打进 wasm 的 Lua 源码 |

---

## 二、编译

需要 [emsdk](https://github.com/emscripten-core/emsdk)。脚本按这个顺序找它：
`$EMSDK` → `~/emsdk` → `/c/Users/$USERNAME/emsdk` → PATH 里的 `emcc`。

```bash
bash web/build.sh          # 出优化版
DEBUG=1 bash web/build.sh  # 出调试版（O0 + 断言），排错时用
bash web/build.sh clean    # 先清干净再编
```

首次编译大概几分钟。产物：

```
web/dist/casioemu_web.js    胶水代码（约 100 KB）
web/dist/casioemu_web.wasm  核心（含 Lua，约 1 MB）
```

`build.sh` 只编这些源文件，**没有**编 `casioemu.cpp`、`Gui/`、`utils.cpp`、`Config/Config.cpp`。
把这些排除掉之后就不需要 imgui 了。

---

## 三、接口一览（`emu_web_*`）

全部是 `extern "C"`，可以直接 `Module._名字(...)` 调用。
字符串参数按 UTF-8、以 `\0` 结尾，用完自己 `_free`。

### 生命周期

| 函数 | 说明 |
| --- | --- |
| `emu_web_set_interface_image(rgba, w, h)` | **必须第一个调**。把界面图（`interface.png`）解好的 RGBA 灌进来 |
| `emu_web_init(model_dir, script_path)` | 启动。`model_dir` 是 MEMFS 里的路径，比如 `"/model"`；`script_path` 传 0 表示不要启动脚本 |
| `emu_web_ready()` / `emu_web_destroy()` | 查状态 / 销毁 |
| `emu_web_device_width()` / `emu_web_device_height()` | 画面尺寸（cnx 是 284×597，cncw 是 284×562） |

### 跑时间

| 函数 | 说明 |
| --- | --- |
| `emu_web_run(elapsed_ms)` | 推进这么多毫秒的模拟时间。返回值 1 表示这轮画了新的一帧。单次最多按 100 ms 算 |

浏览器里直接用 `requestAnimationFrame` 的时间差喂给它就行；核心会自己把小数余数和
「每毫秒该跑多少周期」对上，不用你操心。

### 拿画面

| 函数 | 说明 |
| --- | --- |
| `emu_web_fb()` | 返回 RGBA 像素指针。**堆扩容后指针会变，每帧重新取** |
| `emu_web_fb_size()` | 字节数 = 宽 × 高 × 4 |

像素布局是内存里 R、G、B、A 逐字节排列，正好能 `new ImageData(...)` 之后
`ctx.putImageData()` 直接画。

### 输入

| 函数 | 说明 |
| --- | --- |
| `emu_web_key(sdl_key_name, down)` | 按下/松开一个键。键名用 SDL 的写法，比如 `"1"`、`"F1"`、`"Keypad 5"`、`"Left Shift"`。返回 0 表示这个名字不认识 |
| `emu_web_pointer(phase, x, y)` | 鼠标。`phase`：0 移动 / 1 左键按下 / 2 左键松开 / 3 右键按下 / 4 右键松开。坐标就是界面图的像素坐标 |

**注意一个上游的怪脾气**：松开任何一个键（`down = 0`）会调 `ReleaseAll()`，
把所有没被锁住的键一起放开。所以按住多键同时按是不行的，一次按一个。
右键是「锁定」——按下去那个键就卡住不放，直到下一次任意松开。

### 机型信息

| 函数 | 说明 |
| --- | --- |
| `emu_web_button_count()` | 有几个按钮 |
| `emu_web_button_rect(i, int* out4)` | 第 i 个按钮的 `{x, y, w, h}`，界面图像素坐标 |
| `emu_web_button_name(i, buf, cap)` | 第 i 个按钮绑的 SDL 键名（可能是空串） |
| `emu_web_hardware_id()` | 4 = CLASSWIZ（fx-991CN X），5 = CLASSWIZ II（fx-991CN CW） |
| `emu_web_model_name(buf, cap)` | 机型名 |

前端做点击热区和键盘映射，就靠后面三个——不用自己解析 `model.lua`。

### 控制 / 存档 / 调试

| 函数 | 说明 |
| --- | --- |
| `emu_web_set_paused(p)` / `emu_web_is_paused()` | 暂停 |
| `emu_web_reset()` | 复位 |
| `emu_web_command(lua_code)` | 丢一段 Lua 进核心执行（上游的调试通道） |
| `emu_web_save_size()` / `emu_web_save(buf, cap)` / `emu_web_load(buf, len)` | 存/读电池供电 RAM（CNX 8 KB，CNCW 24 KB）。塞 localStorage 即可 |
| `emu_web_read_mem(addr, buf, len)` / `emu_web_write_mem(addr, buf, len)` | 直接读/写模拟内存 |
| `emu_web_write_file(path, data, len)` | 往 MEMFS 写文件。**目录要先自己建**（`FS.mkdirTree`） |

---

## 四、前端怎么接

最省事的路径是直接用 `js/casioemu-client.js`：

```html
<script src="dist/casioemu_web.js"></script>
<canvas id="screen"></canvas>
<script type="module">
  import { CasioEmu } from './js/casioemu-client.js';

  const emu = await CasioEmu.create({
    modelUrl: '../release/fx991cnx/',          // 里面有 model.lua / rom.bin / interface.png
    scriptUrl: new URL('./dist/casioemu_web.js', import.meta.url).href,
  });

  const canvas = document.getElementById('screen');
  const ctx = canvas.getContext('2d');
  emu.onFrame = (image) => {
    canvas.width = image.width;
    canvas.height = image.height;
    ctx.putImageData(image, 0, 0);
  };

  // 键盘
  addEventListener('keydown', (e) => {
    if (e.repeat) return;
    const name = CasioEmu.keyNameFromEvent(e);
    if (name && emu.keyDown(name)) e.preventDefault();
  });
  addEventListener('keyup', (e) => {
    const name = CasioEmu.keyNameFromEvent(e);
    if (name) emu.keyUp(name);
  });

  // 鼠标点按钮
  canvas.addEventListener('pointerdown', (e) => {
    const p = emu.atlasPointFromEvent(canvas, e);
    emu.pointer(1, p.x, p.y);
  });
  canvas.addEventListener('pointerup', (e) => {
    const p = emu.atlasPointFromEvent(canvas, e);
    emu.pointer(2, p.x, p.y);
  });

  emu.start();
</script>
```

`emu.buttons` 是 `[{index, name, rect:{x,y,w,h}}]`，可以直接拿来做热区提示。

服务端要给 `.wasm` 发 `Content-Type: application/wasm`，不然浏览器会拒。

---

## 五、不开浏览器的测试

```bash
# 编译完之后
node web/test/run_node.js
node web/test/run_node.js --model fx991cncw --frames 400
node web/test/run_node.js --keys "1,2,3" --png web/test/out/screen.png
```

它做这几件事：

1. 用 `tools/png_to_rgba.py` 把 `interface.png` 解成 RGBA
2. 把 `model.lua` / `rom.bin` / `interface.png` 通过 `emu_web_write_file` 写进 MEMFS
3. 灌图、`emu_web_init`、跑帧
4. 把液晶屏用字符画打两遍：一遍读显存 `0xF800`，一遍从渲染结果里读回来，**两边应该完全一样**
5. 有 `--keys` 就按一遍并打印按键后的屏幕
6. 有 `--png` 就存一张整屏截图

---

## 六、改了上游哪些地方

改动全部用 `#ifndef CASIOEMU_WEB` 或 `#ifdef CASIOEMU_WEB` 包住，**不加这个宏时行为跟原来一模一样**。

| 文件 | 改了什么 |
| --- | --- |
| `emulator/Emulator.cpp` | 网页版不启 tick 线程，改成一个默认构造的 `std::thread`（析构里的 `join()` 自然变成空操作） |
| `emulator/Chipset/CPU.cpp` | 屏蔽 `#include "../Gui/Ui.hpp"` |
| `emulator/Chipset/CPUControl.cpp` | 同上 |
| `emulator/Chipset/CPUPushPop.cpp` | 同上 |
| `emulator/Chipset/Chipset.cpp` | 同上 |
| `emulator/Peripheral/BatteryBackedRAM.cpp` | 同上 |
| `emulator/Chipset/MMU.cpp` | 屏蔽 Gui 头，以及两处 `MemBreakPoint::instance` 的调用 |

---

## 七、几件值得知道的事

- **PNG 不在 C++ 里解。** SDL 替身的 `IMG_Load()` 不去读文件、不解码，只把前端提前
  通过 `emu_web_set_interface_image()` 塞进来的像素交出去。`interface.png` 还是要写进
  MEMFS，那是因为上游的代码会去 `fopen` 它——但内容是谁都行。
- **Lua 是完整编进去的**（5.3.6，33 个 `.c`），所以 `model.lua` 里的数据表是原样生效的。
- **单线程。** 没开 pthread。时间由 JS 通过 `emu_web_run()` 推着走，核心自己不跑循环。
- **渲染是逐像素软件光栅。** 一帧要做大约 12000 次 1×1 的贴图拷贝（液晶点阵），
  在浏览器里够用，但别指望能跑几千帧每秒。
- **`real_hardware = 0` 的机型**（目前发布的这两个都不是）会有额外 0x100 字节的 RAM 段，
  `emu_web_save_size()` 已经把这点算进去了。
