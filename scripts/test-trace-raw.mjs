const baseUrl = process.env.LINX_BASE_URL || 'http://1.117.191.189:9081';
const apiKey = process.env.LINX_API_KEY || '';
const traceId = process.argv[2] || '1780970559252H-4ae6bd4063a711f1bb74e5bbb8d2325e';

if (!apiKey) {
  console.error('缺少 LINX_API_KEY');
  process.exit(1);
}

async function relay(body, label) {
  const res = await fetch(`${baseUrl}/relay/http`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      project: 'fjfd',
      method: 'POST',
      path: '/log-manage-service/log/search',
      authHeader: 'onelinkToken',
      body,
    }),
  });
  const data = await res.json();
  console.log(`\n===== ${label} =====`);
  console.log('linx status:', res.status);
  const inner = data.body ?? data;
  const preview = JSON.stringify(inner, null, 2);
  console.log(preview.slice(0, 2500));
}

const wideTime = '2026-03-01 00:00:00 - 2026-06-09 23:59:59';

await relay({
  pageSize: '20',
  pageNum: '1',
  indexvalue: 'log-http*',
  logType: 'http',
  traceId,
  serviceName: '',
  sqlId: '',
  logLevel: [],
}, 'log-http* default time');

await relay({
  pageSize: '20',
  pageNum: '1',
  indexvalue: 'log-http*',
  logType: 'http',
  traceId,
  serviceName: '',
  sqlId: '',
  logLevel: [],
  timestamp: wideTime,
}, 'log-http* wide time range');

await relay({
  pageSize: '20',
  pageNum: '1',
  indexvalue: 'log-req*',
  logType: 'req',
  traceId,
  serviceName: '',
  sqlId: '',
  logLevel: [],
  filterParamet: { sortColumns: 'timestamp' },
  timestamp: wideTime,
}, 'log-req* legacy wide time');

await relay({
  pageSize: '20',
  pageNum: '1',
  indexvalue: 'log-sql*',
  logType: 'sql',
  traceId,
  serviceName: '',
  sqlId: '',
  logLevel: [],
}, 'log-sql*');
