/* linx 运维控制台前端（vanilla JS） */
const API = '/admin/api';
let token = sessionStorage.getItem('linx_token') || '';

function toast(msg, kind = 'ok') {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

async function api(path, opts = {}) {
  const res = await fetch(API + path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(opts.headers || {}),
    },
  });
  if (res.status === 401) {
    token = '';
    sessionStorage.removeItem('linx_token');
    showLogin();
    throw new Error('未登录');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || data.error || '请求失败');
  return data;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

/* ---------- 登录 ---------- */
function showLogin() {
  document.getElementById('login').classList.remove('hidden');
  document.getElementById('app').classList.add('hidden');
}
function showApp() {
  document.getElementById('login').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  switchTab('overview');
}
async function doLogin() {
  const password = document.getElementById('loginPw').value;
  const errEl = document.getElementById('loginErr');
  errEl.textContent = '';
  try {
    const res = await fetch(API + '/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '登录失败');
    token = data.token;
    sessionStorage.setItem('linx_token', token);
    showApp();
  } catch (e) {
    errEl.textContent = e.message;
  }
}
async function doLogout() {
  try { await api('/logout', { method: 'POST' }); } catch {}
  token = '';
  sessionStorage.removeItem('linx_token');
  showLogin();
}
document.getElementById('loginPw').addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });

/* ---------- Tabs ---------- */
function switchTab(name) {
  document.querySelectorAll('nav button').forEach((b) =>
    b.classList.toggle('active', b.dataset.tab === name));
  ['overview', 'projects', 'status', 'security'].forEach((t) =>
    document.getElementById('tab-' + t).classList.toggle('hidden', t !== name));
  if (name === 'overview') renderOverview();
  if (name === 'projects') renderProjects();
  if (name === 'status') renderStatus();
  if (name === 'security') renderSecurity();
}

/* ---------- 连接信息 ---------- */
async function renderOverview() {
  const el = document.getElementById('tab-overview');
  el.innerHTML = '<div class="card"><h2>连接信息</h2><div class="muted">加载中…</div></div>';
  try {
    const c = await api('/connection');
    document.getElementById('ver').textContent = ' v' + c.version;
    const cfg = await api('/config');
    const localCfg = c.publicIp
      ? `LINX_BASE_URL=http://${c.publicIp}:${c.port}\nLINX_API_KEY=${cfg.apiKey}`
      : `LINX_BASE_URL=http://<公网IP>:${c.port}\nLINX_API_KEY=${cfg.apiKey}`;
    el.innerHTML = `
      <div class="card">
        <h2>连接信息卡 <button class="ghost" style="float:right" onclick="renderOverview()">刷新</button></h2>
        <div class="kv">
          <div class="k">监听端口</div><div class="v">${c.port}</div>
          <div class="k">公网出口 IP</div><div class="v">${c.publicIp ? esc(c.publicIp) + ' <button class="ghost" onclick="copyText(\'' + esc(c.publicIp) + '\')">复制</button>' : '<span class="muted">探测中/不可用</span>'}</div>
          <div class="k">本机内网 IP</div><div class="v">${esc(c.localIps.join(', ') || '(none)')}</div>
          <div class="k">健康检查</div><div class="v">${c.healthUrl ? `<a href="${esc(c.healthUrl)}" target="_blank">${esc(c.healthUrl)}</a>` : '<span class="muted">需公网 IP</span>'}</div>
          <div class="k">对外 API Key</div><div class="v">${esc(cfg.apiKey)} <button class="ghost" onclick="copyText('${esc(cfg.apiKey)}')">复制</button></div>
        </div>
      </div>
      <div class="card">
        <h2>本地 zoe-his-mcp 配置（复制照抄）</h2>
        <textarea readonly class="mono" style="width:100%;height:70px;background:var(--panel2);color:var(--txt);border:1px solid var(--line);border-radius:6px;padding:10px;">${esc(localCfg)}</textarea>
        <button class="ghost" style="margin-top:8px" onclick="copyText(\`${localCfg.replace(/`/g, '')}\`)">复制配置</button>
      </div>
      <div class="card">
        <h2>连通性自检</h2>
        <p class="muted">判断公司侧能否从外网拨入本机端口。</p>
        <button onclick="selfcheck()">开始自检</button>
        <div id="scOut" style="margin-top:12px"></div>
      </div>`;
  } catch (e) { el.innerHTML = `<div class="card"><span style="color:var(--err)">${esc(e.message)}</span></div>`; }
}

