import { Router } from 'express';
import { getPublicMarketplaceItems } from './monetization.controller';

const router = Router();
router.get('/items', getPublicMarketplaceItems);

export default router;
