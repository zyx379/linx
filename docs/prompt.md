```text
请严格按 docs/workflow.md 执行生产排查，逐步汇报进度清单。

【traceId】


【项目】
莆田

【连接方式】
内网穿透

【已知线索】（可空）
相关git修订号：add683755965310ea109453ff7db10d12c9b4b5b
[202606]医保事前事中相关接口医保挂号流水号mdtrt_id--跟医保确认：有医保挂号号传医保挂号号，没有就传院内的
相关代码路径 D:\zoe_work_space\政策性&共性改造集成专用\zoe-split-insurance-fj-pt

医保日志
----------------入参参数----------------
{
  "insuplc_admdvs": "350303",
  "dev_no": "",
  "inf_time": "2026-06-12 09:22:37",
  "msgid": "H35030200090202606120922374767",
  "infver": "V1.0",
  "signtype": "",
  "opter": "18454",
  "input": {
    "data": {
      "adm_time": "20260612084935",
      "fixmedins_code": "H35030200090",
      "gend": "2",
      "mdtrt_cert_type": "03",
      "patn_name": "吴素贞",
      "mdtrt_cert_no": "",
      "fixmedins_name": "莆田市第一医院",
      "dept_name": "神经内科",
      "dr_name": "黄峰黎",
      "brdy": "1949-09-29"
    }
  },
  "fixmedins_code": "H35030200090",
  "cainfo": "",
  "opter_name": "高志森",
  "dev_safe_info": "",
  "infno": "3103",
  "mdtrtarea_admvs": "350302",
  "opter_type": "1",
  "fixmedins_name": "莆田市第一医院",
  "sign_no": "25483790",
  "recer_sys_code": "MBS_LOCAL"
}
----------------出参参数----------------
{
  "infcode": -1,
  "warn_msg": null,
  "appname": "ims-svc-ext",
  "cainfo": null,
  "mid": null,
  "signtype": null,
  "inf_refmsgid": "",
  "refmsg_time": "20260612092236352",
  "respond_time": "20260612092236356",
  "err_msg": "就诊凭证编号不能为空(8f6b6ff99132423898ac53f143718e23@10.70.130.148)",
  "output": null
}


【约束】
- 验证前不改代码
- 旧架构注意 log-req* 与 /log/search
- MCP 连不上 → 立即停止，不查日志/库/代码
- 项目 code 与【项目】不一致 → 提示改对应 MCP 的 mcp.json 并重启
```

---

*版本：2026-06-12（【连接方式】指定 MCP；连不上即停止）| 权威文档：`docs/workflow.md`*