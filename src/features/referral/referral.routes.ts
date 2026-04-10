import { Router } from 'express';
import { getStats, getHistory, redeemCode } from './referral.controller';
import { requireAuth } from '../../middlewares/requireAuth';

const router = Router();

router.get('/stats', requireAuth, getStats);
router.get('/history', requireAuth, getHistory);
router.post('/redeem', requireAuth, redeemCode);

export default router;
