import { Router } from 'express';
import { 
  getAllConfigs,
  getHomeGrids, saveHomeGrid, reorderHomeGrids, deleteHomeGrid,
  getDailyQuote, saveDailyQuote,
  getThemeConfig, saveThemeConfig,
  getBanners, createBanner, updateBanner, deleteBanner,
  getLevels, saveLevels,
  getXpRules, saveXpRules
} from './app-builder.controller';

const router = Router();

// --- General Configs Route ---
router.get('/configs', getAllConfigs);

// --- Home Grids Routes ---
router.get('/home-grids', getHomeGrids);
router.post('/home-grids', saveHomeGrid);
router.patch('/home-grids/reorder', reorderHomeGrids);
router.delete('/home-grids/:id', deleteHomeGrid);

// --- Daily Quote Routes ---
router.get('/configs/daily_quote', getDailyQuote); 
router.post('/configs/daily_quote', saveDailyQuote);

// --- Theme Config Routes ---
router.get('/theme-config', getThemeConfig);
router.post('/configs/theme_config', saveThemeConfig);

// --- Banners Routes ---
router.get('/banners', getBanners);
router.post('/banners', createBanner);
router.put('/banners/:id', updateBanner);
router.delete('/banners/:id', deleteBanner);

// --- Leagues & Levels Routes ---
router.get('/levels', getLevels);
router.put('/levels', saveLevels);

// --- XP Rules Routes ---
router.get('/configs/xp_rules', getXpRules);
router.put('/xp-rules', saveXpRules);

export default router;
