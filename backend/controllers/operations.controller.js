const operationsService = require('../services/operations.service');

function sendError(res, error) {
    console.error('[OPERATIONS API]', error.message);
    return res.status(error.status || 500).json({ success: false, message: error.message || 'Operations request failed.' });
}
const actor = (req) => ({ userId: req.user?.userId, role: req.user?.role });

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
        const data=await operationsService.updateHousekeepingStatus(req.params.roomId,req.body||{},actor(req));
        return res.status(200).json({success:true,message:'Housekeeping status saved locally in SEM PMS.',data});
    } catch(error){ return sendError(res,error); }
};

module.exports = {
    getTransfers, updateTransfer, getHousekeepingSchedule,
    getReservationOperations, updateReservationOperation,
    getHousekeepingStatus, updateHousekeepingStatus,
};
