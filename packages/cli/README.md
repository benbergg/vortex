# @bytenew/vortex-cli

Vortex 命令行客户端 — 在终端直接调浏览器自动化能力，免写代码。底层走本地 `vortex-server` 的 HTTP API。

调试 vortex 时最方便的工具：单条 action 立刻反馈，省去搭 MCP 客户端。

## 安装

```bash
npm i -g @bytenew/vortex-cli
# 同时需要 vortex-server 在本地运行（默认 6800）
```

## 用法

```bash
vortex <module> <command> [options]
```

```bash
# 开新页面
vortex tab create --url https://example.com --active

# 截屏存盘
vortex capture screenshot --full-page --out shot.png

# 取标题 / DOM
vortex page info
vortex content getText --selector "h1"

# 跑 JS
vortex js evaluate --code "document.title"

# 抓 console / network
vortex console getErrors
vortex network filter --status-min 400
```

`vortex --help` 看全部模块；`vortex <module> --help` 看子命令。

## 模块

| 模块 | 子命令 |
|------|--------|
| `tab` | list / create / close / activate / getInfo |
| `page` | navigate / reload / back / forward / wait / info / waitForNetworkIdle |
| `dom` | query / queryAll / click / fill / type / select / scroll / hover / getAttribute / waitForMutation |
| `content` | getText / getHTML / getElementText / getAccessibilityTree / getComputedStyle |
| `js` | evaluate / evaluateAsync / callFunction |
| `keyboard` | press / shortcut |
| `mouse` | click / doubleClick / move |
| `capture` | screenshot / element / gifStart / gifFrame / gifStop |
| `console` | getLogs / getErrors / clear / subscribe |
| `network` | getLogs / getErrors / filter / getResponseBody / clear |
| `storage` | get/set/delete cookies + local/session storage + export/import |
| `file` | upload / download / getDownloads |
| `frames` | list / find |
| `shortcuts` | 常用组合：`vortex shortcuts copy-page-text` 等 |
| `raw` | `vortex raw <action> --params '{"k":"v"}'` 直接发任意 action |

## 通用选项

| 选项 | 默认 | 说明 |
|------|------|------|
| `--port <n>` | `6800` | vortex-server 端口（或 `VORTEX_PORT` env） |
| `--tab-id <n>` | active tab | 跨 tab 操作时指定 |
| `--json` | — | 部分命令支持机读 JSON 输出 |

## 退出码

- `0`：成功
- `1`：vortex action 失败（参数缺失 / 元素未找到 / 超时等）
- `2`：连接 vortex-server 失败（server 未启动）

## 调试

加 `DEBUG=vortex:*` 可看出请求/响应：

```bash
DEBUG=vortex:* vortex page info
```
