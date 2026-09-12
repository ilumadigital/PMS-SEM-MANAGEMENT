import React, { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import api from '../services/api';

export const CloudbedsDataContext = createContext(null);

const localDateKey = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const sleep = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

const applyVerifiedRoomOverlays = (reservations, overlays) => {
  const now = Date.now();
  return reservations.map((reservation) => {
    const id = String(reservation.id || '');
    const overlay = overlays.get(id);
    if (!overlay) return reservation;

    if (overlay.expiresAt <= now) {
      overlays.delete(id);
      return reservation;
    }

    const remoteRoomIds = Array.isArray(reservation.roomIds) && reservation.roomIds.length
      ? reservation.roomIds.map(String)
      : [String(reservation.roomId || '')];

    if (remoteRoomIds.includes(String(overlay.roomId))) {
      overlays.delete(id);
      return reservation;
    }

    const room = {
      ...(reservation.room || {}),
      id: String(overlay.roomId),
      roomNumber: overlay.roomNumber || String(overlay.roomId),
      roomType: overlay.roomType || reservation.roomType || '',
    };

    return {
      ...reservation,
      roomId: String(overlay.roomId),
      roomIds: [String(overlay.roomId)],
      roomNumber: overlay.roomNumber || String(overlay.roomId),
      roomNumbers: [overlay.roomNumber || String(overlay.roomId)],
      roomType: overlay.roomType || reservation.roomType || '',
      roomTypes: [overlay.roomType || reservation.roomType || ''],
      room,
      syncStatus: 'synced',
      syncEvent: 'cloudbeds_verified_room_assignment',
    };
  });
};

const applyLocalReservationOperations = (reservations, operations = []) => {
  const map = new Map((operations || []).map((item) => [String(item.reservationId), item]));
  return reservations.map((reservation) => {
    const local = map.get(String(reservation.id));
    if (!local) return reservation;
    const statusMap = { checked_in: 'in_house', checked_out: 'checked_out', no_show: 'no_show', cancelled: 'cancelled', confirmed: reservation.status };
    return {
      ...reservation,
      status: statusMap[local.status] || local.status || reservation.status,
      localOperationalStatus: local.status || null,
      actualArrivalTime: local.actualArrivalTime || null,
      actualDepartureTime: local.actualDepartureTime || null,
      guestNotes: local.guestNotes || '',
      specialRequests: local.specialRequests ?? reservation.specialRequests,
      localUpdatedAt: local.updatedAt || null,
    };
  });
};

const deriveLocalHousekeeping = (rooms, reservations, stored = []) => {
  const today = localDateKey();
  const storedMap = new Map((stored || []).map((item) => [String(item.roomId), item]));
  return rooms.map((room) => {
    const roomId = String(room.id);
    const current = storedMap.get(roomId);
    const roomReservations = reservations.filter((reservation) => {
      const ids = reservation.roomIds?.length ? reservation.roomIds.map(String) : [String(reservation.roomId || '')];
      return ids.includes(roomId) && reservation.status !== 'cancelled';
    });
    const checkoutToday = roomReservations.some((r) => r.departureDate === today && r.status !== 'cancelled');
    const occupiedAfterFirstNight = roomReservations.some((r) =>
      r.arrivalDate && r.departureDate && r.arrivalDate < today && r.departureDate > today &&
      !['checked_out','no_show','cancelled'].includes(String(r.localOperationalStatus || r.status || ''))
    );
    const currentIsToday = String(current?.date || '').slice(0,10) === today;
    const automaticDirty = checkoutToday || occupiedAfterFirstNight;
    const condition = currentIsToday ? current.roomCondition : automaticDirty ? 'dirty' : (current?.roomCondition || 'clean');
    return {
      roomId,
      roomNumber: room.roomNumber,
      roomType: room.roomType,
      propertyId: room.propertyId,
      roomCondition: condition,
      status: condition,
      comments: current?.comments || '',
      roomOccupied: room.occupancyStatus === 'occupied',
      frontdeskStatus: room.occupancyStatus,
      date: currentIsToday ? current.date : today,
      automaticDirty: automaticDirty && !currentIsToday,
      source: 'sem_pms_local',
    };
  });
};

const reconcileRoomOccupancy = (rooms, reservations) => {
  const today = localDateKey();
  return rooms.map((room) => {
    const roomReservations = reservations
      .filter((reservation) => {
        const ids = Array.isArray(reservation.roomIds) && reservation.roomIds.length
          ? reservation.roomIds.map(String)
          : [String(reservation.roomId || '')];
        return ids.includes(String(room.id)) && reservation.status !== 'cancelled';
      })
      .sort((a, b) => String(a.arrivalDate || '').localeCompare(String(b.arrivalDate || '')));

    const inHouse = roomReservations.find(
      (reservation) => reservation.status === 'in_house' || (
        reservation.arrivalDate && reservation.departureDate && reservation.arrivalDate <= today &&
        reservation.departureDate > today
      )
    );
    const checkoutToday = roomReservations.find((reservation) => reservation.departureDate === today);
    const arrivingToday = roomReservations.find((reservation) => reservation.arrivalDate === today);
    const nextArrival = roomReservations.find((reservation) => reservation.arrivalDate >= today);

    return {
      ...room,
      occupancyStatus: checkoutToday ? 'checkout_today' : inHouse ? 'occupied' : arrivingToday ? 'arriving_today' : 'vacant',
      currentGuest: inHouse?.guestName || null,
      nextArrivalBookingId: nextArrival?.id || null,
    };
  });
};

const buildDerivedData = (reservations) => {
  const propertyMap = new Map();
  const roomMap = new Map();
  const customerMap = new Map();

  reservations.forEach((reservation) => {
    const propertyId = String(reservation.propertyId || reservation.property?.id || 'unknown-property');
    const propertyName = reservation.property?.name || 'Cloudbeds Property';

    if (!propertyMap.has(propertyId)) {
      propertyMap.set(propertyId, {
        id: propertyId,
        name: propertyName,
        code: propertyId,
        type: 'Cloudbeds',
        location: reservation.property?.city || '',
        totalRooms: 0,
      });
    }

    const roomIds = Array.isArray(reservation.roomIds) && reservation.roomIds.length
      ? reservation.roomIds.map(String)
      : [String(reservation.roomId || `unassigned-${reservation.id}`)];
    const roomNumbers = Array.isArray(reservation.roomNumbers) && reservation.roomNumbers.length
      ? reservation.roomNumbers.map(String)
      : [String(reservation.roomNumber || 'Unassigned')];
    const roomTypes = Array.isArray(reservation.roomTypes) && reservation.roomTypes.length
      ? reservation.roomTypes.map(String)
      : [String(reservation.roomType || '')];

    const roomCount = Math.max(roomIds.length, roomNumbers.length, 1);
    for (let index = 0; index < roomCount; index += 1) {
      const roomId = roomIds[index] || `${roomIds[0]}-${index + 1}`;
      const roomNumber = roomNumbers[index] || roomNumbers[0] || 'Unassigned';
      const roomType = roomTypes[index] || roomTypes[0] || '';
      if (!roomMap.has(roomId)) {
        roomMap.set(roomId, {
          id: roomId,
          propertyId,
          roomNumber,
          roomType,
          roomTypeId: '',
          housekeepingStatus: 'not_tracked',
          occupancyStatus: 'unknown',
          nextArrivalBookingId: null,
          currentGuest: null,
          lastUpdatedAt: 'Cloudbeds',
        });
      }
    }

    const customerKey = reservation.guestId || reservation.guestEmail || reservation.guestPhone || reservation.guestName || reservation.id;
    if (!customerMap.has(customerKey)) {
      customerMap.set(customerKey, {
        id: String(customerKey),
        guestId: reservation.guestId || '',
        propertyId,
        name: reservation.guestName || 'Unknown Guest',
        email: reservation.guestEmail || '',
        phone: reservation.guestPhone || '',
        bookings: 0,
      });
    }
    customerMap.get(customerKey).bookings += 1;
  });

  const today = localDateKey();
  const rooms = Array.from(roomMap.values()).map((room) => {
    const roomReservations = reservations
      .filter((reservation) => {
        const ids = Array.isArray(reservation.roomIds) && reservation.roomIds.length
          ? reservation.roomIds.map(String)
          : [String(reservation.roomId || '')];
        return ids.includes(room.id);
      })
      .sort((a, b) => String(a.arrivalDate || '').localeCompare(String(b.arrivalDate || '')));

    const inHouse = roomReservations.find(
      (reservation) => reservation.status === 'in_house' || (
        reservation.arrivalDate && reservation.departureDate && reservation.arrivalDate <= today &&
        reservation.departureDate > today && reservation.status !== 'cancelled'
      )
    );
    const checkoutToday = roomReservations.find((reservation) => reservation.departureDate === today && reservation.status !== 'cancelled');
    const arrivingToday = roomReservations.find((reservation) => reservation.arrivalDate === today && reservation.status !== 'cancelled');
    const nextArrival = roomReservations.find((reservation) => reservation.arrivalDate >= today && reservation.status !== 'cancelled');

    return {
      ...room,
      occupancyStatus: checkoutToday ? 'checkout_today' : inHouse ? 'occupied' : arrivingToday ? 'arriving_today' : 'vacant',
      currentGuest: inHouse?.guestName || null,
      nextArrivalBookingId: nextArrival?.id || null,
    };
  });

  const properties = Array.from(propertyMap.values()).map((property) => ({
    ...property,
    totalRooms: rooms.filter((room) => room.propertyId === property.id).length,
  }));

  return { properties, rooms, customers: Array.from(customerMap.values()) };
};

export const CloudbedsDataProvider = ({ children }) => {
  const [reservations, setReservations] = useState([]);
  const [properties, setProperties] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [housekeeping, setHousekeeping] = useState([]);
  const [dashboard, setDashboard] = useState(null);
  const [diagnostics, setDiagnostics] = useState(null);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [writeState, setWriteState] = useState({ syncing: false, operation: null, result: null, error: '' });
  const verifiedRoomAssignmentsRef = useRef(new Map());

  const refresh = useCallback(async () => {
    try {
      setError('');
      const cacheBust = Date.now();
      const statusResponse = await api.get('/integrations/cloudbeds/status', { params: { _ts: cacheBust } });
      const nextStatus = statusResponse.data;
      setStatus(nextStatus);

      if (!nextStatus.authorized && !nextStatus.connected) {
        verifiedRoomAssignmentsRef.current.clear();
        setReservations([]); setProperties([]); setRooms([]); setCustomers([]); setHousekeeping([]);
        setDashboard(null); setDiagnostics(null); return;
      }

      let data;
      try {
        const snapshotResponse = await api.get('/integrations/cloudbeds/snapshot', { params: { _ts: cacheBust } });
        data = snapshotResponse.data;
      } catch (snapshotError) {
        if (snapshotError.response?.status !== 404) throw snapshotError;
        const reservationsResponse = await api.get('/integrations/cloudbeds/reservations', { params: { _ts: cacheBust } });
        data = reservationsResponse.data;
      }

      const [reservationOpsResponse, housekeepingOpsResponse] = await Promise.all([
        api.get('/operations/reservations').catch(() => ({ data: { data: [] } })),
        api.get('/operations/housekeeping').catch(() => ({ data: { data: [] } })),
      ]);
      const verifiedReservations = applyVerifiedRoomOverlays(
        data.reservations || [],
        verifiedRoomAssignmentsRef.current
      );
      const nextReservations = applyLocalReservationOperations(
        verifiedReservations,
        reservationOpsResponse.data?.data || []
      );
      const nextRooms = reconcileRoomOccupancy(data.rooms || [], nextReservations);
      const localHousekeeping = deriveLocalHousekeeping(
        nextRooms,
        nextReservations,
        housekeepingOpsResponse.data?.data || []
      );

      setReservations(nextReservations);
      setProperties(data.properties || []);
      setRooms(nextRooms);
      setCustomers(data.guests || []);
      setHousekeeping(localHousekeeping);
      setDashboard(data.dashboard || null);
      setDiagnostics(data.diagnostics || null);
      setStatus((current) => ({
        ...(current || {}), ...data, diagnostics: data.diagnostics || null, authorized: true,
        connected: data.dataStatus === 'ready',
      }));
    } catch (requestError) {
      setError(requestError.response?.data?.message || requestError.message || 'Could not load Cloudbeds data.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    refresh();
    const interval = window.setInterval(refresh, 60000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  const connect = useCallback(() => {
    const apiOrigin = import.meta.env.VITE_API_URL || 'http://localhost:5000';
    window.location.assign(`${apiOrigin}/api/integrations/cloudbeds/connect`);
  }, []);

  const reauthorize = useCallback(async () => {
    try {
      setLoading(true); setError('');
      await api.post('/integrations/cloudbeds/disconnect');
      verifiedRoomAssignmentsRef.current.clear();
      setReservations([]); setProperties([]); setRooms([]); setCustomers([]); setHousekeeping([]);
      setDashboard(null); setDiagnostics(null);
      setStatus({ connected: false, authorized: false, connectionVerified: true, appState: 'disabled', environment: status?.environment || 'sandbox' });
      const apiOrigin = import.meta.env.VITE_API_URL || 'http://localhost:5000';
      window.location.assign(`${apiOrigin}/api/integrations/cloudbeds/connect`);
    } catch (requestError) {
      setLoading(false);
      setError(requestError.response?.data?.message || requestError.message || 'Could not disconnect the existing Cloudbeds session before reauthorization.');
    }
  }, [status?.environment]);

  const disconnect = useCallback(async () => {
    try {
      setLoading(true); setError('');
      await api.post('/integrations/cloudbeds/disconnect');
      verifiedRoomAssignmentsRef.current.clear();
      setReservations([]); setProperties([]); setRooms([]); setCustomers([]); setHousekeeping([]);
      setDashboard(null); setDiagnostics(null);
      setStatus({ connected: false, authorized: false, connectionVerified: true, appState: 'disabled', environment: status?.environment || 'sandbox' });
    } catch (requestError) {
      setError(requestError.response?.data?.message || requestError.message || 'Could not disconnect Cloudbeds.');
    } finally { setLoading(false); }
  }, [status?.environment]);

  const runWrite = useCallback(async (operation, request) => {
    setWriteState({ syncing: true, operation, result: null, error: '' });
    try {
      const response = await request();
      const result = response.data?.data ?? response.data;

      // The server only returns room-assignment success after reading the physical
      // room back from Cloudbeds. Preserve that verified result while the broader
      // reservation snapshot catches up, so the PMS can never jump back to the old room.
      if (operation === 'reservation.room_assign' && result?.reservationId && result?.room?.id) {
        verifiedRoomAssignmentsRef.current.set(String(result.reservationId), {
          roomId: String(result.room.id),
          roomNumber: result.room.roomNumber || String(result.room.id),
          roomType: result.room.roomType || '',
          expiresAt: Date.now() + 120000,
        });
      }

      setWriteState({ syncing: false, operation, result, error: '' });
      await refresh();
      if (operation === 'reservation.room_assign' || operation === 'reservation.update') {
        await sleep(700);
        await refresh();
        await sleep(1300);
        await refresh();
      }
      return result;
    } catch (requestError) {
      const message = requestError.response?.data?.message || requestError.message || 'SEM PMS local update failed.';
      const requestId = requestError.response?.data?.requestId;
      const decorated = requestId ? `${message} · Request ID ${requestId}` : message;
      setWriteState({
        syncing: false,
        operation,
        result: requestError.response?.data?.details || null,
        error: decorated,
      });
      throw requestError;
    }
  }, [refresh]);

  const updateReservation = useCallback((reservationId, payload) => runWrite(
    'reservation.local_update', () => api.put(`/operations/reservations/${reservationId}`, payload)
  ), [runWrite]);

  const assignRoom = useCallback((reservationId, payload) => runWrite(
    'reservation.room_assign', () => api.post(`/integrations/cloudbeds/operations/reservations/${reservationId}/room-assignment`, payload)
  ), [runWrite]);

  const updateGuest = useCallback((guestId, payload) => runWrite(
    'guest.update', () => api.put(`/integrations/cloudbeds/operations/guests/${guestId}`, payload)
  ), [runWrite]);

  const updateHousekeeping = useCallback((roomId, payload) => runWrite(
    'housekeeping.local_update', () => api.put(`/operations/housekeeping/${roomId}`, payload)
  ), [runWrite]);

  const createRoomBlock = useCallback((payload) => runWrite(
    'roomblock.create', () => api.post('/integrations/cloudbeds/operations/room-blocks', payload)
  ), [runWrite]);

  const updateRoomBlock = useCallback((roomBlockId, payload) => runWrite(
    'roomblock.update', () => api.put(`/integrations/cloudbeds/operations/room-blocks/${roomBlockId}`, payload)
  ), [runWrite]);

  const postCustomCharge = useCallback((reservationId, payload) => runWrite(
    'folio.custom_item', () => api.post(`/integrations/cloudbeds/operations/reservations/${reservationId}/charges`, payload)
  ), [runWrite]);

  const getReferenceData = useCallback(async (params) => {
    const response = await api.get('/integrations/cloudbeds/operations/reference-data', { params });
    return response.data;
  }, []);

  const getWriteAudit = useCallback(async (limit = 100) => {
    const response = await api.get('/integrations/cloudbeds/operations/audit', { params: { limit } });
    return response.data?.data || [];
  }, []);

  const clearWriteState = useCallback(() => setWriteState({ syncing: false, operation: null, result: null, error: '' }), []);

  const derived = useMemo(() => buildDerivedData(reservations), [reservations]);
  const effectiveProperties = properties.length ? properties : derived.properties;
  const effectiveRooms = rooms.length ? rooms : derived.rooms;
  const effectiveCustomers = customers.length ? customers : derived.customers;

  const value = useMemo(() => ({
    reservations, properties: effectiveProperties, rooms: effectiveRooms, customers: effectiveCustomers,
    housekeeping, dashboard, diagnostics, status, loading, error, refresh, connect, reauthorize, disconnect,
    writeState, clearWriteState, updateReservation, assignRoom, updateGuest, updateHousekeeping,
    createRoomBlock, updateRoomBlock, postCustomCharge, getReferenceData, getWriteAudit,
  }), [
    reservations, effectiveProperties, effectiveRooms, effectiveCustomers, housekeeping, dashboard, diagnostics,
    status, loading, error, refresh, connect, reauthorize, disconnect, writeState, clearWriteState,
    updateReservation, assignRoom, updateGuest, updateHousekeeping, createRoomBlock, updateRoomBlock,
    postCustomCharge, getReferenceData, getWriteAudit,
  ]);

  return <CloudbedsDataContext.Provider value={value}>{children}</CloudbedsDataContext.Provider>;
};