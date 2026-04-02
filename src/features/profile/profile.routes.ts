import { Router } from 'express';
import { ProfileController } from './profile.controller';

const router = Router();

// GET /api/v1/profiles/public/:id
router.get('/public/:id', ProfileController.getPublicProfile);

export default router;
