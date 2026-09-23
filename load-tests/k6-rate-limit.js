import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 25,
  duration: '20s',
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<600'],
  },
};

const clientIds = ['test-client-free', 'test-client-pro', 'test-client-enterprise'];
const baseUrl = __ENV.K6_BASE_URL || 'http://localhost:8080';

export default function () {
  const client = clientIds[Math.floor(Math.random() * clientIds.length)];
  const headers = { 'x-api-key': client, 'Content-Type': 'application/json' };
  const res = http.get(`${baseUrl}/orders`, { headers });

  check(res, {
    'status is 200 or 429': (r) => r.status === 200 || r.status === 429,
  });

  sleep(0.1);
}
