const client = require('prom-client');

const register = new client.Registry();
client.collectDefaultMetrics({ register, prefix: 'paynext_' });

const httpRequestsTotal = new client.Counter({
  name: 'paynext_http_requests_total',
  help: 'Total HTTP requests handled by the API',
  labelNames: ['method', 'route', 'status'],
  registers: [register],
});

const httpRequestDuration = new client.Histogram({
  name: 'paynext_http_request_duration_seconds',
  help: 'HTTP request latency in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [register],
});

const moneyMovementsTotal = new client.Counter({
  name: 'paynext_money_movements_total',
  help: 'Completed money movements by type',
  labelNames: ['type'],
  registers: [register],
});

function observeRequest({ method, route, status, durationSeconds }) {
  const labels = { method, route, status: String(status) };
  httpRequestsTotal.inc(labels);
  httpRequestDuration.observe(labels, durationSeconds);
}

module.exports = {
  register,
  observeRequest,
  moneyMovementsTotal,
};
