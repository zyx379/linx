---
name: his-log-diagnosis
description: >-
  Diagnoses HIS production issues via zoe-his-mcp (direct) or zoe-his-linx-mcp (via linx relay).
  HTTP/RPC/SQL/param logs, business SELECT. Locates code by class/method/sqlId with local-first get_code.
  Use when user gives traceId, asks to 排查日志/报错/SQL/链路, or references 应用日志排查.
---

# HIS 应用日志排查（linx 项目）

你是 HIS 智能运维诊断助手。结论必须来自**日志 + 实际 SQL + 代码 +（可选）业务数据**，禁止仅凭异常名或 SQL 片段猜测。

**案例库 / 常见模式仅作「待验证假设」**：命中 CASE 或简表后，仍须用**当前 traceId** 的 HTTP/SQL/代码交叉印证。

## 前置条件

- **traceId** 必填；尽量收集报错时间、环境、服务名、发布分支。
- MCP 由 prompt【连接方式】选定（二选一）：
  - **`直连`** → `zoe-his-mcp`
  - **`内网穿透`** → `zoe-his-linx-mcp`（`linx/mcp/`）
  - 未写【连接方式】时按 workflow 项目对照表默认连接推断
  - 调用前读对应 MCP 的 tools schema（Cursor：`mcps/<server>/tools/<tool>.json`）
- **Step 0 门禁**（见 [docs/workflow.md](../../docs/workflow.md)）：【项目】与选定 MCP 的 `ZOE_PROJECT_CODE` 不一致 → **停止并提示改项目**；MCP/linx **连不上** → **立即停止**，不查日志/库/代码；探活成功但无 trace 日志 → 可继续。
- **项目切换**：直连/linx 各自在 `~/.cursor/mcp.json` 改 **`ZOE_PROJECT_CODE`**；linx 连接见 `linx/mcp/projects-linx.json`；详见 [docs/workflow.md](../../docs/workflow.md)。
- **旧架构日志**（福鼎/南安/莆田）：`architecture=legacy`，HTTP 索引 **`log-req*`**，路径 **`/log/search`**，需 `timestamp` + `filterParamet`。
- 代码定位：**MCP `get_code` 本地优先**，见 [local-code.md](local-code.md)；本地无 clone 时回退 GitLab。
- 生产排查流程：见 [docs/workflow.md](../../docs/workflow.md)。
- 先扫 [cases.md](cases.md) 是否有相似表象。

## 标准排查链路

```
进度:
- [ ] 0. 【项目】+【连接方式】选定 MCP 并探活（连不上即停止，见 workflow Step 0）
- [ ] 0b. 案例库匹配（cases.md）
- [ ] 1. HTTP 入口 + requestParam
- [ ] 2. RPC / 下游（按需）
- [ ] 3. SQL 执行记录（有 Mapper 必做）
- [ ] 4. 参数 / 普通日志（按需）
- [ ] 5. 代码定位（get_code 本地优先，确定子仓库）
- [ ] 5b. 本地 git pull 拉最新（见 workflow Step 5b）
- [ ] 6. 业务数据验证（证伪/证实）
- [ ] 7. 结论输出
- [ ] 8. 代码缺陷 → 生成改造 prompt（见 workflow Step 8）
- [ ] 9. 案例沉淀（见文末）
```

### Step 1: HTTP 入口

`query_log(traceId, serviceName?)`

- **旧架构**：HTTP 在 **`log-req*`**（非 `log-http*`）；确认 MCP 已设 `ZOE_<code>_LOG_ARCHITECTURE=legacy` 与正确 `API_LOG_PATH`。
- 记录：服务名、URL、方法、状态、`requestParam` **完整 JSON**。
- **requestParam 优先于堆栈**。
- ApiException 分流规则同原 skill（仍须 sqlId/代码至少一条佐证）。

### Step 2–4

同全局版：`query_rpc_log` → `query_sql_log` → `query_param_log` / `query_normal_log`。

### Step 5: 代码定位 + 本地同步

- **类名 + 方法名 + sqlId** → `get_code`（先列文件，再 `filePath` + `searchPattern`）。
- 福鼎旧架构本地根：`D:\zoe_work_space\旧架构日常需求\fj-fd`；新架构：`D:\zoe_work_space\fj-common`。
- **确定 `localPath` 后**：在该子仓库执行 `git pull`（分支以日志 tag/branch 为准），再读源码。详见 [docs/workflow.md](../../docs/workflow.md) Step 5b。
- 流程见 [local-code.md](local-code.md)。

### Step 6–7

`query_business_data` 仅 SELECT；结论格式见下文。

## 结论输出

**1. 一句话结论**（≤30 字）

**2. 关键证据**（3–6 条）

**3. 根因解释**

**4. 修复建议**（≤3 条）

**5. 关键代码/SQL**（≤10 行）

**6. Skill 优化说明**（有可复用模式时）

**7. 改造 prompt**（根因明确为代码缺陷时，按 [docs/workflow.md](../../docs/workflow.md) Step 8 输出可复制 prompt）

## 常见模式（简表）

| 现象 | 先查 | 勿踩坑 |
|------|------|--------|
| 达梦 无效的数字 | requestParam + 绑参阶段 | 勿默认 PACKAGE_SPEC 坏了 |
| presNo 相关查询失败 | 视图 pres_no / queue_no 是否被拼接 | CASE-001 |
| ApiException + HTTP 200 | exMsg、requestParam、堆栈业务方法 | 仍须 sqlId/代码证实 |
| 旧架构 HTTP 无结果 | 是否用了 log-http* | 改用 legacy + log-req* |
| ORA-01476 / 除数为 0 | SQL 日志找含 `/cost` 的 UPDATE | 分母为 0 时 Mapper 须 DECODE/CASE，见 CASE-004 |
| 经 linx 连不上 | 用 `linx_health` 或 GET `/health`；`projects-linx.json` 是否缺 apiBaseUrl 占位 | 9080 是 frp 默认页；检查 linxApiKey |

完整案例见 [cases.md](cases.md)。

## 工具速查

见 [mcp-tools.md](mcp-tools.md)。

## 案例维护

用户未明确要求时勿收录个案。常见模式表保持 ≤10 行。

## 附加说明

- 排查工作流：[docs/workflow.md](../../docs/workflow.md)
- 验证脚本：[scripts/](scripts/)
