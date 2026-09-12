import React, { useContext, useEffect, useMemo, useState } from 'react';
import { CloudbedsDataContext } from '../context/CloudbedsDataContext';
import api from '../services/api';
import { MetricCard, PageHeader, Panel, StatusBadge, TableShell, Td, Th } from '../components/PmsUi';

const key = (date) => date.toISOString().slice(0, 10);
const firstOfMonth = () => { const d = new Date(); d.setDate(1); return key(d); };

const StatisticsPage = () => {
  const { reservations, properties, rooms } = useContext(CloudbedsDataContext);
  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo] = useState(key(new Date()));
  const [ops, setOps] = useState({ transfers: [], cleaning: [] });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true); setError('');
    try { const { data } = await api.get('/management/reports', { params: { from, to } }); setOps(data || { transfers: [], cleaning: [] }); }
    catch (e) { setError(e.response?.data?.error || e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const inRangeReservations = useMemo(() => reservations.filter((r) => {
    const d = r.arrivalDate || r.check_in_date;
    return !d || (d >= from && d <= to);
  }), [reservations, from, to]);

  const transferTotal = sum(ops.transfers);
  const cleaningTotal = sum(ops.cleaning);
  const completedTransfers = statusTotal(ops.transfers, 'completed');
  const completedCleaning = statusTotal(ops.cleaning, 'completed');
  const propertyRows = useMemo(() => properties.map((p) => {
    const prs = inRangeReservations.filter((r) => String(r.propertyId) === String(p.id));
    return { name: p.name || p.propertyName || `Property ${p.id}`, reservations: prs.length, arrivals: prs.filter((r)=>(r.arrivalDate || r.check_in_date) === to).length, rooms: rooms.filter((room)=>String(room.propertyId)===String(p.id)).length };
  }), [properties, inRangeReservations, rooms, to]);

  const exportCsv = () => {
    const lines = [['Metric','Value'],['Reservations',inRangeReservations.length],['Free shuttles',transferTotal],['Completed free shuttles',completedTransfers],['Cleaning tasks',cleaningTotal],['Completed cleaning',completedCleaning],['Properties',properties.length]];
    const blob = new Blob([lines.map((r)=>r.join(',')).join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `sem-report-${from}-${to}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  return <div className="space-y-6">
    <PageHeader title="Reports" description="Operational reporting across reservations, housekeeping and free shuttles." actions={<div className="flex flex-wrap gap-2"><input type="date" value={from} onChange={(e)=>setFrom(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"/><input type="date" value={to} onChange={(e)=>setTo(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"/><button onClick={load} className="rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-blue-700">{loading ? 'Loading…' : 'Apply'}</button><button onClick={exportCsv} className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Export CSV</button></div>} />
    {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

    <div className="grid grid-cols-2 gap-4 xl:grid-cols-5">
      <MetricCard label="Reservations" value={inRangeReservations.length} />
      <MetricCard label="Free shuttles" value={transferTotal} tone="blue" />
      <MetricCard label="Free shuttles done" value={completedTransfers} tone="green" />
      <MetricCard label="Cleaning tasks" value={cleaningTotal} tone="blue" />
      <MetricCard label="Cleaning done" value={completedCleaning} tone="green" />
    </div>

    <div className="grid gap-5 xl:grid-cols-2">
      <Panel title="Free shuttle performance" description="Counts by operational status for the selected date range."><StatusTable rows={ops.transfers} /></Panel>
      <Panel title="Housekeeping performance" description="Cleaning workflow counts for the selected date range."><StatusTable rows={ops.cleaning} /></Panel>
    </div>

    <Panel title="Property summary" description="Reservation and room footprint by connected property.">
      <TableShell><thead><tr><Th>Property</Th><Th>Reservations</Th><Th>Arrivals on end date</Th><Th>Rooms</Th></tr></thead><tbody className="divide-y divide-slate-100">{propertyRows.map((p)=><tr key={p.name}><Td className="font-semibold text-slate-900">{p.name}</Td><Td>{p.reservations}</Td><Td>{p.arrivals}</Td><Td>{p.rooms}</Td></tr>)}</tbody></TableShell>
    </Panel>
  </div>;
};

const StatusTable = ({ rows=[] }) => rows.length ? <TableShell><thead><tr><Th>Status</Th><Th>Total</Th></tr></thead><tbody className="divide-y divide-slate-100">{rows.map((r)=><tr key={r.status}><Td><StatusBadge status={r.status}/></Td><Td className="font-semibold text-slate-900">{Number(r.total || 0)}</Td></tr>)}</tbody></TableShell> : <div className="p-8 text-center text-sm text-slate-500">No operational records in this period.</div>;
const sum = (rows=[]) => rows.reduce((a,r)=>a+Number(r.total||0),0);
const statusTotal = (rows=[], status) => Number(rows.find((r)=>r.status===status)?.total || 0);
export default StatisticsPage;
