const baseUrl = process.env.LINX_BASE_URL || 'http://1.117.191.189:9081';
const apiKey = process.env.LINX_API_KEY || '';
const traceId = '1780970559252H-4ae6bd4063a711f1bb74e5bbb8d2325e';

if (!apiKey) {
  console.error('缺少 LINX_API_KEY');
  process.exit(1);
}

const paths = [
  '/log/search',
  '/log-manage-service/log/search',
  '/api/log/query',
  '/log-manage/log/search',
  '/onelink-log/log/search',
];

const body = {
  pageSize: '20',
  pageNum: '1',
  indexvalue: 'log-http*',
  logType: 'http',
  traceId,
  serviceName: '',
  sqlId: '',
  logLevel: [],
  timestamp: '2026-03-01 00:00:00 - 2026-06-09 23:59:59',
};

for (const path of paths) {
  const res = await fetch(`${baseUrl}/relay/http`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      project: 'fjfd',
      method: 'POST',
      path,
      authHeader: 'onelinkToken',
      body,
    }),
  });
  const data = await res.json();
  const inner = data.body ?? data;
  const msg = inner.message || inner.error || JSON.stringify(inner).slice(0, 120);
  console.log(`${path.padEnd(40)} -> ${msg}`);
}
