# linx — 现场内网出口代理 / 远程排查 开发规格（Spec）

> **版本**: v0.4-draft（架构二已确认，新增现场运维界面）
> **日期**: 2026-06-08
>
> **已确认**：①架构=**架构二（本地 zoe-his-mcp 组装参数 + linx 薄 relay 转发）**；②工具分层=本地 3 个（get_code 等）/ 远程 8 个；③密钥归属=**只留现场 linx（方案甲）**，并因此**新增现场运维界面**（见 §六）；④部署=单文件 exe + Windows 服务。
>
> **本版相对 v0.2 的关键调整**：不再把 11 个工具整体搬到 linx，而是**按「资源在哪、谁可达」对工具分层**：
> - **本地能做的留本地**（如 `get_code`，GitLab 是公司域名，办公室可直连）；
> - **只有医院内网可达的才走 linx**（日志平台、HIS 数据库）；
> - linx 退化为**极薄的「现场内网出口代理（relay）」**：**本地组装好参数/SQL，linx 仅负责把请求转发到内网并把结果带回**，逻辑与多项目配置仍留在本地 `zoe-his-mcp`。
> - 因密钥只留现场，linx **自带一个轻量运维 Web 界面**：维护各项目内网目标/凭据、展示公网连接信息、连通性自检。**注意：这只是「配置/状态」界面，仍无 LLM / 无问答 / 无聊天。**
>
> **定位**: 部署在医院现场「内外网互通」电脑上的 **无 LLM / 无问答** 的轻量出口代理（含运维配置界面）。
> **关联项目**:
> - `zoe-his-mcp` (`D:\code\zoe_debug_app\zoe-his-mcp`) — 本地 stdio MCP Server，**保留并继续作为 Cursor 直连的 MCP**，承载全部工具逻辑/参数组装/多项目配置。
> - `ZoeChat (SmartQA)` — Electron 智能问答应用，**不复用其问答/Agent/UI**。
> - `his-log-diagnosis` skill — Cursor 本地技能，继续作为「大脑」编排排查链路。

---

## 一、背景与目标

### 1.1 痛点

程序员在公司，**部分资源仅医院内网可达**（日志平台 API、HIS 达梦/Oracle 数据库），出现线上问题时无法远程排查。但**并非所有资源都不可达**——GitLab 是公司域名（`gitlab.zoesoft.com.cn`），办公室本就能直连。

### 1.2 重新审视：哪些事本地能做，哪些必须远程

| 工具 | 依赖资源 | 资源位置 | 公司办公室可达？ | 归属 |
|------|----------|----------|------------------|------|
| `query_log` | 日志平台 API (HTTP) | 医院内网 | ❌ | **远程**（经 linx HTTP relay） |
| `query_sql_log` | 同上 | 医院内网 | ❌ | **远程** |
| `query_rpc_log` | 同上 | 医院内网 | ❌ | **远程** |
| `query_param_log` | 同上 | 医院内网 | ❌ | **远程** |
| `query_normal_log` | 同上 | 医院内网 | ❌ | **远程** |
| `query_trace_by_msgid` | 同上（多次日志查询编排） | 医院内网 | ❌ | **远程** |
| `query_business_data` | Oracle/达梦 (DB 协议) | 医院内网 | ❌ | **远程**（经 linx DB relay） |
| `get_table_schema` | Oracle/达梦 (DB 协议) | 医院内网 | ❌ | **远程** |
| `get_code` | GitLab API (HTTP) | **公司域名** | ✅ | **本地直接**（不经 linx） |
| `list_code_repositories` | 本地配置文件 | 本地 | ✅ | **本地** |
| `discover_gitlab_projects` | GitLab API | **公司域名** | ✅ | **本地直接** |

> 关键观察（来自源码核对）：
> - 6 个日志工具底层都是同一个调用：`fetch(baseUrl + logPath, { POST, headers, body })`，**只是 body 不同**。复杂的参数组装（`filterParamet`、`indexvalue`、南安 `legacy` 等差异、Redis 取 token、响应解析）全在 `zoe-his-mcp` 代码里 → 这些**逻辑可以留本地**，linx 只转发最终 HTTP 请求。
> - DB 工具走的是 oracledb/dmdb 原生协议（非 HTTP），linx 需提供一个**只读 SQL 转发端点**。
> - GitLab 在公司可达 → `get_code` 系列**完全不需要 linx**。

