import { Router } from 'express';
import { requireAuth } from '../../middlewares/requireAuth';
import { getUserBalance, getMarketplaceItems, purchaseItem } from './economy.controller';

const router = Router();

// ফ্রন্টএন্ডের apiClient.get('/user/balance') এর সাথে মিলানোর জন্য
router.get('/user/balance', requireAuth, getUserBalance);

// ফ্রন্টএন্ডের apiClient.get('/marketplace/items') এর সাথে মিলানোর জন্য
router.get('/marketplace/items', requireAuth, getMarketplaceItems);
router.post('/marketplace/purchase', requireAuth, purchaseItem);

export default router;
