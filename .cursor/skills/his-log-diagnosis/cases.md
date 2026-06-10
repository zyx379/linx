# HIS 日志排查案例库

**用户未明确要求时，勿具体收录个案**。本文件仅保留少数典型、防误导案例（CASE-001~003），避免非典型问题堆积造成后续幻觉。

重点是**防止被历史案例误导**，而非积累案例库。每次排查仍须用当前 traceId 交叉印证。

---

## 保留案例（典型、防误导）

## CASE-001：presNo 与 queueNo 拼接导致达梦「无效的数字」

| 字段 | 内容 |
|------|------|
| traceId | `bbb11b75d5e19b81` |
| 日期 | 2026-05-25 |
| 服务 | `charge-service` |
| 接口 | `POST /api/drug/drugRetraceInfo/getListOfDismantleDrugsIndividual` |
| sqlId | `DrugRetraceInfoDao.getListOfDismantleDrugsIndividualOutp` |
| 表象 | `DataIntegrityViolationException` → `dm.jdbc.driver.DMException: 无效的数字` |
| 初判（错误） | `PACKAGE_SPEC` 非数字导致 FLOOR/MOD 失败 |
| 真因 | 前端传 `presNo=58711814T711`（`pres_no` + `queue_no` 误拼接）；`pres_no` 为数字列，JDBC 绑参失败 |
| 验证 | `pres_no=58711814` + `queue_no=T711` 查视图正常；`pres_no='58711814T711'` 复现报错；3 条药品 `PACKAGE_SPEC` 均为 1/20/24 |

### 排查要点

1. HTTP 日志 `requestParam` **优先于** 堆栈 SQL 猜测。
2. MyBatis 报 `The error occurred while setting parameters` → 先查**入参类型与绑定值**，再查 SQL 算术。
3. 达梦「无效的数字」常见两类：**绑参转数字失败**、**SQL 内隐式 TO_NUMBER 失败**；用 `query_business_data` 分别验证。
4. 参数形如 `数字+字母`（如 `58711814T711`）时，查 `V_DRU_OUTP_AUTO_ACCEPT` 是否应拆成 `pres_no` + `queue_no`。

### 修复方向

- 前端：`fillMissingAdmissionRecordsOutp` 分开传 `presNo` / `queueNo`，禁止拼接。
- 后端（可选）：入参校验；或 Mapper 用 `to_char(pres_no)` + 独立 `queueNo` 条件。

### 可复用验证 SQL

见 [scripts/verify-package-spec.sql](scripts/verify-package-spec.sql)。

---

## CASE-002：上屏呼叫被「未打印处方」校验拦截（ApiException）

| 字段 | 内容 |
|------|------|
| traceId | `4659d4a91fa4aedd`（2026-05-25 再次验证） |
| 日期 | 2026-05-25 |
| 服务 | `charge-service` |
| 接口 | `POST /api/automatic/outpMedicineController/sendCallMessage`，`action=layCallAdd` |
| sqlId | `OutpAutoAcceptDao.getNoPrintPres` |
| 表象 | `ApiException`：`病人 排队号【T585】下剩余1张处方，还在打印中，请稍后再试！！！`；HTTP 200、WARN |
| 初判（错误） | 上屏接口 bug / 打印服务异常 / 需查 RPC |
| 真因 | `getNoPrintPres` 查 `DRU_OUTP_AUTO_ACCEPT_POOL` 中 `UP_SCREEN_STATUS IS NULL` 仍有记录；当日该患者排队号 T585、窗口 4 命中 **1 条**，代码主动抛异常阻断上屏 |
| 验证 | HTTP `requestParam`（patientId/queueNo/windowNo）；SQL 日志完整 WHERE + `resultCount=1`；堆栈 `OuptAutoAcceptServiceImpl.getNoPrintPres:858`；无 RPC、无 SQL errorMessage |

### 排查要点

1. **勿因 ApiException 就跳过 SQL**：须看到 `getNoPrintPres` 的 `resultCount` 或读 Mapper 中 `UP_SCREEN_STATUS is null` 条件。
2. 方法名含 Print，**实际查的是接单池上屏状态**，不是打印任务表；用户侧文案「还在打印中」≠ 已证实打印机故障。
3. 入参 `sortNo` 与 `queueNo` 同源（如均为 `T585`），验证 SQL 须用日志中的实际绑定值。
4. 若现场称「已打印完仍报错」→ 另开排查：打印回写是否未把 `UP_SCREEN_STATUS` 从 `NULL` 更新为 `'0'`，**须新 traceId + 查该 pres_no 行**，勿沿用本案例结论。

### 调用链（便于 Grep，非结论依据）

`OutpMedicineController.sendCallMessage` → `ExcessiveMachineServiceImpl.sendLayCallPublic` → `OuptAutoAcceptServiceImpl.upScreenUpdate` → `getNoPrintPres`

### 修复方向

- 操作侧：等同排队号下全部处方进入可上屏状态后再点「上屏」。
- 数据侧：查 `DRU_OUTP_AUTO_ACCEPT_POOL` 中 `UP_SCREEN_STATUS IS NULL` 的 `pres_no` 是否卡单。
- 代码侧：仅当证实「打印已完成但状态未回写」时才改打印回写链路；上屏校验本身为预期行为。