### 1.3 核心思路（解耦 + 分层）

```
┌──────────────── 旧（耦合）────────────────┐
│ ZoeChat = LLM 问答 + 工具 + UI（一个 App） │
└───────────────────────────────────────────┘

┌──────────────── 新（解耦 + 出口下沉）──────────────────────────┐
│ 大脑(LLM)        → 公司本地 Cursor（his-log-diagnosis skill）   │
│ 工具逻辑/组装/多项目 → 公司本地 zoe-his-mcp（照旧，stdio）       │
│ GitLab/本地能做的    → 公司本地直接做                            │
│ 仅「内网出口」        → 下沉到医院现场 linx（薄 relay）          │
└────────────────────────────────────────────────────────────────┘
```

> **一句话**：本地 `zoe-his-mcp` 照旧组装好「要发给日志平台的 HTTP 请求」或「要在内网库执行的 SELECT」，把它**交给现场 linx 代发**；linx 不懂业务、不组装参数、不含 LLM，只做「认证 → 转发到内网 → 回传结果」。**逻辑与密钥可分置：组装逻辑在本地，内网地址/库凭据可只留在现场 linx。**

### 1.4 目标

| 目标 | 描述 |
|------|------|
| **极薄出口代理** | linx 只做 HTTP/DB 转发 + 认证，无业务逻辑、无 LLM、无 UI |
| **远程可达** | 本地通过外网 IP/域名连 linx 代发内网请求 |
| **本地优先** | 公司可达的（GitLab/代码）一律本地直做，不绕现场 |
| **多项目** | 多项目切换由本地 `zoe-his-mcp` 负责，linx 仅按 project 选内网目标 |
| **安全可控** | API Key 认证 + 可选 IP 白名单 + 只读 SQL + 输出限制 |
| **现场可运维** | 自带轻量 Web 界面：维护项目配置/凭据、展示公网连接信息、连通性自检（见 §六） |
| **易部署 + 自报地址** | 现场 Windows 一键常驻；**安装后自动探测并显示可用连接地址**（见 §六） |

### 1.5 明确不做（Out of Scope）

- ❌ LLM / DeepSeek / 问答会话 / ReAct
- ❌ 聊天界面、问答页、分析历史、追问会话（**配置/状态运维界面除外**，见 §六）
- ❌ 业务参数组装、日志响应解析（这些留在本地 zoe-his-mcp）
- ❌（一期）本机命令执行 / SSH 探针

---

## 二、架构选型（核心待确认）

「本地组装参数、远程调用」这一思路，决定了 **Cursor 直连的 MCP 是本地的，linx 不是 MCP 而是 relay**。这与 v0.2「linx 作为远程 MCP Server」不同。两种架构对比如下：

### 架构二（v0.3 推荐）：本地 MCP + linx 薄代理

```
公司办公室                                     医院现场
┌─────────┐  stdio  ┌──────────────────┐      ┌───────────────────────────┐
│ Cursor  │◄───────►│ zoe-his-mcp(本地) │      │  linx (现场, 薄 relay)      │
│ + skill │  MCP    │  • 11 工具逻辑    │      │  • 认证 API Key            │
└─────────┘         │  • 参数/SQL 组装  │ HTTP │  • /relay/http → 内网日志API│
                    │  • 多项目配置     │═════►│  • /relay/db   → 内网 DB    │
                    │  • get_code(直连) │ 外网 │  • /whoami /health         │
                    └────────┬─────────┘      └─────────────┬─────────────┘
                             │ GitLab(公司可达，直连)         │ 内网
                             ▼                                ▼
                        gitlab.zoesoft.com.cn        日志平台 / HIS-DB / Redis
```

- **优点**：①完全贴合「本地组装、远程调用」；②逻辑/迭代留本地，**改工具无需重新部署现场 exe**；③linx 极薄、极稳、几乎不用更新；④`get_code` 自动本地；⑤**医院 DB 密码等只留在现场 linx，不下发到开发者笔记本**（密钥与逻辑分离）；⑥本地 zoe-his-mcp 现已安装配置，边际成本低。
- **代价**：①linx 不是标准 MCP，而是私有 relay 协议（需本地 zoe-his-mcp 配合改造「出口走 linx」）；②本地仍需保留/配置 zoe-his-mcp。

