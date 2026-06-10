// 模拟医院内网日志平台：校验 linx 注入的 onelinkToken，返回一条 mock 日志
import { createServer } from 'http';

const server = createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const token = req.headers['onelinktoken'];
    console.log(`[mock-log] ${req.method} ${req.url} onelinkToken=${token} bodyLen=${body.length}`);
    if (token !== 'SECRET123') {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'missing onelinkToken' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      data: {
        pageCount: 1,
        mapList: [
          { traceId: 'T1', logLevel: 'ERROR', serviceName: 'demo-svc', errorClass: 'NPE', errorMessage: 'boom from intranet', reqUrl: '/demo/api' },
        ],
      },
    }));
  });
});

server.listen(9099, '127.0.0.1', () => console.log('[mock-log] listening on 127.0.0.1:9099'));
