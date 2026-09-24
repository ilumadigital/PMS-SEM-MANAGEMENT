const DEFAULT_BASES = {
    sandbox: 'https://eric.hosthub.com/api/2019-03-01',
    production: 'https://app.hosthub.com/api/2019-03-01',
};

function getConfig() {
    const environment = String(process.env.HOSTHUB_ENVIRONMENT || 'sandbox').toLowerCase();
    const baseUrl = String(process.env.HOSTHUB_API_BASE || DEFAULT_BASES[environment] || DEFAULT_BASES.sandbox).replace(/\/$/, '');
    const apiKey = String(process.env.HOSTHUB_API_KEY || '').trim();

    return {
        environment,
        baseUrl,
        apiKey,
        configured: Boolean(apiKey),
    };
}

function normalizeArray(payload) {
    if (Array.isArray(payload)) return payload;
    if (!payload || typeof payload !== 'object') return [];
    for (const key of ['data', 'results', 'items', 'rentals', 'bookings', 'events']) {
        if (Array.isArray(payload[key])) return payload[key];
    }
    return [];
}

async function request(path, options = {}) {
    const config = getConfig();
    if (!config.apiKey) {
        const error = new Error('Hosthub API key is not configured.');
        error.code = 'HOSTHUB_NOT_CONFIGURED';
        throw error;
    }

    const response = await fetch(`${config.baseUrl}${path.startsWith('/') ? path : `/${path}`}`, {
        method: options.method || 'GET',
        headers: {
            Authorization: config.apiKey,
            Accept: 'application/json',
            'Content-Type': 'application/json',
            ...(options.headers || {}),
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: AbortSignal.timeout(Number(process.env.HOSTHUB_REQUEST_TIMEOUT_MS || 15000)),
    });

    const raw = await response.text();
    let payload = null;
    try {
        payload = raw ? JSON.parse(raw) : null;
    } catch (_error) {
        payload = raw;
    }

    if (!response.ok) {
        const error = new Error(`Hosthub API returned HTTP ${response.status}`);
        error.code = 'HOSTHUB_API_ERROR';
        error.status = response.status;
        error.payload = payload;
        throw error;
    }

    return payload;
}

async function getRentals() {
    const payload = await request('/rentals');
    return {
        raw: payload,
        rentals: normalizeArray(payload),
    };
}

async function getRentalCalendarEvents(rentalId, query = {}) {
    if (!rentalId) throw new Error('rentalId is required');
    const params = new URLSearchParams();
    Object.entries(query || {}).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
    });
    const suffix = params.toString() ? `?${params.toString()}` : '';
    const payload = await request(`/rentals/${encodeURIComponent(rentalId)}/calendar-events${suffix}`);
    return {
        raw: payload,
        events: normalizeArray(payload),
    };
}

async function testConnection() {
    const startedAt = Date.now();
    const { rentals } = await getRentals();
    return {
        ok: true,
        rentalCount: rentals.length,
        latencyMs: Date.now() - startedAt,
        rentals: rentals.map((rental) => ({
            id: rental.encodedId || rental.encodedID || rental.id || rental._id || null,
            name: rental.name || rental.title || rental.nickname || null,
            raw: rental,
        })),
    };
}

module.exports = {
    getConfig,
    request,
    getRentals,
    getRentalCalendarEvents,
    testConnection,
};
