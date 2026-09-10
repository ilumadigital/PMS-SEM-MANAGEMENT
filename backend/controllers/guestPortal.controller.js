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

const reservationConfig = async (req, res) => {
    try {
        const config = await guestPortalService.getReservationConfig(req.params.reservationId);
        return res.status(200).json({ success: true, data: config });
    } catch (error) {
        return sendError(res, error);
    }
};

const saveReservationConfig = async (req, res) => {
    try {
        const config = await guestPortalService.saveStayContent(
            req.params.reservationId,
            req.body || {},
            req.user?.userId
        );
        return res.status(200).json({
            success: true,
            message: 'Guest stay information saved.',
            data: config,
        });
    } catch (error) {
        return sendError(res, error, 422);
    }
};

const getCatalog = async (_req, res) => {
    try {
        const catalog = await guestPortalService.listCatalog(true);
        return res.status(200).json({ success: true, data: catalog });
    } catch (error) {
        return sendError(res, error);
    }
};

const updateCatalog = async (req, res) => {
    try {
        const service = await guestPortalService.updateCatalogItem(req.params.serviceKey, req.body || {});
        return res.status(200).json({ success: true, data: service });
    } catch (error) {
        return sendError(res, error, 422);
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

const createServiceRequest = async (req, res) => {
    try {
        const result = await guestPortalService.createServiceRequest(req.params.token, req.body || {});
        return res.status(201).json({
            success: true,
            message: 'Your request has been sent to the SEM team.',
            data: result,
        });
    } catch (error) {
        return sendError(res, error, 422);
    }
};

const createTransferRequest = async (req, res) => {
    try {
        const result = await guestPortalService.createTransferRequest(req.params.token, req.body || {});
        return res.status(201).json({
            success: true,
            message: 'Your transfer request has been sent to dispatch.',
            data: result,
        });
    } catch (error) {
        return sendError(res, error, 422);
    }
};

module.exports = {
    sendInstructions,
    reservationStatus,
    reservationConfig,
    saveReservationConfig,
    getCatalog,
    updateCatalog,
    getPortal,
    completeCheckin,
    createServiceRequest,
    createTransferRequest,
};
