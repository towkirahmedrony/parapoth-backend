import { Request, Response } from 'express';
import { MediaService } from './media.service';
import catchAsync from '../../lib/utils/catchAsync';

export const getUploadSignature = catchAsync(async (req: Request, res: Response) => {
  const signatureData = MediaService.generateUploadSignature();
  res.status(200).json({ success: true, data: signatureData });
});

export const saveMedia = catchAsync(async (req: Request, res: Response) => {
  const userId = (req as any).user.id; 
  const mediaRecord = await MediaService.saveMediaRecord(userId, req.body);
  res.status(201).json({ success: true, data: mediaRecord });
});

export const getMediaAssets = catchAsync(async (req: Request, res: Response) => {
  const { type = 'all', search = '', sortBy = 'newest' } = req.query;
  const assets = await MediaService.getAssets(type as string, search as string, sortBy as string);
  res.status(200).json({ success: true, data: assets });
});

export const getTrashAssets = catchAsync(async (req: Request, res: Response) => {
  const assets = await MediaService.getTrashAssets();
  res.status(200).json({ success: true, data: assets });
});

export const scanUnusedMedia = catchAsync(async (req: Request, res: Response) => {
  const unusedAssets = await MediaService.getUnusedMedia();
  res.status(200).json({ success: true, data: unusedAssets });
});

export const softDeleteMediaAssets = catchAsync(async (req: Request, res: Response) => {
  const { assetIds } = req.body;
  if (!assetIds || !Array.isArray(assetIds)) {
    return res.status(400).json({ success: false, message: 'Invalid assetIds array' });
  }
  const result = await MediaService.softDeleteAssets(assetIds);
  res.status(200).json({ success: true, data: result });
});

export const restoreMediaAssets = catchAsync(async (req: Request, res: Response) => {
  const { assetIds } = req.body;
  if (!assetIds || !Array.isArray(assetIds)) {
    return res.status(400).json({ success: false, message: 'Invalid assetIds array' });
  }
  const result = await MediaService.restoreAssets(assetIds);
  res.status(200).json({ success: true, data: result });
});

export const forceDeleteMediaAssets = catchAsync(async (req: Request, res: Response) => {
  const { assetIds } = req.body;
  if (!assetIds || !Array.isArray(assetIds)) {
    return res.status(400).json({ success: false, message: 'Invalid assetIds array' });
  }
  const result = await MediaService.forceDeleteAssets(assetIds);
  res.status(200).json({ success: true, data: result });
});

// নতুন ফাংশন: মিডিয়া আপডেট করার জন্য
export const updateMedia = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { file_name, tags } = req.body;

  if (!id) {
    return res.status(400).json({ success: false, message: 'Asset ID is required' });
  }

  const updatedRecord = await MediaService.updateMediaRecord(id, { file_name, tags });
  res.status(200).json({ success: true, data: updatedRecord });
});
