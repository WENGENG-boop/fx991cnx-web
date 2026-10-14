# FX-991CN X 网页版

当前界面：iPad/宽屏保留左侧完整机身，右侧提供清晰的50个大按键和同步液晶，操作同一份ROM状态。手机/窄分屏默认整屏适配，可用「退出整屏／适应整屏」切换；根据Safari当前可见高度留出底部工具栏，整屏模式不靠滚动显示完整机身。Safari地址栏与状态栏不属于网页的全屏控制。低高度宽屏会压缩功能键排布；指南按需显示。

机身保留原约344×720像素图像，放大不会产生新细节；右侧按键为HTML文字界面，液晶使用原始点阵放大，不用照片中的固定屏幕内容。

使用现有 CasioEmuNeo 的 nX-U8 CPU / 外设内核与 `release/fx991cnx/rom.bin`，由 WebAssembly 运行原机程序。写实机身来自研究仓库 `readme_assets/cover.png` 左侧的 FX-991CN X；原图逐像素保留，液晶区接入真实 ROM 输出，50 个透明按钮重新标定为写实机身坐标，再映射回 `model.lua` 的原生按键坐标。

机身维持 344:720 的比例，自动按可用屏幕空间缩放；手机竖屏优先完整显示，横屏保留可读尺寸并允许上下滑动；iPad、分屏、横竖屏会重新计算比例。「放大操作」可切换到更大的按键，工具收在弹出面板中。画布至少 2× 采样（最高 3×，跟随设备像素密度与浏览器缩放）；默认平滑显示真实点阵，可在工具中启用「原始点阵」恢复硬像素边缘。普通字形直接来自 192×63 显存，状态按显存启用，避免旧图中的淡灰痕迹；没有重新排版算式或替换 ROM 字体。机身素材仍只有约 344×720，放大不会增加原始细节；此变化不是高清重绘。浏览器视觉验收进度见 [design-qa.md](./design-qa.md)。

## 本地启动

在工作区根目录运行：

```powershell
node CasioEmuNeo-master/web/build.mjs
node frontend/server.mjs
```

访问 **http://127.0.0.1:5173/frontend/**。默认服务仅监听本机，且只提供网页版所需文件。不能直接双击 HTML（资源需要 HTTP 加载）。只使用已构建产物时，无需再次构建。

手机/iPad 实际访问时，与电脑连接同一网络，并使用 `node frontend/server.mjs --host 0.0.0.0` 启动，然后在设备上打开 `http://电脑局域网IP:5173/frontend/`。默认本机服务不会自动开放局域网；端口已使用时应先停止原有前端服务或加 `--port 5175`。

构建需要 Node、Python 与已激活的 Emscripten SDK。默认 SDK 路径是用户目录下的 `emsdk`，也可设置 `EMSDK`。原有 Bash 构建脚本仍可用；新的 `build.mjs` 无需 WSL/Git Bash，支持 `--debug`，变更头文件或构建模式会使缓存失效。

## 操作

初始页面仅显示计算器与小型操作栏，不常驻标题、使用提示、侧栏或底部导航。点击「操作指南」才展开说明；宽屏显示侧栏，手机显示可关闭的覆盖面板。各项操作步骤也默认折叠，点击具体项目才展开；关闭按钮或 Esc 返回计算器，手机点击键名定位后自动收起说明。开关说明不清除计算器输入。

按需打开的「操作小抄」包含 18 项说明，按入门、常用计算、函数与设置、方程与数据、更多模式分类。点击说明中的键名只高亮对应面板按键，不自动执行或清空算式。

右侧操作正文已按官方 V02 重新整理，不只是更新引用：每条列出模式/格式前提、完整步骤、注意事项和对应页链接。分数、CALC、SOLVE、二次方程与双函数表等使用手册例题；负数和单变量统计录入另用简短辅助数值。明确区分 CALC 最后的执行确认、统计编辑器/计算屏幕的 OPTN 编号、函数表步长确认之后的生成确认，以及等式输入的 ALPHA → CALC 和执行计算的 =。左侧面板、ROM 与计算引擎未因这次说明重写而修改。

