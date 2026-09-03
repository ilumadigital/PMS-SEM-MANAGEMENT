import React, { useContext, useMemo, useState } from 'react';
import { CloudbedsDataContext } from '../context/CloudbedsDataContext';
import {
  EmptyState,
  MetricCard,
  PageHeader,
  Panel,
  StatusBadge,
  TableShell,
  Td,
  Th,
} from '../components/PmsUi';

const CleaningMobile = () => {
  const {
    housekeeping,
    rooms,
    properties,
    diagnostics,
    loading,
    refresh,
  } = useContext(CloudbedsDataContext);

  const [filter, setFilter] = useState('all');

  const rows = useMemo(() => {
    const source = housekeeping.length
      ? housekeeping
      : rooms.map((room) => ({
          roomId: room.id,
          roomNumber: room.roomNumber,
          roomType: room.roomType,
          roomCondition: '',
          roomOccupied: room.occupancyStatus === 'occupied',
          frontdeskStatus: room.occupancyStatus,
          housekeeper: '',
          comments: '',
          status: room.housekeepingStatus || 'not_tracked',
          propertyId: room.propertyId,
        }));

    if (filter === 'all') return source;
    if (filter === 'dirty') return source.filter((item) => item.roomCondition === 'dirty');
    if (filter === 'clean') return source.filter((item) => item.roomCondition === 'clean');
    if (filter === 'occupied') return source.filter((item) => item.roomOccupied);
    return source;
  }, [housekeeping, rooms, filter]);

  const dirty = housekeeping.filter((item) => item.roomCondition === 'dirty').length;
  const clean = housekeeping.filter((item) => item.roomCondition === 'clean').length;
  const occupied = housekeeping.filter((item) => item.roomOccupied).length;
  const missingScope = (diagnostics?.missingScopes || []).includes('read:housekeeping');

  return (
    <div className="space-y-6">
      <PageHeader
        title="Housekeeping"
        description="Live room condition and front-desk status from Cloudbeds."
        actions={
          <button
            onClick={refresh}
            className="rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Refresh Cloudbeds
          </button>
        }
      />

      {missingScope && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Cloudbeds is connected, but the property has not granted <strong>Housekeeping READ</strong>.
          Rooms are still shown from the room/reservation feed, but live cleaning condition is unavailable.
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <MetricCard label="Rooms" value={loading ? '…' : rows.length} helper="Visible in housekeeping" />
        <MetricCard label="Dirty" value={loading ? '…' : dirty} tone={dirty ? 'amber' : 'default'} />
        <MetricCard label="Clean" value={loading ? '…' : clean} tone="green" />
        <MetricCard label="Occupied" value={loading ? '…' : occupied} tone="blue" />
      </div>

      <Panel
        title="Room status"
        description="Cloudbeds housekeeping condition, occupancy and front-desk movement."
        action={
          <div className="flex flex-wrap gap-2">
            {[
              ['all', 'All'],
              ['dirty', 'Dirty'],
              ['clean', 'Clean'],
              ['occupied', 'Occupied'],
            ].map(([key, label]) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={[
                  'rounded-lg px-3 py-1.5 text-xs font-semibold',
                  filter === key
                    ? 'bg-slate-900 text-white'
                    : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
                ].join(' ')}
              >
                {label}
              </button>
            ))}
          </div>
        }
      >
        {rows.length ? (
          <TableShell>
            <thead>
              <tr>
                <Th>Room</Th>
                <Th>Room type</Th>
                <Th>Condition</Th>
                <Th>Occupancy</Th>
                <Th>Front desk</Th>
                <Th>Housekeeper</Th>
                <Th>Comments</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((item) => {
                const room = rooms.find((candidate) => String(candidate.id) === String(item.roomId));
                const property = properties.find((candidate) => candidate.id === (item.propertyId || room?.propertyId));
                return (
                  <tr key={item.roomId || item.roomNumber} className="hover:bg-slate-50">
                    <Td>
                      <div className="font-semibold text-slate-950">{item.roomNumber || room?.roomNumber || '—'}</div>
                      <div className="mt-0.5 text-xs text-slate-500">{property?.name || 'Cloudbeds property'}</div>
                    </Td>
                    <Td>{item.roomType || room?.roomType || '—'}</Td>
                    <Td><StatusBadge status={item.roomCondition || item.status || 'not tracked'} /></Td>
                    <Td><StatusBadge status={item.roomOccupied ? 'occupied' : 'vacant'} /></Td>
                    <Td>{item.frontdeskStatus || '—'}</Td>
                    <Td>{item.housekeeper || 'Unassigned'}</Td>
                    <Td>{item.comments || '—'}</Td>
                  </tr>
                );
              })}
            </tbody>
          </TableShell>
        ) : (
          <EmptyState
            title="No housekeeping data"
            description="Cloudbeds did not return housekeeping records for the connected property."
          />
        )}
      </Panel>
    </div>
  );
};

export default CleaningMobile;
