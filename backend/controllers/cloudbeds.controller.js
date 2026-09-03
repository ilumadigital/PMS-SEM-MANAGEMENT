const cloudbedsService = require('../services/cloudbeds.service');

function escapeHtml(value) {
    return String(value || '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function sendError(res, error, fallbackStatus = 500) {
    const status = error.status || fallbackStatus;
    console.error('❌ [CLOUDBEDS]:', error.message);

    return res.status(status).json({
        success: false,
        error: error.code || 'CLOUDBEDS_ERROR',
        message: error.message,
    });
}

const connect = async (req, res) => {
    try {
        const authorization = await cloudbedsService.createAuthorizationUrl();
        return res.redirect(authorization.url);
    } catch (error) {
        return sendError(res, error, 500);
    }
};

const reauthorize = async (req, res) => {
    try {
        await cloudbedsService.disconnectIntegration();
        const authorization = await cloudbedsService.createAuthorizationUrl();
        return res.redirect(authorization.url);
    } catch (error) {
        return sendError(res, error, 502);
    }
};

const disconnect = async (req, res) => {
    try {
        const result = await cloudbedsService.disconnectIntegration();
        return res.status(200).json({
            success: true,
            ...result,
        });
    } catch (error) {
        return sendError(res, error, 502);
    }
};

const callback = async (req, res) => {
    const { code, state, error, error_description: errorDescription } = req.query;

    if (error) {
        return res.status(400).send(`
            <!doctype html>
            <html lang="en">
              <head><meta charset="utf-8"><title>Cloudbeds connection failed</title></head>
              <body style="font-family:Arial,sans-serif;padding:40px;background:#111;color:#fff">
                <h1>Cloudbeds connection failed</h1>
                <p>${escapeHtml(errorDescription || error)}</p>
              </body>
            </html>
        `);
    }

    if (!code) {
        return res.status(400).json({
            success: false,
            error: 'CLOUDBEDS_CODE_MISSING',
            message: 'Missing Cloudbeds authorization code.',
        });
    }

    try {
        const result = await cloudbedsService.exchangeAuthorizationCode(code, state);
        const propertyNames = (result.properties || []).map((property) => property.name).join(', ');
        const missingScopes = result.diagnostics?.missingScopes || [];
        const isReady = result.ready === true;

        return res.status(200).send(`
            <!doctype html>
            <html lang="en">
              <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width,initial-scale=1">
                <title>${isReady ? 'Cloudbeds connected' : 'Cloudbeds connection needs attention'}</title>
              </head>
              <body style="margin:0;font-family:Arial,sans-serif;background:#0c0c0c;color:#fff">
                <main style="max-width:760px;margin:80px auto;padding:32px;border:1px solid #2f2f2f;border-radius:20px;background:#151515">
                  <div style="font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#c9a46a">SEM PMS · Cloudbeds</div>
                  <h1 style="margin-top:18px">${isReady ? 'Sandbox connected and PMS data verified' : 'Authorization completed, but PMS data is not ready'}</h1>
                  <p style="line-height:1.7;color:#c9c4bc">Property: <strong style="color:#fff">${escapeHtml(propertyNames || 'Property ID will be discovered from PMS data')}</strong></p>
                  ${
                    isReady
                      ? '<p style="line-height:1.7;color:#c9c4bc">Reservations, guests, rooms and operational data can now be loaded from Cloudbeds.</p>'
                      : `<p style="line-height:1.7;color:#f0d6a5">Cloudbeds issued an API key, but the required PMS resources could not all be verified.</p>
                         <p style="line-height:1.7;color:#c9c4bc">Missing permissions: <strong style="color:#fff">${escapeHtml(missingScopes.join(', ') || 'No data returned by the authorized property')}</strong></p>
                         <p style="line-height:1.7;color:#c9c4bc">Required for the full SEM PMS: <strong style="color:#fff">${escapeHtml((result.requiredScopes || []).join(', '))}</strong></p>`
                  }
                  <a href="${escapeHtml(cloudbedsService.FRONTEND_URL)}" style="display:inline-block;margin-top:18px;padding:14px 18px;border-radius:12px;background:#c9a46a;color:#111;text-decoration:none;font-weight:700">Open SEM PMS</a>
                </main>
              </body>
            </html>
        `);
    } catch (callbackError) {
        console.error('❌ [CLOUDBEDS CALLBACK]:', callbackError.message);
        return res.status(callbackError.status || 500).send(`
            <!doctype html>
            <html lang="en">
              <head><meta charset="utf-8"><title>Cloudbeds connection failed</title></head>
              <body style="font-family:Arial,sans-serif;padding:40px;background:#111;color:#fff">
                <h1>Cloudbeds connection failed</h1>
                <p>${escapeHtml(callbackError.message)}</p>
              </body>
            </html>
        `);
    }
};

const status = async (req, res) => {
    try {
        const result = await cloudbedsService.getConnectionStatus();
        return res.status(200).json({ success: true, ...result });
    } catch (error) {
        return sendError(res, error, 502);
    }
};
const config = async (req, res) => {
    try {
        return res.status(200).json({
            success: true,
            ...cloudbedsService.getRuntimeConfiguration(),
        });
    } catch (error) {
        return sendError(res, error, 500);
    }
};


const reservations = async (req, res) => {
    try {
        const result = await cloudbedsService.listReservations();
        return res.status(200).json({ success: true, ...result });
    } catch (error) {
        if (error.code === 'CLOUDBEDS_NOT_CONNECTED') {
            return sendError(res, error, 409);
        }
        return sendError(res, error, 502);
    }
};

const snapshot = async (req, res) => {
    try {
        const result = await cloudbedsService.listPmsSnapshot();
        return res.status(200).json({ success: true, ...result });
    } catch (error) {
        if (error.code === 'CLOUDBEDS_NOT_CONNECTED') {
            return sendError(res, error, 409);
        }
        return sendError(res, error, 502);
    }
};

const updateReservationOperations = async (req, res) => {
    try {
        const result = await cloudbedsService.saveReservationOperations(
            req.params.reservationId,
            req.body || {}
        );

        return res.status(200).json({
            success: true,
            message: 'Reservation operational details saved.',
            data: result,
        });
    } catch (error) {
        return sendError(res, error, 500);
    }
};

module.exports = {
    connect,
    reauthorize,
    disconnect,
    callback,
    status,
    config,
    snapshot,
    reservations,
    updateReservationOperations,
};