说明依据 [Casio 官方《fx-991CN X 用户说明书》](https://www.casio.com/content/dam/casio/global/support/manuals/calculators/pdf/004-zh-cn/f/fx-991CN_X_B_CN.pdf) RJA530830-001V02（72 页）整理，使用该修订版的印刷页码引用，已替换此前 V01 镜像引用。未复制整本说明书或打包 PDF，指南不适用于 CW 系列。

- 鼠标/触控笔即时按下；手指轻点在松开时输入，长按 180ms 后按住，可按原 ROM 连续输入。按键间隙已纳入互不重叠的触摸热区。
- 手指移动超过 10px 判为滑动，取消尚未提交的输入；浏览器取消触摸、失焦、切换后台、打开工具及改变面板尺寸会松键。长按已经提交的输入不会被回撤。
- 支持正常页面滚动与浏览器双指缩放，不禁用用户缩放。双指手势不会增加第二个按键输入。[手势处理依据](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/touch-action)
- 电脑键盘：数字、小数点、`+ - * / ( ) ^`；Enter 等于、Backspace 删除、Esc/空格清除、方向键移动。F1/F2 对应 SHIFT/ALPHA，F3/F4 对应菜单/ON，F5–F8 对应 OPTN/CALC/积分/变量 x。
- SHIFT 与 ALPHA 按照原机方式先按后松，再按目标功能键。
- 自动记忆保存到本浏览器 localStorage；关闭标签页及切换后台也会保存。内存备份应为本机型的 8192 字节，导入前可先导出备份。
- RAM 备份不是完整 CPU 快照；恢复时重新启动原机程序，不保证停留在原页面。

## 验证

```powershell
node CasioEmuNeo-master/web/test/run_node.js --keys "1,=,2,Return" --png CasioEmuNeo-master/web/test/out/cnx.png
node CasioEmuNeo-master/web/test/cnx-regression.mjs
node frontend/tools/check-skin.mjs
node --test frontend/tests/device.test.mjs
node --test frontend/tests/guide.test.mjs
node --test frontend/tests/display.test.mjs
python CasioEmuNeo-master/web/tools/check_keynames.py release/fx991cnx/model.lua
```

浏览器验收应覆盖算式输入、菜单切换、SHIFT/ALPHA、触屏缩放后的热区、失焦松键、刷新恢复和备份。完整功能兼容性受上游 CPU/外设模拟的准确性影响；不要把 ROM 可启动等同于所有真机功能已验证。

本次实测结果及未验收项见 [VERIFICATION.md](./VERIFICATION.md)。

可选浏览器检查：`node frontend/tests/browser-check.mjs <playwright-core/index.mjs绝对路径> <Chromium可执行文件绝对路径> [页面URL]`。仅检查时需要现成 Playwright 与 Chromium，正常运行不依赖它们。截图和报告写入 `frontend/qa-output/browser/`，Chromium 触屏模拟不能替代真实设备或 Safari。

## 静态打包

```powershell
node frontend/package.mjs
node frontend/server.mjs --dist --port 5174
```

`website-dist/` 是独立静态目录，包含 JS/WASM、面板、机型定义和本地 ROM。普通静态服务器即可运行，WASM 应使用 `application/wasm`。此步骤不上传文件。对外发布前须确认 ROM/面板资源的传播权限，并按 GPL 提供对应模拟器源码和许可。


功能与记忆生命周期复测：`node frontend/tests/browser-lifecycle.mjs <playwright-core/index.mjs> <Chromium.exe>`；矩阵/向量加法画面复测：`node frontend/tests/browser-modes.mjs <playwright-core/index.mjs> <Chromium.exe>`。使用隔离浏览器上下文，输出 `qa-output/full/`，不会修改用户浏览器的记忆。报告区分结果断言和需人工核对的截图，不代表穷尽原机全部数学功能。


整屏与独立大按键验证：`node frontend/tests/browser-responsive.mjs <playwright-core/index.mjs> <Chromium.exe>`，报告和截图在 `qa-output/responsive/`。测试覆盖同步输入、手机无文档滚动、完整机身与工具栏、平板50个大按键、指南、暂停/恢复及横竖屏。真实Safari须在设备上刷新复测。


右侧大按键现在按原机坐标等比例排列，方向键保留十字位置；SHIFT/ALPHA按ROM真实状态持续高亮。实时触摸组合键检查：`node frontend/tests/browser-modifiers.mjs <playwright-core/index.mjs> <Chromium.exe>`。这仍不替代实际iPad Safari复测。
