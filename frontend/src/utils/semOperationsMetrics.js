import { semToday, semTomorrow } from '../data/semDemoData';

export const getPropertyById = (properties, propertyId) => {
  return properties.find((property) => property.id === propertyId);
};

export const getRoomById = (rooms, roomId) => {
  return rooms.find((room) => room.id === roomId);
};

export const getTodayArrivals = (reservations) => {
  return reservations.filter((reservation) => reservation.arrivalDate === semToday);
};

export const getTodayDepartures = (reservations) => {
  return reservations.filter((reservation) => reservation.departureDate === semToday);
};

export const getTomorrowArrivals = (reservations) => {
  return reservations.filter((reservation) => reservation.arrivalDate === semTomorrow);
};

export const getTomorrowDepartures = (reservations) => {
  return reservations.filter((reservation) => reservation.departureDate === semTomorrow);
};

export const getMissingInfoReservations = (reservations) => {
  return reservations.filter((reservation) => reservation.missingFields.length > 0);
};

export const getCleaningSummary = (cleaningTasks) => {
  return {
    pending: cleaningTasks.filter((task) => task.status === 'pending').length,
    inProgress: cleaningTasks.filter((task) => task.status === 'in_progress').length,
    completed: cleaningTasks.filter((task) => task.status === 'completed').length,
    overdue: cleaningTasks.filter(
      (task) => task.status !== 'completed' && task.priority === 'high'
    ).length,
    total: cleaningTasks.length,
  };
};

export const getRoomStatusSummary = (rooms) => {
  return {
    ready: rooms.filter((room) => room.housekeepingStatus === 'ready').length,
    dirty: rooms.filter((room) => room.housekeepingStatus === 'dirty').length,
    inProgress: rooms.filter((room) => room.housekeepingStatus === 'in_progress').length,
    pendingInspection: rooms.filter((room) => room.housekeepingStatus === 'pending_inspection').length,
    total: rooms.length,
  };
};

export const getShuttleSummary = (shuttleRequests) => {
  return {
    open: shuttleRequests.filter((request) => request.status !== 'completed').length,
    unassigned: shuttleRequests.filter((request) => request.status === 'unassigned').length,
    scheduled: shuttleRequests.filter((request) => request.status === 'scheduled').length,
    completed: shuttleRequests.filter((request) => request.status === 'completed').length,
    total: shuttleRequests.length,
  };
};

export const getSyncSummary = (syncEvents) => {
  return {
    healthy: syncEvents.filter((event) => event.status === 'healthy').length,
    warning: syncEvents.filter((event) => event.status === 'warning').length,
    error: syncEvents.filter((event) => event.status === 'error').length,
    totalNew: syncEvents.reduce((sum, event) => sum + event.newReservations, 0),
    totalModified: syncEvents.reduce((sum, event) => sum + event.modifiedReservations, 0),
    totalCancelled: syncEvents.reduce((sum, event) => sum + event.cancelledReservations, 0),
  };
};

export const getCommunicationSummary = (communications) => {
  return {
    pending: communications.filter((item) => item.status === 'pending').length,
    sent: communications.filter((item) => item.status === 'sent').length,
    failed: communications.filter((item) => item.status === 'failed').length,
  };
};

export const getLinenSummary = (linenInventory) => {
  return {
    lowStock: linenInventory.filter((item) => item.status === 'low_stock').length,
    totalClean: linenInventory.reduce((sum, item) => sum + item.cleanStock, 0),
    totalDirty: linenInventory.reduce((sum, item) => sum + item.dirtyStock, 0),
  };
};

export const getOperationalBottlenecks = ({
  reservations,
  cleaningTasks,
  shuttleRequests,
  syncEvents,
  communications,
  linenInventory,
}) => {
  const bottlenecks = [];

  getMissingInfoReservations(reservations).forEach((reservation) => {
    bottlenecks.push({
      id: `missing-${reservation.id}`,
      severity: 'high',
      module: 'Reception',
      title: 'Missing reservation information',
      description: `${reservation.guestName} has missing fields: ${reservation.missingFields.join(', ')}.`,
      action: 'Complete guest details',
    });
  });

  cleaningTasks
    .filter((task) => task.status !== 'completed' && task.priority === 'high')
    .forEach((task) => {
      bottlenecks.push({
        id: `cleaning-${task.id}`,
        severity: 'critical',
        module: 'Cleaning',
        title: 'High priority cleaning task pending',
        description: `Room ${task.roomNumber} must be ready before ${task.dueTime}.`,
        action: 'Open cleaning task',
      });
    });

  shuttleRequests
    .filter((request) => request.status === 'unassigned')
    .forEach((request) => {
      bottlenecks.push({
        id: `shuttle-${request.id}`,
        severity: 'critical',
        module: 'Shuttle',
        title: 'Shuttle request without driver',
        description: `${request.guestName} pickup at ${request.pickupTime} has no driver or vehicle assigned.`,
        action: 'Assign driver',
      });
    });

  syncEvents
    .filter((event) => event.status !== 'healthy')
    .forEach((event) => {
      bottlenecks.push({
        id: `sync-${event.id}`,
        severity: event.status === 'error' ? 'critical' : 'medium',
        module: 'Sync',
        title: `${event.provider} sync requires review`,
        description: event.message,
        action: 'Review sync event',
      });
    });

  communications
    .filter((item) => item.status === 'pending')
    .forEach((item) => {
      bottlenecks.push({
        id: `communication-${item.id}`,
        severity: 'medium',
        module: 'Communication',
        title: 'Guest communication pending',
        description: `${item.type} for ${item.guestName} is scheduled for ${item.scheduledFor}.`,
        action: 'Open message',
      });
    });

  linenInventory
    .filter((item) => item.status === 'low_stock')
    .forEach((item) => {
      bottlenecks.push({
        id: `linen-${item.id}`,
        severity: 'medium',
        module: 'Linen',
        title: 'Low linen stock',
        description: `${item.item} is below minimum clean stock threshold.`,
        action: 'Open inventory',
      });
    });

  return bottlenecks;
};

export const buildSemDashboardMetrics = ({
  properties,
  rooms,
  reservations,
  cleaningTasks,
  shuttleRequests,
  syncEvents,
  communications,
  linenInventory,
}) => {
  const totalRooms = properties.reduce((sum, property) => sum + property.totalRooms, 0);
  const occupiedRooms = rooms.filter((room) =>
    ['occupied', 'checkout_today'].includes(room.occupancyStatus)
  ).length;

  const occupancyRate = totalRooms ? Math.round((occupiedRooms / totalRooms) * 100) : 0;

  const cleaning = getCleaningSummary(cleaningTasks);
  const roomStatus = getRoomStatusSummary(rooms);
  const shuttle = getShuttleSummary(shuttleRequests);
  const sync = getSyncSummary(syncEvents);
  const communication = getCommunicationSummary(communications);
  const linen = getLinenSummary(linenInventory);
  const bottlenecks = getOperationalBottlenecks({
    reservations,
    cleaningTasks,
    shuttleRequests,
    syncEvents,
    communications,
    linenInventory,
  });

  return {
    todayArrivals: getTodayArrivals(reservations),
    todayDepartures: getTodayDepartures(reservations),
    tomorrowArrivals: getTomorrowArrivals(reservations),
    tomorrowDepartures: getTomorrowDepartures(reservations),
    missingInfoReservations: getMissingInfoReservations(reservations),
    occupancyRate,
    cleaning,
    roomStatus,
    shuttle,
    sync,
    communication,
    linen,
    bottlenecks,
  };
};