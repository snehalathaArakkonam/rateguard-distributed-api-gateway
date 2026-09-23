import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { io, Socket } from 'socket.io-client';

type MetricPoint = {
  ts: string;
  allowed: number;
  blocked: number;
  client: string;
  value: number;
};

const socketUrl = import.meta.env.VITE_WS_URL ?? 'http://localhost:8080';

export default function App() {
  const [socketConnected, setSocketConnected] = useState(false);
  const [metrics, setMetrics] = useState<MetricPoint[]>([]);
  const [clients, setClients] = useState<{ name: string; requests: number; blocked: number }[]>([]);
  const [circuitBreakers, setCircuitBreakers] = useState<Record<string, any>>({});
  const [latest, setLatest] = useState<any>(null);

  useEffect(() => {
    const socket: Socket = io(socketUrl, { transports: ['websocket'] });
    socket.on('connect', () => setSocketConnected(true));
    socket.on('disconnect', () => setSocketConnected(false));
    socket.on('gateway-metric', (event) => {
      setLatest(event);
      setMetrics((previous) => {
        const next = [...previous, {
          ts: new Date(event.ts).toLocaleTimeString(),
          allowed: event.isAllowed ? 1 : 0,
          blocked: event.isAllowed ? 0 : 1,
          client: event.clientId,
          value: event.remaining,
        }];
        return next.slice(-40);
      });
      setClients((previous) => {
        const existing = previous.find((c) => c.name === event.clientId);
        if (existing) {
          return previous.map((c) => c.name === event.clientId ? { ...c, requests: c.requests + 1, blocked: c.blocked + (event.isAllowed ? 0 : 1) } : c);
        }
        return [...previous, { name: event.clientId, requests: 1, blocked: event.isAllowed ? 0 : 1 }].slice(-10);
      });
    });

    fetch(`${socketUrl}/metrics/status`)
      .then((response) => response.json())
      .then((response) => setCircuitBreakers(response.snapshot.circuitBreakers ?? {}))
      .catch(() => undefined);

    return () => {
      socket.disconnect();
    };
  }, []);

  const totalAllowed = useMemo(() => metrics.filter((m) => m.allowed === 1).length, [metrics]);
  const totalBlocked = useMemo(() => metrics.filter((m) => m.blocked === 1).length, [metrics]);
  const pieData = [
    { name: 'Allowed', value: totalAllowed },
    { name: 'Blocked', value: totalBlocked },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-7xl p-6">
        <header className="mb-8 flex items-center justify-between border-b border-slate-800 pb-4">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-cyan-400">RateGuard</p>
            <h1 className="mt-2 text-3xl font-bold">Distributed API Gateway Dashboard</h1>
          </div>
          <div className={`rounded-full border px-3 py-1 text-sm ${socketConnected ? 'border-emerald-500 bg-emerald-500/10 text-emerald-300' : 'border-rose-500 bg-rose-500/10 text-rose-300'}`}>
            {socketConnected ? 'Live feed online' : 'Socket disconnected'}
          </div>
        </header>

        <div className="grid gap-4 md:grid-cols-4">
          <StatCard title="Allowed" value={String(totalAllowed)} tone="green" />
          <StatCard title="Blocked" value={String(totalBlocked)} tone="red" />
          <StatCard title="Clients" value={String(clients.length)} tone="blue" />
          <StatCard title="Instance" value={String(latest?.clientId ?? 'gateway')} tone="purple" />
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <Panel title="Requests / second by client">
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={clients}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="name" stroke="#cbd5e1" />
                  <YAxis stroke="#cbd5e1" />
                  <Tooltip />
                  <Bar dataKey="requests" fill="#22d3ee" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          <Panel title="Current bucket/window state">
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={metrics}>
                  <defs>
                    <linearGradient id="fillRate" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.8} />
                      <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.1} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="ts" stroke="#cbd5e1" />
                  <YAxis stroke="#cbd5e1" />
                  <Tooltip />
                  <Area type="monotone" dataKey="value" stroke="#8b5cf6" fill="url(#fillRate)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Panel>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <Panel title="Blocked vs allowed ratio">
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90} fill="#8884d8" label>
                    {pieData.map((entry, index) => (
                      <Cell key={entry.name} fill={index === 0 ? '#34d399' : '#f87171'} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          <Panel title="Circuit breaker status">
            <div className="space-y-3">
              {Object.keys(circuitBreakers).length === 0 ? (
                <p className="text-slate-400">No backend circuit breaker events yet.</p>
              ) : Object.entries(circuitBreakers).map(([service, detail]: [string, any]) => (
                <div key={service} className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-200">{service}</span>
                    <span className={`rounded-full px-2 py-1 text-xs ${detail.state === 'open' ? 'bg-red-500/20 text-red-300' : detail.state === 'half-open' ? 'bg-amber-500/20 text-amber-300' : 'bg-emerald-500/20 text-emerald-300'}`}>
                      {detail.state}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate-400">Failures: {detail.failures}</p>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 shadow-xl shadow-slate-950/30">
      <h2 className="mb-4 text-lg font-semibold text-slate-200">{title}</h2>
      {children}
    </div>
  );
}

function StatCard({ title, value, tone }: { title: string; value: string; tone: 'green' | 'red' | 'blue' | 'purple' }) {
  const tones = {
    green: 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300',
    red: 'border-rose-500/50 bg-rose-500/10 text-rose-300',
    blue: 'border-cyan-500/50 bg-cyan-500/10 text-cyan-300',
    purple: 'border-violet-500/50 bg-violet-500/10 text-violet-300',
  } as const;

  return (
    <div className={`rounded-xl border p-4 ${tones[tone]}`}>
      <p className="text-sm uppercase tracking-[0.2em] opacity-80">{title}</p>
      <p className="mt-3 text-3xl font-bold">{value}</p>
    </div>
  );
}
