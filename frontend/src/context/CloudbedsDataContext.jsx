import React, { createContext, useCallback, useEffect, useMemo, useState } from 'react';
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

  const refresh = useCallback(async () => {
    try {
      setError('');
      const cacheBust = Date.now();
      const statusResponse = await api.get('/integrations/cloudbeds/status', { params: { _ts: cacheBust } });
      const nextStatus = statusResponse.data;
      setStatus(nextStatus);

      if (!nextStatus.authorized && !nextStatus.connected) {
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

      setReservations(data.reservations || []);
      setProperties(data.properties || []);
      setRooms(data.rooms || []);
      setCustomers(data.guests || []);
      setHousekeeping(data.housekeeping || []);
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
      setWriteState({ syncing: false, operation, result, error: '' });

      // Cloudbeds writes are verified by the API endpoint, but the PMS snapshot/webhook
      // can trail the write for a short period. Re-read with cache busting and retry
      // reservation writes so the UI cannot keep showing the previous room/dates.
      await refresh();
      if (operation === 'reservation.room_assign' || operation === 'reservation.update') {
        await sleep(700);
        await refresh();
        await sleep(1300);
        await refresh();
      }
      return result;
    } catch (requestError) {
      const message = requestError.response?.data?.message || requestError.message || 'Cloudbeds write-back failed.';
      const requestId = requestError.response?.data?.requestId;
      const decorated = requestId ? `${message} · Request ID ${requestId}` : message;
      setWriteState({ syncing: false, operation, result: null, error: decorated });
      throw requestError;
    }
  }, [refresh]);

  const updateReservation = useCallback((reservationId, payload) => runWrite(
    'reservation.update', () => api.put(`/integrations/cloudbeds/operations/reservations/${reservationId}`, payload)
  ), [runWrite]);

  const assignRoom = useCallback((reservationId, payload) => runWrite(
    'reservation.room_assign', () => api.post(`/integrations/cloudbeds/operations/reservations/${reservationId}/room-assignment`, payload)
  ), [runWrite]);

  const updateGuest = useCallback((guestId, payload) => runWrite(
    'guest.update', () => api.put(`/integrations/cloudbeds/operations/guests/${guestId}`, payload)
  ), [runWrite]);

  const updateHousekeeping = useCallback((roomId, payload) => runWrite(
    'housekeeping.update', () => api.put(`/integrations/cloudbeds/operations/rooms/${roomId}/housekeeping`, payload)
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