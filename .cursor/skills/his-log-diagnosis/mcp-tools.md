# MCP 工具参考

**直连** `zoe-his-mcp` / **经 linx** `zoe-his-linx-mcp` 工具集相同（linx 版多 `linx_health`）。

调用前读 schema：`mcps/<server-name>/tools/<name>.json`

## linx_health（仅 zoe-his-linx-mcp）

```json
{}
```

检查当前项目 linx relay `/health`，Step 0 探活优先用。

## query_log

```json
{ "traceId": "必填", "serviceName": "可选" }
```

HTTP 错误日志，链路入口。

## query_rpc_log

```json
{ "traceId": "必填", "serviceName": "可选", "keyword": "可选" }
```

RPC/Feign/Dubbo 调用链。

## query_sql_log

```json
{ "traceId": "必填", "sqlId": "可选，如 UserMapper.selectById" }
```

**排查数据库问题时的核心工具**——以返回的实际 SQL 为准。

## query_param_log

```json
{ "traceId": "必填", "serviceName": "可选", "keyword": "可选" }
```

业务参数、BizParam、配置项。

## query_normal_log

```json
{
  "traceId": "必填",
  "serviceName": "可选",
  "keyword": "可选",
  "logLevel": ["ERROR", "WARN"]
}
```

应用/控制台日志。

## query_business_data

```json
{
  "sql": "仅 SELECT",
  "description": "查询目的",
  "dataSourceId": "可选"
}
```

## get_table_schema

```json
{ "tableNamePattern": "PATIENT_% 或完整表名" }
```

## get_code

从 GitLab 拉代码。**服务名≠仓库名**，需结合 sqlId/urlPath。详见 [gitlab-code.md](gitlab-code.md)。

```json
{
  "serviceName": "zoe-split-charge-service",
  "sqlId": "com.zoe.optimus.service.dict.dao.prepay.InpPrepayRecordDao.getUnSettleUnReturnList",
  "urlPath": "/dict/settle/settleManage/getCheckSettleState",
  "filePath": "可选",
  "searchPattern": "getCheckSettleState"
}
```

## list_code_repositories

无参数。返回当前项目已配置的仓库（含 packagePatterns、sqlIdPatterns）。

## discover_gitlab_projects

无参数。列举 `projectPrefixes` 分组下 GitLab 项目（需 `GITLAB_TOKEN`），不确定仓库名时用。