async function selfcheck() {
  const out = document.getElementById('scOut');
  out.innerHTML = '<span class="muted">检测中…</span>';
  try {
    const r = await api('/selfcheck');
    out.innerHTML = `<div class="kv">
      <div class="k">端口监听</div><div class="v"><span class="pill ok">是</span></div>
      <div class="k">公网出口 IP</div><div class="v">${r.publicIp ? esc(r.publicIp) : '<span class="muted">未探测到</span>'}</div>
      <div class="k">提示</div><div class="v">${esc(r.hint)}</div>
    </div>`;
  } catch (e) { out.innerHTML = `<span style="color:var(--err)">${esc(e.message)}</span>`; }
}

function copyText(t) { navigator.clipboard.writeText(t).then(() => toast('已复制')); }

/* ---------- 项目配置 ---------- */
let cachedProjects = [];
async function renderProjects() {
  const el = document.getElementById('tab-projects');
  el.innerHTML = '<div class="card"><h2>项目配置</h2><div class="muted">加载中…</div></div>';
  try {
    const cfg = await api('/config');
    cachedProjects = cfg.projects || [];
    let html = `<div class="card"><h2>项目配置（内网目标 + 凭据，仅存现场）
      <button style="float:right" onclick="editProject()">+ 新增项目</button></h2>`;
    if (!cachedProjects.length) html += '<div class="muted">暂无项目，点右上角新增。</div>';
    for (const p of cachedProjects) {
      html += `<div class="proj">
        <div class="head">
          <div><span class="name">${esc(p.name || p.code)}</span><span class="code">${esc(p.code)}</span></div>
          <div>
            <button class="ghost" onclick="testProject('${esc(p.code)}')">测试连通</button>
            <button class="ghost" onclick='editProject(${JSON.stringify(p.code)})'>编辑</button>
            <button class="danger" onclick="delProject('${esc(p.code)}')">删除</button>
          </div>
        </div>
        <div class="kv" style="margin-top:10px">
          <div class="k">日志 API</div><div class="v">${esc(p.apiBaseUrl || '—')} ${p.hasApiToken ? '<span class="pill ok">token</span>' : (p.redis ? '<span class="pill ok">redis</span>' : '')}</div>
          <div class="k">数据库</div><div class="v">${p.db ? `${esc(p.db.type)} ${esc(p.db.host)}:${esc(p.db.port)}/${esc(p.db.serviceName || p.db.sid || '')} ${p.db.hasPassword ? '<span class="pill ok">已配密码</span>' : '<span class="pill no">无密码</span>'}` : '—'}</div>
        </div>
        <div id="test-${esc(p.code)}" class="muted" style="margin-top:8px"></div>
      </div>`;
    }
    html += '</div>';
    el.innerHTML = html;
  } catch (e) { el.innerHTML = `<div class="card"><span style="color:var(--err)">${esc(e.message)}</span></div>`; }
}