### 架构一（v0.2 旧案，备选）：linx 作为完整远程 MCP Server

- Cursor 直接用 `url` 连 linx；linx 内含 11 工具逻辑 + 多项目 + Streamable HTTP。
- **优点**：消费端零本地依赖（只填 mcp.json url）。
- **代价**：工具逻辑/配置/密钥都在现场，`get_code` 也被迫远程；改逻辑要重部署现场 exe；与「本地组装参数」相悖。

> **建议**：采用**架构二**。它直接实现你的三点想法（工具分层、本地组装远程调用、get_code 本地）。下文按架构二展开；若你更看重「消费端零本地依赖」，可回退架构一。**此为 §九 待确认第 1 条。**

---

## 三、linx 对外能力（架构二）

linx 不再暴露 11 个 MCP 工具，而是少量通用 relay 端点（REST + Bearer 认证）：

| 端点 | 方法 | 入参（本地组装） | 作用 |
|------|------|------------------|------|
| `/relay/http` | POST | `{ project, method, path, headers?, body? }` | 转发到该 project 的内网日志平台 API（linx 拼 baseUrl、可代取 token），回传原始响应 |
| `/relay/db` | POST | `{ project, sql, options? }` | 在该 project 的内网库执行**只读 SELECT**，回传行集（linx 校验 SELECT、限行、超时） |
| `/projects` | GET | — | 返回 linx 已配置的可用 project 列表（供本地核对/发现） |
| `/whoami` | GET | — | 返回 linx 探测到的公网出口 IP、本机网卡 IP、端口、版本（见 §六） |
| `/health` | GET | —（免认证） | 探活 |

> 设计要点：linx **不理解** body 语义，对日志查询是「透明转发」；对 DB 则因协议原因必须落地一个受限的 SQL 执行端点（只读、限行、超时、脱敏可选）。
>
> **密钥归属（待确认第 4 条）**：内网日志 API 的 token、DB 账号密码——
> - 方案甲（推荐）：**只配在现场 linx**（`/relay/*` 按 `project` 自行取用），本地只需 `{linx 地址, API Key, project 列表}`，开发者机器不持有医院密码。
> - 方案乙：本地每次随请求下发凭据，linx 不存——开发者机器需持有医院密码（不推荐）。

### 3.1 本地 zoe-his-mcp 的改造点

- 新增「出口模式」开关：当目标 project 标记为 `via-linx` 时，原本 `fetch(内网URL)` / `db.query()` 改为调用 linx 的 `/relay/http` / `/relay/db`。
- 改造集中在 `api-client.ts`（HTTP 出口）与 DB 查询出口两处，**工具与组装逻辑零改动**。
- `get_code` / GitLab 路径完全不变（继续本地直连）。

---

## 四、多项目切换（架构二）

多项目**由本地 `zoe-his-mcp` 主导**（它本就支持 `ZOE_PROJECT_CODE` + `ZOE_<code>_*` env）：

- 本地决定「当前是哪个医院/环境」，并把 `project` 字段随每次 relay 调用传给 linx。
- linx 侧按 `project` 选择对应内网目标（日志 baseUrl、DB 连接）。
- 切换方式（本地）：沿用 env / 或给本地 mcp 增加 `use_project(code)` 工具 / 或工具透传 `project` 参数。
- 一台 linx 可服务多个 project（同一医院多环境），跨医院则各现场各一台 linx，本地按地址区分。

> 注：v0.2 的「Cursor 多条目 url 开关切项目」属于架构一的做法；架构二下切项目是本地 mcp 的职责，Cursor 只连一个本地 mcp。

---

## 五、安全设计

| 层 | 措施 | 说明 |
|----|------|------|
| L1 传输 | HTTPS（可选，Nginx 反代或内置 TLS） | 公网暴露建议开启 |
| L2 认证 | **API Key（Bearer）** | 每次 relay 请求校验，可重置 |
| L3 来源 | **IP 白名单**（可选） | 留空=不限制 |
| L4 数据安全 | **`/relay/db` 仅允许 SELECT** + 限行 + 超时；GitLab 不经 linx | relay 层再校验一次，纵深防御 |
| L5 转发约束 | `/relay/http` 仅允许转发到**已配置的内网目标**（按 project 白名单），不做开放正向代理 | 防 SSRF/被当跳板 |
| L6 审计 | 调用留痕（project、端点、来源 IP、时间、SQL 摘要） | 一期基础审计 |

