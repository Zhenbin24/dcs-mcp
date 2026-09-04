# DCS Cloud Connector for WorkBuddy

将 DCS Cloud 平台接入 WorkBuddy，让用户通过自然语言管理项目、离线任务、数据文件。

采用 **MCP + Skill** 的 **用户自填 Token 子模式**（`auth_mode: token`）。**v2.0.0 起为 bootstrap-only 架构**：MCP Server 只负责下载 CLI + 登录，实际操作由 AI 直接执行 dcs CLI。

## 工作原理（v2 bootstrap-only）

1. 用户在 DCS Cloud 个人中心创建一个个人访问令牌 (PAT，`dcs_pat_` 开头)，复制后填入 WorkBuddy 表单。
2. WorkBuddy 通过 `npx dcs-cloud-mcp-server` 以 stdio 启动本 MCP Server（声明 `runtime: node`，用户机器无需自带 Node），把 PAT 通过环境变量 `DCS_PAT` 注入。
3. Server 启动时自动管理 `dcs` CLI 二进制（缓存于 `~/.workbuddy/connectors/dcs-cloud/bin/`）：
   - 查询 Gitee / GitHub 最新 release tag（国内优先 Gitee，失败回退 GitHub）。
   - 拉取该 release 的 `SHA256SUMS`，与本地二进制 hash 比对；**hash 不一致或本地不存在时才下载**（同 tag 热更新也能感知）。
   - 下载写入临时文件 → SHA256 校验通过 → 原子替换；失败则保留旧二进制。
   - 执行 `dcs auth login` 持久化登录（PAT 经 `DCS_PAT` 环境变量传递，不走 argv）。
4. AI 调用唯一的 MCP 工具 `dcs_setup`，获得 `bin_path`、`version`、登录状态。
5. 之后 AI **直接在终端执行 dcs CLI**（登录态在 `~/.dcs/config.yaml`，跨进程共享），无需再经 MCP 中转。CLI 即 API，新增命令零改造。

凭证（PAT）仅存储在用户本机，不上传云端。

> MCP Server 以 npm 包形式发布（包名 `dcs-cloud-mcp-server`，当前 `2.0.2`），`mcp.json` 用 `npx` 拉起。

## CLI 自动更新机制（v2.0.2+）

| 步骤 | 说明 |
|------|------|
| 定位最新包 | 调 release API 拿 latest tag；API 不可用时回退 `DEFAULT_TAG` |
| 判断要不要更新 | 比对本地二进制 SHA256 与远端 `SHA256SUMS`，**不以版本号文件驱动** |
| 下载 | 仅 hash 不一致时下载；先写 `*.download` 临时文件，校验后替换 |
| 失败兜底 | 下载失败时继续使用已有二进制 |

本机缓存文件（`~/.workbuddy/connectors/dcs-cloud/bin/`）：

| 文件 | 用途 |
|------|------|
| `dcs.exe` / `dcs-linux-amd64` / `dcs-darwin-*` | CLI 二进制 |
| `.sha256` | 本地 hash + release tag（`dcs_setup` 的 `version` 也读这里） |
| `mirror.cache` | 镜像选择缓存（24h） |

## 目录结构

```
dcs-cloud/
├── connector-meta.json     Connector 元信息（type=mcp, auth_mode=token）
├── mcp.json                MCP Server 连接配置（stdio，env 注入 ${DCS_PAT}）
├── token-schema.json       用户表单 Schema（收集 PAT）
├── icon.svg                Connector 图标
├── skills/
│   └── SKILL.md            MCP 工具说明（教 AI 如何使用）
└── server/                 MCP Server 实现（Node.js）
    ├── index.js
    ├── package.json
    └── package-lock.json
```

## 暴露的 MCP 工具

| 工具 | 说明 |
|------|------|
| `dcs_setup` | 引导 dcs CLI：按 SHA256 自动检测/下载/更新二进制 + PAT 登录，返回 `bin_path` / `version` / 登录状态 |

成功后 AI 直接在终端执行 `<bin_path> <子命令> --output json --no-history` 完成所有操作（项目、任务、工作流、计费、数据、容器），完整命令手册见 `skills/SKILL.md`。

## 本地开发与测试

```bash
cd server
npm install

# 启动 MCP Server（需先在环境里放 DCS_PAT）
$env:DCS_PAT = "dcs_pat_xxx..."   # PowerShell
node index.js
# 看到 [dcs-cloud-mcp] ready 即启动成功
```

首次启动会从 Gitee / GitHub Releases 下载当前平台的 `dcs` 二进制（约 24MB）到本机缓存。

环境变量：

| 变量 | 说明 |
|------|------|
| `DCS_PAT` | 用户 PAT，由 WorkBuddy 注入 |
| `DCS_RELEASE_BASE` | （可选）固定下载源 URL，禁用镜像选择与自动更新 |

## 发布 npm 包

MCP Server 需发布为 npm 包供 `npx` 拉起：

```bash
cd server
npm version patch --no-git-tag-version   # 或 minor / major
npm publish --access public
# 内网 registry：npm publish --registry https://your-registry/
```

同步更新 `connector-meta.json` 与 `index.js` 内 MCP server version。

`package.json` 已配置 `bin`（`dcs-cloud-mcp-server`）和 `files`（仅含 `index.js`），依赖由 npm 在安装时拉取，无需 bundle `node_modules`。

## 平台支持

二进制从 Gitee / GitHub Releases 自动拉取（镜像：Gitee 优先，GitHub 回退）：

| 平台 | 资产文件名 |
|------|-----------|
| Windows (`win32`) | `dcs.exe` |
| Linux (`linux`) | `dcs-linux-amd64` |
| macOS Intel (`darwin` x64) | `dcs-darwin-amd64` |
| macOS Apple Silicon (`darwin` arm64) | `dcs-darwin-arm64` |

Server 按 `process.arch` 自动选对应的 Mac 二进制，Apple Silicon 原生运行无需 Rosetta。

## 提交审核

提交给 WorkBuddy 团队时，**只打包 `dcs-cloud/` 目录**，不要包含：

- 根目录的 `tools/`（本地开发用的 dcs 二进制，不属于连接器）
- `.idea/` 等编辑器配置
- `server/node_modules/`（由 npm 在 `npx` 安装时拉取，无需打包）