function editProject(code) {
  const p = code ? cachedProjects.find((x) => x.code === code) : null;
  const dlg = document.getElementById('projDlg');
  const db = p?.db || {};
  dlg.innerHTML = `
    <h2 style="margin-top:0">${p ? '编辑项目 ' + esc(p.code) : '新增项目'}</h2>
    <div class="row">
      <div><label>项目 code *</label><input id="f_code" value="${esc(p?.code || '')}" ${p ? 'readonly' : ''} placeholder="seyy"></div>
      <div><label>名称</label><input id="f_name" value="${esc(p?.name || '')}" placeholder="公司库"></div>
    </div>
    <label>日志平台 baseUrl</label><input id="f_base" value="${esc(p?.apiBaseUrl || '')}" placeholder="http://192.168.5.24:8081">
    <div class="row">
      <div><label>日志路径(可空,用全局)</label><input id="f_logpath" value="${esc(p?.apiLogPath || '')}" placeholder="/log/search"></div>
      <div><label>鉴权头(默认 Authorization)</label><input id="f_authhdr" value="${esc(p?.apiAuthHeader || '')}" placeholder="Authorization"></div>
    </div>
    <label>日志静态 token（留空=不改；有 Redis 可不填）</label><input id="f_token" type="password" placeholder="${p?.hasApiToken ? '已配置，留空不改' : '可留空'}">
    <hr style="border-color:var(--line);margin:16px 0">
    <div class="row">
      <div><label>数据库类型</label><select id="f_dbtype"><option value="">(无)</option><option value="oracle" ${db.type==='oracle'?'selected':''}>oracle</option><option value="dameng" ${db.type==='dameng'?'selected':''}>dameng(达梦)</option></select></div>
      <div><label>Host</label><input id="f_dbhost" value="${esc(db.host || '')}"></div>
      <div><label>Port</label><input id="f_dbport" value="${esc(db.port || '')}"></div>
    </div>
    <div class="row">
      <div><label>ServiceName</label><input id="f_dbsvc" value="${esc(db.serviceName || '')}"></div>
      <div><label>SID</label><input id="f_dbsid" value="${esc(db.sid || '')}"></div>
      <div><label>Schema</label><input id="f_dbschema" value="${esc(db.schema || '')}"></div>
    </div>
    <div class="row">
      <div><label>用户名</label><input id="f_dbuser" value="${esc(db.username || '')}"></div>
      <div><label>密码（留空=不改）</label><input id="f_dbpass" type="password" placeholder="${db.hasPassword ? '已配置，留空不改' : ''}"></div>
    </div>
    <div style="margin-top:20px;text-align:right">
      <button class="ghost" onclick="document.getElementById('projDlg').close()">取消</button>
      <button onclick="saveProject()">保存</button>
    </div>`;
  dlg.showModal();
}

async function saveProject() {
  const v = (id) => document.getElementById(id).value.trim();
  const code = v('f_code');
  if (!code) { toast('请填 code', 'err'); return; }
  const dbtype = v('f_dbtype');
  const payload = {
    code,
    name: v('f_name') || code,
    apiBaseUrl: v('f_base') || undefined,
    apiLogPath: v('f_logpath') || undefined,
    apiAuthHeader: v('f_authhdr') || undefined,
    apiToken: v('f_token') || undefined,
    db: dbtype ? {
      type: dbtype, host: v('f_dbhost'), port: parseInt(v('f_dbport') || '0', 10),
      serviceName: v('f_dbsvc') || undefined, sid: v('f_dbsid') || undefined,
      schema: v('f_dbschema') || undefined, username: v('f_dbuser'), password: v('f_dbpass') || '',
    } : undefined,
  };
  try {
    await api('/projects', { method: 'POST', body: JSON.stringify(payload) });
    document.getElementById('projDlg').close();
    toast('已保存');
    renderProjects();
  } catch (e) { toast(e.message, 'err'); }
}

async function delProject(code) {
  if (!confirm(`确认删除项目 ${code}?`)) return;
  try { await api('/projects/' + encodeURIComponent(code), { method: 'DELETE' }); toast('已删除'); renderProjects(); }
  catch (e) { toast(e.message, 'err'); }
}

async function testProject(code) {
  const out = document.getElementById('test-' + code);
  out.innerHTML = '<span class="muted">测试中…</span>';
  try {
    const r = await api('/projects/' + encodeURIComponent(code) + '/test', { method: 'POST' });
    const parts = [];
    if (r.db) parts.push(`DB: ${r.db.ok ? '<span class="pill ok">通</span>' : '<span class="pill no">失败: ' + esc(r.db.error) + '</span>'}`);
    if (r.api) parts.push(`日志API: ${r.api.ok ? '<span class="pill ok">通(HTTP ' + r.api.status + ')</span>' : '<span class="pill no">失败: ' + esc(r.api.error) + '</span>'}`);
    out.innerHTML = parts.join(' &nbsp; ') || '<span class="muted">该项目未配置可测项</span>';
  } catch (e) { out.innerHTML = `<span style="color:var(--err)">${esc(e.message)}</span>`; }
}