> 因无命令执行/SSH，无命令注入面；`/relay/http` 限定目标避免成为开放代理。

---

## 六、现场运维界面 + 公网 IP / 连通性

因密钥只留现场（方案甲），需要现场人员能维护配置、查看连接信息。linx 自带一个**轻量本地 Web 运维界面**（仍无 LLM/问答）。

### 6.1 运维界面（Admin Web UI）

- **形态**：linx 进程内置一个本地 Web 页面（如 `http://localhost:8080/admin`），用浏览器打开即可；单文件 exe 自带静态页，无需另装。可选系统托盘图标「打开控制台 / 复制连接信息 / 启停」。
- **访问控制**：仅本机 / 局域网访问 + 管理口令（与对外 relay 的 API Key 区分）。
- **功能**：

| 模块 | 内容 |
|------|------|
| 连接信息卡 | **公网出口 IP、内网网卡 IP 列表、监听端口、对外 API Key（可一键复制 / 重置）、健康检查 URL**；一键复制「本地 zoe-his-mcp 该填的配置」 |
| 连通性自检 | 端口监听状态、出口 IP 探测、（可选）回连测试，给出「公司侧能否进来」的判断与处置建议 |
| 项目配置 | 增删改各 project 的**内网日志 baseUrl / token（或 Redis 取 token）/ DB 连接与账号密码**；「测试连通」按钮（现场点一下验证内网可达） |
| 服务状态 | 运行时长、最近 relay 调用计数、错误计数、审计日志查看 |
| 安全 | API Key 重置、IP 白名单维护、（可选）开启内置 HTTPS |

> 密码类字段加密落地（参考 zoe-his-mcp/ZoeChat 用 crypto-js 的做法），界面只回显掩码。

### 6.2 公网 IP / 连通性（回答你的问题）

> **问：linx 安装好，能直接告诉我公网 IP 吗？**
>
> **能告诉你「公网出口 IP」，但「公司侧能否直接连上」还要看 NAT/防火墙/端口转发，需一次连通性自检确认。** 二者是两回事：

- **出口公网 IP（能自动探测）**：linx 启动时（现场有外网）向外部 echo 服务（如 `api.ipify.org` 或公司自建 echo）查询，得到本机公网出口 IP，连同内网网卡 IP、端口、API Key **打印到启动横幅 + 展示在运维界面 + 暴露在 `/whoami`**。
- **入站可达性（需自检，不一定等于出口 IP）**：若现场处于 NAT/运营商大内网后面，出口 IP 未必能被公司侧直接拨入，可能需要**端口映射/防火墙放行**。
- **自检手段**：运维界面「连通性自检」按钮 + `/health`；不可达时提示路由器端口转发、Windows 防火墙入站规则、或 Nginx/frp 内网穿透。

> 产出：启动即在控制台 + 运维界面显示「连接信息卡」，现场人员把它发给公司开发者照抄进本地 zoe-his-mcp 配置即可。

---

## 七、配置设计

### 7.1 现场 linx 配置（`linx.env`）

```env
# ===== 服务 =====
LINX_PORT=8080
LINX_API_KEY=<32位随机串>
LINX_IP_WHITELIST=               # 逗号分隔，留空=不限制
LINX_PUBLIC_IP_ECHO=https://api.ipify.org   # 出口 IP 探测源（可换公司自建）

# ===== 各 project 的内网目标（密钥只留现场，方案甲）=====
# 日志平台
ZOE_seyy_API_BASE_URL=http://192.168.5.24:8081
ZOE_API_LOG_PATH=/log-manage-service/log/search
ZOE_seyy_REDIS_HOST=...           # 用于 linx 代取 token（或静态 token）
# 内网数据库
ZOE_DB_seyy_TYPE=oracle
ZOE_DB_seyy_HOST=192.168.3.209
ZOE_DB_seyy_PORT=1521
ZOE_DB_seyy_USERNAME=...          # 仅现场持有
ZOE_DB_seyy_PASSWORD=...
ZOE_DB_seyy_SERVICE_NAME=SEYYMDB
```

