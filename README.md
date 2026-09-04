# DCS CLI

通过本机 `dcs` CLI 操作 DCS Cloud：登录配置、项目片区、数据、表格、在线容器、WDL 流程、离线任务、计费等。

当前文档对应版本：**1.2.0**

---

## 下载

国内用户推荐从 **[Gitee Releases](https://gitee.com/caolei-bnu/dcs_cli/releases)** 下载；也可从 **[GitHub Releases](https://github.com/BGIResearch/dcs_cli/releases)** 下载。可按版本选择，只下载需要的平台二进制。

### Latest（当前最新：v1.2.0）

Gitee：[v1.2.0](https://gitee.com/caolei-bnu/dcs_cli/releases/tag/v1.2.0) · GitHub：[v1.2.0](https://github.com/BGIResearch/dcs_cli/releases/tag/v1.2.0)

| 平台 | Gitee（国内推荐） | GitHub |
|------|-------------------|--------|
| Linux (amd64) | [dcs-linux-amd64](https://gitee.com/caolei-bnu/dcs_cli/releases/download/v1.2.0/dcs-linux-amd64) | [dcs-linux-amd64](https://github.com/BGIResearch/dcs_cli/releases/download/v1.2.0/dcs-linux-amd64) |
| macOS (Apple Silicon, arm64) | [dcs-darwin-arm64](https://gitee.com/caolei-bnu/dcs_cli/releases/download/v1.2.0/dcs-darwin-arm64) | [dcs-darwin-arm64](https://github.com/BGIResearch/dcs_cli/releases/download/v1.2.0/dcs-darwin-arm64) |
| macOS (Intel, amd64) | [dcs-darwin-amd64](https://gitee.com/caolei-bnu/dcs_cli/releases/download/v1.2.0/dcs-darwin-amd64) | [dcs-darwin-amd64](https://github.com/BGIResearch/dcs_cli/releases/download/v1.2.0/dcs-darwin-amd64) |
| macOS (Universal) | [dcs-darwin-universal](https://gitee.com/caolei-bnu/dcs_cli/releases/download/v1.2.0/dcs-darwin-universal) | [dcs-darwin-universal](https://github.com/BGIResearch/dcs_cli/releases/download/v1.2.0/dcs-darwin-universal) |
| Windows | [dcs.exe](https://gitee.com/caolei-bnu/dcs_cli/releases/download/v1.2.0/dcs.exe) | [dcs.exe](https://github.com/BGIResearch/dcs_cli/releases/download/v1.2.0/dcs.exe) |
| 校验和 | [SHA256SUMS](https://gitee.com/caolei-bnu/dcs_cli/releases/download/v1.2.0/SHA256SUMS) | [SHA256SUMS](https://github.com/BGIResearch/dcs_cli/releases/download/v1.2.0/SHA256SUMS) |

命令行安装（国内推荐 Gitee）：

```bash
# Linux
curl -L -o dcs \
  https://gitee.com/caolei-bnu/dcs_cli/releases/download/v1.2.0/dcs-linux-amd64
curl -L -o SHA256SUMS \
  https://gitee.com/caolei-bnu/dcs_cli/releases/download/v1.2.0/SHA256SUMS
sha256sum -c SHA256SUMS --ignore-missing   # 校验通过后再执行
chmod +x dcs
sudo mv dcs /usr/local/bin/dcs
```

```bash
# macOS（Apple Silicon 用 arm64；Intel 用 amd64；不确定可用 universal）
curl -L -o dcs \
  https://gitee.com/caolei-bnu/dcs_cli/releases/download/v1.2.0/dcs-darwin-arm64
curl -L -o SHA256SUMS \
  https://gitee.com/caolei-bnu/dcs_cli/releases/download/v1.2.0/SHA256SUMS
shasum -a 256 -c SHA256SUMS --ignore-missing
chmod +x dcs
sudo mv dcs /usr/local/bin/dcs
# 若提示无法打开/被拦截：xattr -d com.apple.quarantine /usr/local/bin/dcs
```

```powershell
# Windows PowerShell
Invoke-WebRequest -Uri "https://gitee.com/caolei-bnu/dcs_cli/releases/download/v1.2.0/dcs.exe" -OutFile dcs.exe
Invoke-WebRequest -Uri "https://gitee.com/caolei-bnu/dcs_cli/releases/download/v1.2.0/SHA256SUMS" -OutFile SHA256SUMS
# 校验（期望哈希见 SHA256SUMS 中 dcs.exe 一行）
$expected = (Get-Content SHA256SUMS | Where-Object { $_ -match 'dcs\.exe$' }) -replace '\s+dcs\.exe$',''
$actual = (Get-FileHash -Algorithm SHA256 .\dcs.exe).Hash.ToLower()
if ($actual -ne $expected.Trim()) { throw "SHA256 mismatch: $actual != $expected" }
# 将 dcs.exe 所在目录加入 PATH，或放到已有 PATH 目录中
```

### 完整性校验（推荐）

每个 Release 附带 [`SHA256SUMS`](https://gitee.com/caolei-bnu/dcs_cli/releases/download/v1.2.0/SHA256SUMS)。下载二进制后应先校验，再执行；校验失败则删除文件，不要运行。

当前 **v1.2.0** 哈希：

| 文件 | SHA256 |
|------|--------|
| `dcs-linux-amd64` | `f4cf819d2ee899e7071f3e0dd70d54a32ecc574747ab2d0d2b1427c1d83c315b` |
| `dcs-darwin-amd64` | `81feb704e6030daf6a046a650735bd7dbbf911887cb99ec1464ac86aeaa72ed5` |
| `dcs-darwin-arm64` | `d8b89e76bdbf424038be271c1d2d77d46e6c7f20a59739b8ccf270ee212ea15e` |
| `dcs-darwin-universal` | `f30e7cef256fc26b39fe7bdff00b8bba636a7680f7c3b4934847714b8c93843c` |
| `dcs.exe` | `5cd97323901baeea04af5b77d3208594b1f6630be94a10199b8a7a193af4a228` |

### 历史版本

在 [Gitee Releases](https://gitee.com/caolei-bnu/dcs_cli/releases) 或 [GitHub Releases](https://github.com/BGIResearch/dcs_cli/releases) 中选择目标版本（如 `v1.0.0`、`v1.1.0`、`v1.2.0`），下载该版本下的平台附件即可。

### main 分支（始终为最新二进制）

`main` 的 `cli/` 目录始终同步 **当前最新版** 各平台 CLI，也可直接下载：

| 平台 | 路径 |
|------|------|
| Linux (amd64) | [`cli/linux/dcs-linux-amd64`](cli/linux/dcs-linux-amd64) |
| macOS (arm64) | [`cli/macos/dcs-darwin-arm64`](cli/macos/dcs-darwin-arm64) |
| macOS (amd64) | [`cli/macos/dcs-darwin-amd64`](cli/macos/dcs-darwin-amd64) |
| macOS (Universal) | [`cli/macos/dcs-darwin-universal`](cli/macos/dcs-darwin-universal) |
| Windows | [`cli/win/dcs.exe`](cli/win/dcs.exe) |
| 校验和 | [`SHA256SUMS`](SHA256SUMS) |

安装后验证：

```bash
dcs --help
```

---

## 快速开始

任何业务命令前先完成登录与选项目：

```bash
dcs auth login
dcs project switch --id P1871461072416366593   # 不要写 <P...> 尖括号
dcs project current --output json              # 确认未报 not logged in
```

可选：`dcs region switch <region>`、`dcs config set base_url https://test.dcs.cloud`

登录成功后自动写入 `user_id`；`copilot_base_url` 随 `base_url` 推导，一般无需手设。

---

## 命令组总览

| 命令组 | 用途 |
|--------|------|
| `auth` / `login` / `logout` | PAT 登录、登出 |
| `config` | 本地配置（base_url、client_app、语言等） |
| `region` | 片区列表、切换、当前片区 |
| `project` | 项目列表、切换、详情、创建 |
| `data` | Files 浏览、上传、下载、push 入仓 |
| `table` | 数据表查询 |
| `terminal` | 在线容器 open/exec/read/create/upload/download |
| `analysis` | 个性化分析离线任务（非 WDL） |
| `workflow` | WDL 工作流列表、规划、投递 |
| `billing` | 计费组 |
| `history` | CLI 命令历史 |

不确定参数时用：`dcs <命令> --help`

---

## 输出与入参格式

### 输出格式（`--output`）

| 值 | 用途 |
|----|------|
| `table` | **默认**，人类可读表格 |
| `json` | 脚本推荐，结构化 JSON（含 `exit_code`、`data`、`error`） |
| `ndjson` | 批量结果时每行一条 JSON |

```bash
dcs workflow ls --output json
dcs terminal open --output json
dcs project current --output json
```

不加 `--output` 时为 **table**，不是 JSON。

### 入参 JSON（全局 `--json`）

部分命令支持用 JSON 传参：

```bash
dcs workflow submit_task --json '{"name":"Hello_Test", ...}'
dcs data upload --json @params.json    # @文件
# 或环境变量 DCS_JSON_PARAM
```

### 命令自省

```bash
dcs workflow plan --describe    # 参数说明
dcs workflow plan --schema      # JSON Schema
```

---

## auth — 登录 / 登出

| 命令 | 说明 |
|------|------|
| `dcs auth login` | PAT 登录（交互粘贴或 `--token`） |
| `dcs login` | 同上（顶层别名） |
| `dcs auth logout` / `dcs logout` | 登出，清除本地 token |

```bash
dcs auth login --token dcs_pat_xxxx --output json
```

**注意**：网页已登录 ≠ CLI 已登录；未登录时多数命令报 `83002` / `70102` / `41104`。

---

## config — 本地配置

| 命令 | 说明 |
|------|------|
| `dcs config init` | 初始化 `~/.dcs/config.yaml` |
| `dcs config show` | 查看当前配置 |
| `dcs config get <key>` | 读单个配置项 |
| `dcs config set <key> <value>` | 写配置项 |
| `dcs config language zh\|en` | 切换 CLI 语言 |

常用 key：`base_url`、`client_app`（如 `dcs-cloud-cli`）、`encrypt`、`tools.<ossutil|tosutil|obsutil|aws>`（外部下载工具路径）

---

## region — 片区

| 命令 | 说明 |
|------|------|
| `dcs region ls` | 列出当前用户可用片区（登录后写入 `available_regions`） |
| `dcs region switch <region>` | 切换片区（接受 zone 代码或显示名；重置 `data_cwd` 并自动设置该区最近项目） |
| `dcs region current` | 查看当前片区 |

---

## project — 项目

| 命令 | 说明 |
|------|------|
| `dcs project ls` | 列出有权限的项目 |
| `dcs project switch --id <code>` | 按 ID 切换（**不要带 `<>`**） |
| `dcs project switch --name <name>` | 按名称切换 |
| `dcs project current` | 当前项目 |
| `dcs project detail --code <code>` | 项目详情（余额等） |
| `dcs project create` | 创建个人项目 |
| `dcs project tags` / `omics` / `omics_tools` | 标签与组学元数据 |

**注意**：`terminal`、`workflow`、`data` 等依赖 `current_project`，切换项目后在线容器会话失效，需 `terminal close` 再 `open`。

---

## data — 数据管理

| 命令 | 说明 |
|------|------|
| `dcs data ls` / `find` / `info` / `cd` / `pwd` / `rm` | 浏览与导航（路径 cwd 相对，默认 `/Files`） |
| `dcs data upload --type web --path <本机路径> --target /Files/...` | 本机小文件上传（约 ≤100MB，multipart） |
| `dcs data upload --type oss --path <本机路径> --target /Files/...` | 本机大文件上传（内置 TOS SDK，推荐大文件） |
| `dcs data upload --cluster-mode other --path <集群路径> --target /Files/...` | 集群已有文件上传到 Files |
| `dcs data upload --cluster-mode batch_import --path <表格路径> --target /Files/...` | 表格批量导入（csv/xlsx/xls） |
| `dcs data download --type web --path <云路径> --target <本机目录>` | 直接下载到本机（≤200MB，不支持 FastQ/bam/文件夹） |
| `dcs data download --type raysync --path <云路径> [--download-mode client\|command]` | raysync 下载（需本机 raysync 工具） |
| `dcs data download --type ossutil\|tosutil\|obsutil\|aws --path <云路径> --target <本机目录>` | 工具类下载（需对应 CLI，可用 `config set tools.<name>` 指定路径） |
| `dcs data push <src> <dest>` | 容器 `/work/...` → Files |
| `dcs data copy` / `move` | 复制 / 移动 |

下载参数为 **`--type` / `--path` / `--target`**（`-T` / `-p` / `-t` 简写）；`--source` 为 `--path` 的兼容别名。

---

## table — 数据表

| 命令 | 说明 |
|------|------|
| `dcs table ls` | 列出数据表 |
| `dcs table find` | 按条件查找 |
| `dcs table info` | 查看表内容 |

---

## terminal — 在线容器

| 命令 | 说明 |
|------|------|
| `dcs terminal ls_resource` | 列容器规格 |
| `dcs terminal open [--resource_id <id>]` | 打开容器 |
| `dcs terminal exec -c '<cmd>'` | 容器内执行 |
| `dcs terminal read/create/edit --path <容器绝对路径>` | 读写文件（read 仅文本） |
| `dcs terminal upload --path <容器路径> --file <本机文件>` | 本机文件上传到容器 |
| `dcs terminal download --path <容器路径> --target <本机路径>` | 从容器下载文件到本机 |
| `dcs terminal close [--force]` | 关闭容器 |

路径用容器内绝对路径（如 `/work/{user_name}/...`），不是本机路径。

---

## analysis — 离线任务（个性化分析，非 WDL）

| 命令 | 说明 |
|------|------|
| `dcs analysis run -t s -i '<cmd>' -l '<资源>' --image '<镜像>'` | 投递离线任务 |
| `dcs analysis ls` | 列任务 |
| `dcs analysis info` / `log` / `start` / `cancel` / `rm` / `consume` | 查详情、日志、控制 |

`-l` 与 `--image` 必填。WDL 流程投递用 **`dcs workflow submit_task`**，不要用 `analysis run`。

---

## workflow — WDL 工作流

| 命令 | 说明 |
|------|------|
| `dcs workflow ls` | 列流程（`-p` 公共库） |
| `dcs workflow info -n <name>` | 流程详情 |
| `dcs workflow plan -n <name>` | 多步规划 |
| `dcs workflow check_parameter -n <name>` | 查参数规格 |
| `dcs workflow submit_task -n <name>` | 投递 WDL 任务 |
| `dcs workflow tasks` / `task_info` / `task_log` / `start` / `cancel` / `rm` | 任务管理 |

标准流程：`workflow ls` → `plan` → `check_parameter` → `submit_task`

---

## billing — 计费组

| 命令 | 说明 |
|------|------|
| `dcs billing ls` | 查看有权限的计费组 |

---

## history — 命令历史

| 命令 | 说明 |
|------|------|
| `dcs history ls` | 列历史记录 |
| `dcs history get <request_id>` | 查单条记录 |

---

## 使用提示

- 自动化 / 脚本优先加 `--output json`
- 占位符 `<code>` 实际输入时**不要带尖括号**
- 路径：容器内用 `/work/...`；Files 用 `/Files/...`；本机用本机路径
- 本地上传：小文件 `--type web`，大文件 `--type oss`；集群路径用 `--cluster-mode other`
- 下载：小文件优先 `--type web`；大文件或批量用 `ossutil`/`tosutil`/`raysync` 等工具模式
- 二进制文件（如图片）不要用 `terminal read`；用 `data push` + `data download`
- 不确定子命令或参数时用 `dcs <cmd> --help`，不要凭记忆编造

### 常见错误码

| 码 | 含义 | 处理 |
|----|------|------|
| 83002 / 70102 / 41104 | 未登录 | `dcs auth login` |
| 83003 | 未选项目 | `dcs project switch` |
| 83006 | 容器未开 | `dcs terminal open` |
| 83007 | open 后立即 exec | 等 3–5 秒再 exec |
| 41102 | 无当前项目 | `dcs project switch` |
