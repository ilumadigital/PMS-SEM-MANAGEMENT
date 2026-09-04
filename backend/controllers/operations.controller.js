const operationsService = require('../services/operations.service');

function sendError(res, error) {
    console.error('[OPERATIONS API]', error.message);
    return res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Operations request failed.',
    });
}

const getTransfers = async (req, res) => {
    try {
        const transfers = await operationsService.listTransfers();
        return res.status(200).json({ success: true, data: transfers });
    } catch (error) {
        return sendError(res, error);
    }
};

const updateTransfer = async (req, res) => {
    try {
        const transfer = await operationsService.updateTransfer(req.params.id, req.body || {});
        return res.status(200).json({ success: true, data: transfer });
    } catch (error) {
        return sendError(res, error);
    }
};

const getHousekeepingSchedule = async (req, res) => {
    try {
        const schedule = await operationsService.listHousekeepingSchedule();
        return res.status(200).json({ success: true, data: schedule });
    } catch (error) {
        return sendError(res, error);
    }
};

module.exports = {
    getTransfers,
    updateTransfer,
    getHousekeepingSchedule,
};