> 结构沿用 `zoe-his-mcp/.env`，迁移成本低。

### 7.2 本地 zoe-his-mcp 新增配置

```env
# 标记某 project 走现场 linx 出口
ZOE_seyy_VIA_LINX=true
LINX_BASE_URL=http://<现场出口IP>:8080
LINX_API_KEY=<与现场一致>
# 本地不再需要医院 DB 密码（方案甲）
```

---

## 八、目录结构（建议，架构二）

```
linx/                              # 现场薄代理 + 运维界面（新建）
├── src/
│   ├── index.ts                   # 启动 express + 打印连接信息卡
│   ├── server.ts                  # relay 路由：/relay/http /relay/db /projects /whoami /health
│   ├── admin/                     # 运维界面（后端）
│   │   ├── routes.ts              # /admin API：配置 CRUD、自检、状态、API Key 重置
│   │   └── auth.ts                # 管理口令（与对外 API Key 区分）
│   ├── auth.ts                    # 对外 relay 的 API Key + IP 白名单
│   ├── relay-http.ts              # 转发到内网日志 API（按 project 限定目标）
│   ├── relay-db.ts                # 只读 SQL 执行（oracledb/dmdb，限行/超时）
│   ├── public-ip.ts               # 出口 IP 探测 + 连通性自检
│   ├── config-store.ts            # 多 project 内网目标 + 凭据（加密落地）
│   └── config.ts                  # 加载/合并配置
├── web/                           # 运维界面（前端静态页，打包进 exe）
│   └── index.html / app.js        # 连接信息卡、项目配置、自检、状态
├── linx.env(.example)
└── package.json

zoe-his-mcp/                       # 本地（改造，非新建）
└── 仅改 api-client / db 出口：via-linx 时转调 linx relay
```

---

## 九、决策状态

### 9.1 已确认

| # | 事项 | 结论 |
|---|------|------|
| 1 | 架构选型 | ✅ **架构二**：本地 zoe-his-mcp 组装参数 + linx 薄 relay 转发 |
| 2 | 工具分层 | ✅ 远程 8 个（6 日志 + 2 DB）；本地 3 个（`get_code`/`list_code_repositories`/`discover_gitlab_projects`），GitLab 公司可达直连 |
| 4 | 密钥归属 | ✅ **方案甲**：医院凭据只留现场 linx → 故 linx **新增运维界面**维护配置 |
| 6 | 部署形态 | ✅ 单文件 exe（pkg）+ Windows 服务常驻 |
| — | 运维界面 | ✅ linx 自带轻量本地 Web 运维界面（配置/连接信息/自检/状态），无 LLM/问答 |
| — | 公网 IP | ✅ 自动探测出口 IP + 连接信息卡 + 连通性自检 |

### 9.2 默认采用（如无异议即按此执行）

| # | 事项 | 默认结论 |
|---|------|----------|
| 3 | DB 转发 | linx 落只读 SQL 端点 `/relay/db`（仅 SELECT + 限行 + 超时 + 防 SSRF 目标白名单） |
| 7 | 多项目 | 由本地 zoe-his-mcp 主导，relay 调用透传 `project`，linx 按 project 选内网目标 |

> 确认后我再补「relay 接口契约（请求/响应 schema）+ 运维界面接口 + zoe-his-mcp 出口改造清单 + linx 最小实现」，进入编码。

---

## 附：相对 v0.2 的变化说明

| v0.2 决策 | v0.4 状态 |
|-----------|-----------|
| 传输=Streamable HTTP（MCP） | **变更**：架构二下 linx 非 MCP，改为 REST relay（HTTP+JSON）；MCP 仍是本地 stdio |
| 多项目=URL 路径 + Cursor 多条目 | **变更**：改由本地 zoe-his-mcp 主导，relay 透传 project |
| 工具范围=11 个工具全搬 linx | **变更**：分层——本地 3 个、远程 8 个；linx 不持有工具逻辑 |
| linx 无界面 | **变更**：新增**轻量运维界面**（配置/状态），但仍无 LLM/问答 |
| 部署=exe + Windows 服务 | **不变** |
