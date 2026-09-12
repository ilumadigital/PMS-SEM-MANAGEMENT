const operationsService = require('../services/operations.service');
const realtimeService = require('../services/realtime.service');
const cloudbedsOperationsService = require('../services/cloudbedsOperations.service');

function sendError(res, error) {
    console.error('[OPERATIONS API]', error.message);
    return res.status(error.status || 500).json({ success: false, message: error.message || 'Operations request failed.' });
}
const actor = (req) => ({ userId: req.user?.userId, role: req.user?.role });

const getRealtimeRevision = async (_req,res) => { try { res.status(200).json({success:true,data:await realtimeService.getRevision()}); } catch(error){ return sendError(res,error); } };

const getTransfers = async (_req,res) => { try { res.status(200).json({success:true,data:await operationsService.listTransfers()}); } catch(error){ return sendError(res,error); } };
const updateTransfer = async (req,res) => { try { res.status(200).json({success:true,data:await operationsService.updateTransfer(req.params.id,req.body||{})}); } catch(error){ return sendError(res,error); } };
const getHousekeepingSchedule = async (_req,res) => { try { res.status(200).json({success:true,data:await operationsService.listHousekeepingSchedule()}); } catch(error){ return sendError(res,error); } };

const getReservationOperations = async (_req,res) => { try { res.status(200).json({success:true,data:await operationsService.listReservationOperations()}); } catch(error){ return sendError(res,error); } };
const updateReservationOperation = async (req,res) => {
    try {
        const data=await operationsService.updateReservationOperation(req.params.reservationId,req.body||{},actor(req));
        return res.status(200).json({success:true,message:'Reservation operation saved locally in SEM PMS.',data});
    } catch(error){ return sendError(res,error); }
};
const getHousekeepingStatus = async (_req,res) => { try { res.status(200).json({success:true,data:await operationsService.listHousekeepingStatus()}); } catch(error){ return sendError(res,error); } };
const updateHousekeepingStatus = async (req,res) => {
    try {
        const payload = req.body || {};
        const requestedCondition = String(payload.roomCondition ?? payload.status ?? '').toLowerCase();
        let cloudbeds = null;

        // Housekeeping room condition is the only operational field that is intentionally
        // written back to Cloudbeds. This keeps Cloudbeds' room picker / front desk view
        // aligned with the cleaning team, while refill and extra linens remain SEM-only.
        if (['dirty', 'clean', 'inspected'].includes(requestedCondition)) {
            cloudbeds = await cloudbedsOperationsService.updateHousekeeping(
                req.params.roomId,
                {
                    propertyId: payload.propertyId,
                    roomCondition: requestedCondition,
                },
                actor(req)
            );
        }

        const data = await operationsService.updateHousekeepingStatus(req.params.roomId, payload, actor(req));
        return res.status(200).json({
            success:true,
            message: cloudbeds
                ? 'Housekeeping room condition synced to Cloudbeds and saved in SEM PMS.'
                : 'Housekeeping details saved locally in SEM PMS.',
            data,
            cloudbedsSynced: Boolean(cloudbeds),
            cloudbeds,
        });
    } catch(error){ return sendError(res,error); }
};

module.exports = {
    getRealtimeRevision,
    getTransfers, updateTransfer, getHousekeepingSchedule,
    getReservationOperations, updateReservationOperation,
    getHousekeepingStatus, updateHousekeepingStatus,
};
