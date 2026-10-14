# 991 / INSTRUMENT 展示站

独立的项目展示页，和 `website/`、`frontend/` 互不依赖：不加载 WASM、ROM 或计算器脚本，只用一张机身图。

```powershell
node showcase/server.mjs                     # http://127.0.0.1:5176/（仅本机）
node showcase/server.mjs --host 0.0.0.0      # 手机/iPad 用 http://电脑局域网IP:5176/ 访问
```

风格是工业设计 / 工程图纸：纸色底、墨黑、信号橙，配 Bahnschrift 窄体（Windows 自带）。页面分四幕：

1. 机身带工程标注线入场；向下滚动时镜头推进液晶屏，切换为全屏点阵（`192×63 = 12096`）。
2. 爆炸图：ROM → CPU → WASM → 点阵四层随滚动分离，左侧说明逐层点亮。
3. 规格：超大号数字排版，进入视野时计数。
4. 信号橙结尾：点阵会避开鼠标，点击会产生波纹。

另有加载计数、跟随鼠标的坐标光标、本地时钟。动效开启时整页使用滚动吸附：开场 → 全屏点阵 → 爆炸图每一层 → 规格 → 结尾，每次滑动停在下一个位置。页脚可以关闭动效（关闭后不再固定滚动、不吸附）；系统开启「减少动态效果」时默认关闭。

## 屏幕画面来自真实 ROM

机身小屏和全屏点阵播放的是 `assets/lcd-frames.json`：用 `tools/capture-lcd.mjs` 在 WASM 内核上运行 `release/fx991cnx/rom.bin`，逐键按下并读取 0xF800 起的 192×63 显存录下的帧（每一步录两帧，间隔 500 ms，光标会像原机一样闪烁）。页面本身不加载 ROM 或 WASM，只回放这些帧。录制的算式：`1+2×3`、`1/3+1/6`（分数）、`√2`、`2^10`、`192×63`。

```powershell
node CasioEmuNeo-master/web/build.mjs     # 需要已构建的 web/dist
node showcase/tools/capture-lcd.mjs       # 重新录制 assets/lcd-frames.json
```

「开始计算」打开 `http://127.0.0.1:5173/frontend/`，需另行运行 `node frontend/server.mjs`；独立部署时改 `app.js` 开头的 `calculatorUrl`。

QA：`node showcase/tests/browser-check.mjs <playwright-core/index.mjs> <chrome.exe>`，截图输出到 `showcase/qa-output/`。
