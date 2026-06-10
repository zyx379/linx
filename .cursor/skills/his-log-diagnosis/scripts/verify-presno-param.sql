-- 通用：验证 presNo 是否被误拼接（pres_no + queue_no）
-- 用法：将 :presNoRaw 替换为 HTTP requestParam 中的值

-- 1) 视图中的标准拆分
SELECT pres_no, queue_no, patient_id
FROM zoeview.V_DRU_OUTP_AUTO_ACCEPT
WHERE pres_no = ':presNoRaw'
   OR queue_no = ':presNoRaw';

-- 2) 若 presNoRaw 形如 数字+字母，尝试只取数字前缀查 pres_no
-- （在客户端将 :presNoDigits 设为前缀数字部分，如 58711814）
SELECT pres_no, queue_no, patient_id
FROM zoeview.V_DRU_OUTP_AUTO_ACCEPT
WHERE pres_no = ':presNoDigits';

-- 3) 复现错误：对数字列使用完整拼接串（预期报「无效的数字」）
SELECT COUNT(1) AS cnt
FROM zoeview.V_DRU_OUTP_AUTO_ACCEPT
WHERE pres_no = ':presNoRaw';