/* ---------- 服务状态 ---------- */
async function renderStatus() {
  const el = document.getElementById('tab-status');
  el.innerHTML = '<div class="card"><h2>服务状态</h2><div class="muted">加载中…</div></div>';
  try {
    const s = await api('/status');
    let rows = s.recent.map((r) => `<tr>
      <td>${esc(r.at.replace('T', ' ').slice(5, 19))}</td><td>${esc(r.ip)}</td>
      <td>${esc(r.endpoint)}</td><td>${esc(r.project || '')}</td>
      <td>${r.ok ? '<span class="pill ok">ok</span>' : '<span class="pill no">err</span>'}</td>
      <td>${r.ms ?? ''}</td><td class="muted">${esc(r.detail || '')}</td></tr>`).join('');
    el.innerHTML = `
      <div class="card"><h2>运行概览 <button class="ghost" style="float:right" onclick="renderStatus()">刷新</button></h2>
        <div class="kv">
          <div class="k">启动时间</div><div class="v">${esc(s.startedAt.replace('T', ' ').slice(0, 19))}</div>
          <div class="k">运行时长</div><div class="v">${Math.floor(s.uptimeSec / 3600)}h ${Math.floor((s.uptimeSec % 3600) / 60)}m</div>
          <div class="k">总调用</div><div class="v">${s.totalCalls}（失败 ${s.errorCalls}）</div>
        </div></div>
      <div class="card"><h2>最近调用</h2>
        <table><thead><tr><th>时间</th><th>来源IP</th><th>端点</th><th>项目</th><th>结果</th><th>ms</th><th>详情</th></tr></thead>
        <tbody>${rows || '<tr><td colspan=7 class="muted">暂无</td></tr>'}</tbody></table></div>`;
  } catch (e) { el.innerHTML = `<div class="card"><span style="color:var(--err)">${esc(e.message)}</span></div>`; }
}

/* ---------- 安全设置 ---------- */
async function renderSecurity() {
  const el = document.getElementById('tab-security');
  try {
    const cfg = await api('/config');
    el.innerHTML = `
      <div class="card"><h2>对外 API Key</h2>
        <div class="kv"><div class="k">当前</div><div class="v">${esc(cfg.apiKey)} <button class="ghost" onclick="copyText('${esc(cfg.apiKey)}')">复制</button></div></div>
        <button class="danger" style="margin-top:12px" onclick="resetKey()">重置 API Key（旧 Key 立即失效）</button>
      </div>
      <div class="card"><h2>运维口令</h2>
        <label>新口令（≥6 位）</label><input id="newPw" type="password">
        <button style="margin-top:12px" onclick="changePw()">修改口令</button>
      </div>
      <div class="card"><h2>IP 白名单</h2>
        <p class="muted">逗号分隔；留空=不限制来源 IP。</p>
        <input id="ipwl" value="${esc((cfg.ipWhitelist || []).join(', '))}" placeholder="1.2.3.4, 5.6.7.8">
        <button style="margin-top:12px" onclick="saveIpwl()">保存</button>
      </div>`;
  } catch (e) { el.innerHTML = `<div class="card"><span style="color:var(--err)">${esc(e.message)}</span></div>`; }
}
async function resetKey() {
  if (!confirm('重置后旧 API Key 立即失效，本地 zoe-his-mcp 需同步更新。继续？')) return;
  try { const r = await api('/api-key/reset', { method: 'POST' }); toast('新 Key: ' + r.apiKey); renderSecurity(); }
  catch (e) { toast(e.message, 'err'); }
}
async function changePw() {
  const password = document.getElementById('newPw').value;
  try { await api('/admin-password', { method: 'POST', body: JSON.stringify({ password }) }); toast('口令已修改'); }
  catch (e) { toast(e.message, 'err'); }
}
async function saveIpwl() {
  const list = document.getElementById('ipwl').value.split(',').map((s) => s.trim()).filter(Boolean);
  try { await api('/ip-whitelist', { method: 'POST', body: JSON.stringify({ list }) }); toast('已保存'); }
  catch (e) { toast(e.message, 'err'); }
}

/* ---------- 启动 ---------- */
(async function init() {
  if (!token) { showLogin(); return; }
  try { await api('/connection'); showApp(); }
  catch { showLogin(); }
})();
