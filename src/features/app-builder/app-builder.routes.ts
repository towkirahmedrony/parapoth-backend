import { Router } from 'express';
import { getHomeGrids, getConfigs, getDailyQuote } from './app-builder.controller';

const router = Router();

router.get('/home-grids', getHomeGrids);
router.get('/configs', getConfigs);
router.get('/daily_quote', getDailyQuote);

export default router;