---

## CASE-003：住院结算校验「缴费总额-自付<>余额」差 176 元

| 字段 | 内容 |
|------|------|
| traceId | `1779758414603H-0c639db058a111f184b1a5fa3b837f3a` |
| 日期 | 2026-05-26 |
| 服务 | `zoe-split-charge-service` |
| 接口 | `getCheckSettleState` |
| sqlId | `InpPrepayRecordDao.getUnSettleUnReturnList` |
| 表象 | 前台：缴费总额[333.5]-费用自付金额[4896.15]<>余额[-4386.65]，请核对! |
| 初判（错误） | 预交金整体不足导致帐不平 |
| 真因 | 预交金流水 **426223**（+176，缴费+退还标记）计入账户合计，未纳入 `getUnSettleUnReturnList` 缴费总额；**OPERATOR_CODE=门诊转住院**；参数 `pre_return_prepay_generate_new_record=1` |
| 验证 | 333.5-4896.15≠余额；509.5-4896.15=余额；代码仓 `fj-nasyy/zoe-optimus-nasyy`（非 charge 微服务名） |

### 排查要点

1. HTTP 无 `log-http*` 时用 **`log-req*`** 取 `requestParam`。
2. 校验公式：`缴费总额 - 费用自付` 应等于 `CHA_INP_PREPAY_ACCOUNT.BALANCE`；不等时算差额，在 `CHA_INP_PREPAY_RECORD` 找 **RETURN_PREPAY_FLAG=1 且 OPERAT_MODE=1** 的未结记录。
3. 账户余额侧通常按**全部有效流水合计**；缴费总额侧按 `getUnSettleUnReturnList` 条件过滤（仅 mode=2 退款 + 非退还标记缴费）。

### 修复方向

- 数据：核对 426223 是否误生成；与 426225(-176) 成对冲销后，修正或作废 426223。
- 参数：`pre_return_prepay_generate_new_record=1` 时关注退预交金是否多生成一条「缴费+退还标记」流水。

### 可复用验证 SQL

```sql
-- 缴费总额口径（与 getUnSettleUnReturnList 一致）
SELECT SUM(t.TRADE_MONEY) FROM ZOECHARGE.CHA_INP_PREPAY_RECORD t
WHERE t.EVENT_NO = :eventNo AND t.SETTLE_NO IS NULL AND t.PREPAY_STATUS = '1'
  AND ((t.RETURN_PREPAY_FLAG = 1 AND t.PREPAY_OPERAT_MODE_CODE = '2')
    OR (t.RETURN_PREPAY_FLAG = 0 OR t.RETURN_PREPAY_FLAG IS NULL))
  AND (t.SETTLE_SUPPLY_FLAG = 0 OR t.SETTLE_SUPPLY_FLAG IS NULL);

-- 孤儿记录：退还标记却是「缴费」方式
SELECT * FROM ZOECHARGE.CHA_INP_PREPAY_RECORD
WHERE EVENT_NO = :eventNo AND RETURN_PREPAY_FLAG = '1'
  AND PREPAY_OPERAT_MODE_CODE = '1' AND SETTLE_NO IS NULL;
```

---

## CASE-004：停嘱更新单据池 ORA-01476（charge/cost 除零）

| 字段 | 内容 |
|------|------|
| traceId | `1780988878660H-f21e904063d111f1aba73d5c58533ff8` |
| 日期 | 2026-06-09 |
| 项目 | 福鼎 fjfd（旧架构） |
| 服务 | `zoe-split-pres-service` |
| 接口 | `POST /zoe-split-pres-service/pres/stop/stopPrescribes` |
| 表象 | `ORA-01476: divisor is equal to zero` |
| 真因 | `PresApplyRecordsDao.xml` 的 `updateApplyPoolDetailInfo` / `updateApplyPoolInfo` 用 `round(charge/cost,2)` 按比例重算；当明细 `cost=0` 或末日次数为 0 时分母为 0 |
| 验证 | SQL 日志完整 UPDATE；requestParam `lastDayExecTimes:0`；堆栈 `StopPrescribeServiceImpl` → `updateApplyPoolInfo` |

### 排查要点

1. 线索「除数为 0」→ **直接读 SQL 日志失败语句**，找 `/cost` 或 `/t.cost`。
2. 旧架构福鼎：`log-req*`；Mapper 在 `zoe-split-pres/.../PresApplyRecordsDao.xml`。
3. 修复在 **XML** 用 `decode(nvl(cost,0), 0, 0, …)` 或 `lastDayExecTimes=0` 时 charge/cost 置 0。

---

## 案例沉淀模板（仅用户要求时使用）

> **注意**：用户未明确要求时，勿新建 CASE。保留的 CASE-001~003 均为典型、防误导案例。

```markdown
## CASE-XXX：<一句话标题>

| 字段 | 内容 |
|------|------|
| traceId | |
| 日期 | |
| 服务 | |
| 接口 | |
| sqlId | |
| 表象 | |
| 初判（错误） | （若无填「无」） |
| 真因 | |
| 验证 | （如何证伪初判、如何证实真因） |

### 排查要点
1. ...

### 修复方向
- ...

### 可复用验证 SQL
（路径或片段）
```
