# 代码定位（本地优先，GitLab 回退）

日志排查 **Step 5** 通过 MCP `get_code` 读源码。**优先本地 clone**，本地不存在或未配置时回退 GitLab。

## 本地路径配置

| 配置 | 说明 |
|------|------|
| `zoe-his-mcp/local-code-paths.json` | 按 `ZOE_PROJECT_CODE` 映射本地根目录 |
| `ZOE_<code>_LOCAL_CODE_ROOT` | 环境变量覆盖（优先级最高） |

当前默认映射：

| 项目 | 本地根目录 |
|------|------------|
| `fjfd`（福鼎旧架构） | `D:\zoe_work_space\旧架构日常需求\fj-fd` |
| `default` / 新架构 | `D:\zoe_work_space\fj-common` |

仓库子目录名 = GitLab `repositoryUrl` 最后一段（如 `zoe-optimus-nasyy`、`onelink-micro-charge-fj-common`）。

返回字段 `source: "local"` 表示来自本地；`source: "gitlab"` 表示回退远程。

## GitLab 回退

- `zoe-his-mcp/.env`：`GITLAB_TOKEN`、`GITLAB_BASE_URL`
- `code-repositories.json`：按医院显式配置 `repositoryUrl`
- **禁止**将公司库 `onelink-micro-charge-fj-common` 类推为各院独立命名

## 灵活分析：如何选仓库

日志里的 **服务名 ≠ 仓库名**。按下列线索综合判断：

| 线索 | 示例 | 倾向 |
|------|------|------|
| **sqlId / Java 包名** | `com.zoe.optimus.service.dict.dao.*` | Optimus 类仓库 |
| **urlPath** | `/dict/settle/settleManage/getCheckSettleState` | charge/settle 相关 |
| **serviceName** | `zoe-split-charge-service` | 仅为部署名，需与 sqlId 交叉验证 |
| **notes** | `code-repositories.json` | 已验证案例优先 |

## 调用顺序

```
1. list_code_repositories
2. get_code(serviceName, sqlId, urlPath)           # 列文件，得 localPath
3. git pull（在 localPath 子仓库，见 workflow Step 5b）
4. get_code(..., filePath, searchPattern)          # 读方法体
5. discover_gitlab_projects                          # 仅本地失败且需确认仓库名时
```

## 失败处理

| 错误 | 处理 |
|------|------|
| 本地目录不存在 | 检查 `local-code-paths.json` 或 clone 对应仓库到本地根 |
| 无匹配仓库 | 用 sqlId 重新匹配；补充 `code-repositories.json` |
| 本地无文件且无 TOKEN | 配置 `GITLAB_TOKEN` 或补齐本地 clone |
