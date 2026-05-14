import { Request, Response, NextFunction } from 'express';
import { AppBuilderService } from './app-builder.service';

export const getAllConfigs = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await AppBuilderService.getAllConfigs();
    res.status(200).json({ success: true, data });
  } catch (error) { next(error); }
};

// --- Home Grids Controllers ---
export const getHomeGrids = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await AppBuilderService.getHomeGrids();
    res.status(200).json({ success: true, data });
  } catch (error) { next(error); }
};

export const saveHomeGrid = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await AppBuilderService.saveHomeGrid(req.body);
    res.status(200).json({ success: true, data });
  } catch (error) { next(error); }
};

export const reorderHomeGrids = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { grids } = req.body;
    const data = await AppBuilderService.reorderHomeGrids(grids);
    res.status(200).json({ success: true, data });
  } catch (error) { next(error); }
};

export const deleteHomeGrid = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    await AppBuilderService.deleteHomeGrid(req.params.id);
    res.status(200).json({ success: true, message: 'Grid deleted successfully' });
  } catch (error) { next(error); }
};

// --- Config Controllers (Theme, Daily Quote, XP Rules) ---
export const getDailyQuote = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await AppBuilderService.getConfig('daily_quote');
    res.status(200).json({ success: true, data });
  } catch (error) { next(error); }
};

export const saveDailyQuote = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { value } = req.body;
    const data = await AppBuilderService.saveConfig('daily_quote', value);
    res.status(200).json({ success: true, data });
  } catch (error) { next(error); }
};

export const getThemeConfig = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await AppBuilderService.getConfig('theme_config');
    res.status(200).json({ success: true, data });
  } catch (error) { next(error); }
};

export const saveThemeConfig = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { value } = req.body;
    const data = await AppBuilderService.saveConfig('theme_config', value);
    res.status(200).json({ success: true, data });
  } catch (error) { next(error); }
};

export const getXpRules = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await AppBuilderService.getConfig('xp_rules');
    res.status(200).json({ success: true, data });
  } catch (error) { next(error); }
};

export const saveXpRules = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    // XP rules frontend sends the whole object as body without 'value' wrapper based on UI
    const data = await AppBuilderService.saveConfig('xp_rules', req.body);
    res.status(200).json({ success: true, data });
  } catch (error) { next(error); }
};

// --- Banners Controllers ---
export const getBanners = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await AppBuilderService.getBanners();
    res.status(200).json({ success: true, data });
  } catch (error) { next(error); }
};

export const createBanner = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await AppBuilderService.createBanner(req.body);
    res.status(201).json({ success: true, data });
  } catch (error) { next(error); }
};

export const updateBanner = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await AppBuilderService.updateBanner(req.params.id, req.body);
    res.status(200).json({ success: true, data });
  } catch (error) { next(error); }
};

export const deleteBanner = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    await AppBuilderService.deleteBanner(req.params.id);
    res.status(200).json({ success: true, message: 'Banner deleted successfully' });
  } catch (error) { next(error); }
};

// --- XP Rules & Levels Controllers ---
export const getLevels = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await AppBuilderService.getLevels();
    res.status(200).json({ success: true, data });
  } catch (error) { next(error); }
};

export const saveLevels = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { levels } = req.body;
    const data = await AppBuilderService.updateLevels(levels);
    res.status(200).json({ success: true, data });
  } catch (error) { next(error); }
};
