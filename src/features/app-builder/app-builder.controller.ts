import { Request, Response } from 'express';
import catchAsync from '../../lib/utils/catchAsync';
import sendResponse from '../../lib/utils/response';
import * as AppBuilderService from './app-builder.service';
import * as SystemService from '../system/system.service';

export const getHomeGrids = catchAsync(async (req: Request, res: Response) => {
  const grids = await AppBuilderService.getActiveHomeGrids();
  sendResponse(res, { statusCode: 200, success: true, message: 'Home grids fetched successfully', data: grids });
});

export const upsertHomeGrid = catchAsync(async (req: Request, res: Response) => {
  const grid = await AppBuilderService.upsertHomeGrid(req.body);
  await SystemService.createAuditLog(req.user!.id, 'UPSERT', 'home_grids', grid.id, req.body);
  sendResponse(res, { statusCode: 200, success: true, message: 'Grid updated successfully', data: grid });
});

export const deleteHomeGrid = catchAsync(async (req: Request, res: Response) => {
  await AppBuilderService.deleteHomeGrid(req.params.id);
  await SystemService.createAuditLog(req.user!.id, 'DELETE', 'home_grids', req.params.id, null);
  sendResponse(res, { statusCode: 200, success: true, message: 'Grid deleted successfully', data: null });
});

export const reorderHomeGrids = catchAsync(async (req: Request, res: Response) => {
  await AppBuilderService.reorderHomeGrids(req.body.grids);
  await SystemService.createAuditLog(req.user!.id, 'REORDER', 'home_grids', 'bulk_reorder', req.body.grids);
  sendResponse(res, { statusCode: 200, success: true, message: 'Grids reordered', data: null });
});

export const getAppConfigs = catchAsync(async (req: Request, res: Response) => {
  const { key } = req.params;
  if (key) {
    const config = await AppBuilderService.getAppConfigByKey(key);
    if (!config) return sendResponse(res, { statusCode: 404, success: false, message: 'Config not found' });
    return sendResponse(res, { statusCode: 200, success: true, message: 'Config fetched', data: config });
  }
  const configs = await AppBuilderService.getGlobalConfigs();
  sendResponse(res, { statusCode: 200, success: true, message: 'Configs fetched', data: configs });
});

export const updateAppConfig = catchAsync(async (req: Request, res: Response) => {
  const key = req.params.key || req.body.key;
  const valuePayload = req.body.value ? { value: req.body.value } : req.body;
  if (!key) return sendResponse(res, { statusCode: 400, success: false, message: 'Config key is required' });

  const config = await AppBuilderService.upsertAppConfig(key, valuePayload);
  await SystemService.createAuditLog(req.user!.id, 'UPDATE', 'app_configs', key, valuePayload);
  sendResponse(res, { statusCode: 200, success: true, message: 'Config updated', data: config });
});

export const updateXPRules = catchAsync(async (req: Request, res: Response) => {
  const rules = req.body;
  const data = await AppBuilderService.updateXPRules(rules);
  await SystemService.createAuditLog(req.user!.id, 'UPDATE', 'app_configs', 'xp_rules', rules);
  sendResponse(res, { statusCode: 200, success: true, message: 'XP rules updated successfully', data });
});

export const getThemeConfig = catchAsync(async (req: Request, res: Response) => {
  let theme = await AppBuilderService.getGlobalThemeConfig();
  if (theme && theme.schedules && Array.isArray(theme.schedules)) {
    const now = new Date();
    const activeSchedules = theme.schedules.filter((s: any) => {
      if (!s.startDate || !s.endDate) return false;
      return now >= new Date(s.startDate) && now <= new Date(s.endDate);
    });

    if (activeSchedules.length > 0) {
      const activeSchedule = activeSchedules[0];
      if (activeSchedule.themeData) {
        theme.active_theme = activeSchedule.presetId;
        theme.colors = { ...theme.colors, ...activeSchedule.themeData.colors };
        theme.bgType = activeSchedule.themeData.bgType || 'color';
        theme.bgMediaUrl = activeSchedule.themeData.bgMediaUrl || '';
        theme.is_scheduled_override = true;
      }
    }
  }
  sendResponse(res, { statusCode: 200, success: true, message: 'Theme configuration fetched successfully', data: theme });
});

export const updateGlobalNotice = catchAsync(async (req: Request, res: Response) => {
  const notice = await AppBuilderService.updateGlobalNotice(req.body);
  sendResponse(res, { statusCode: 200, success: true, message: 'Global notice updated successfully', data: notice });
});

export const getLevels = catchAsync(async (req: Request, res: Response) => {
  const levels = await AppBuilderService.getLevels();
  sendResponse(res, { statusCode: 200, success: true, message: 'Levels fetched successfully', data: levels });
});

export const updateLevels = catchAsync(async (req: Request, res: Response) => {
  const { levels } = req.body;
  const data = await AppBuilderService.updateLevels(levels);
  await SystemService.createAuditLog(req.user!.id, 'UPDATE', 'levels_master', 'bulk_update', levels);
  sendResponse(res, { statusCode: 200, success: true, message: 'Levels updated successfully', data });
});
