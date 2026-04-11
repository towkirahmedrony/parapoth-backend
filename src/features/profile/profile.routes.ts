import { Router } from 'express';
import * as ProfileController from './profile.controller';
import { requireAuth } from '../../middlewares/requireAuth';

const router = Router();

// Private Routes (ইউজার লগইন থাকতে হবে)
router.get('/me', requireAuth, ProfileController.getMyProfile);
router.patch('/update', requireAuth, ProfileController.updateProfile);
router.patch('/theme', requireAuth, ProfileController.updateThemePreference); // নতুন রাউট
router.get('/versus/:opponentId', requireAuth, ProfileController.getVersusStats);

// Public Routes (লগইন ছাড়াও দেখা যাবে)
router.get('/public/:identifier', ProfileController.getPublicProfile);

export default router;
