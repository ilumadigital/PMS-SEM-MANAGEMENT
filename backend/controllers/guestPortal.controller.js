const guestPortalService = require('../services/guestPortal.service');

function sendError(res, error, fallbackStatus = 500) {
    console.error('❌ [GUEST PORTAL]:', error.message);
    return res.status(error.status || fallbackStatus).json({
        success: false,
        error: error.code || 'GUEST_PORTAL_ERROR',
        message: error.message,
    });
}

const sendInstructions = async (req, res) => {
    try {
        const result = await guestPortalService.sendInstructions(req.params.reservationId);
        return res.status(200).json({ success: true, data: result });
    } catch (error) {
        return sendError(res, error);
    }
};

const reservationStatus = async (req, res) => {
    try {
        const status = await guestPortalService.getReservationPortalStatus(req.params.reservationId);
        return res.status(200).json({ success: true, data: status });
    } catch (error) {
        return sendError(res, error);
    }
};

const getPortal = async (req, res) => {
    try {
        const portal = await guestPortalService.getPortalByToken(req.params.token);
        return res.status(200).json({ success: true, data: portal });
    } catch (error) {
        return sendError(res, error, 404);
    }
};

const completeCheckin = async (req, res) => {
    try {
        const portal = await guestPortalService.saveCheckin(req.params.token, req.body || {});
        return res.status(200).json({
            success: true,
            message: 'Online check-in completed.',
            data: portal,
        });
    } catch (error) {
        return sendError(res, error, 422);
    }
};

module.exports = {
    sendInstructions,
    reservationStatus,
    getPortal,
    completeCheckin,
};
