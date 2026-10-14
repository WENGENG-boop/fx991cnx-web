# fx-991CN X Web

在浏览器里运行 fx-991CN X 原机固件的网页计算器：基于 [CasioEmuNeo](https://github.com/qiufuyu123/CasioEmuNeo) 的 nX-U8 指令级模拟内核，编译为 WebAssembly。

线上地址：<https://calculator.weo.asia/>（首页为展示页，计算器在 `/app/`）

> 独立项目，非 Casio 官方产品。**本仓库不包含任何计算器 ROM**（`rom.bin` 已被 `.gitignore` 排除）。请自行获取并放到 `release/fx991cnx/rom.bin`。

## 目录

| 路径 | 内容 |
| --- | --- |
| `CasioEmuNeo-master/` | 模拟器 C++ 内核与桌面版；`web/` 为 WASM 构建、`emu_web_*` C 接口与 JS 客户端 |
| `frontend/` | 计算器网页（写实机身 + 大按键面板），部署到 `/app/` |
| `showcase/` | 展示页，部署到 `/`；屏幕动画回放用真实 ROM 录制的显存帧 |
| `release/fx991cnx/`、`release/fx991cncw/` | 机型定义 `model.lua` 与面板图；ROM 需自备 |
| `tools/build-site.mjs` | 生成可部署的静态站点 `dist/` |

## 本地运行

需要 Node.js、Python，以及已激活的 [Emscripten SDK](https://github.com/emscripten-core/emsdk)（仅编译 WASM 时需要）。

```powershell
node CasioEmuNeo-master/web/build.mjs     # 编译 WASM → CasioEmuNeo-master/web/dist/
node frontend/server.mjs                  # 计算器  http://127.0.0.1:5173/frontend/
node showcase/server.mjs                  # 展示页  http://127.0.0.1:5176/
```

## 构建与发布

```powershell
node tools/build-site.mjs                                        # → dist/（会把本机的 rom.bin 打包进去）
npx wrangler pages deploy dist --project-name fx991cnx-web       # 上传到 Cloudflare Pages
```

`dist/` 是纯静态站点，任何支持 `application/wasm` 的静态托管都可以使用。发布带 ROM 的站点前，请自行确认 ROM 与面板素材的传播权限。

## 测试

```powershell
node CasioEmuNeo-master/web/test/run_node.js --model fx991cncw --frames 400
node CasioEmuNeo-master/web/test/cnx-regression.mjs
node --test frontend/tests/device.test.mjs
node showcase/tests/browser-check.mjs <playwright-core/index.mjs> <chrome.exe>
```

## 许可

GPL-3.0（见 `LICENSE`），继承自 CasioEmuNeo。计算器固件、机身与品牌归原权利人所有，不在本许可范围内。
