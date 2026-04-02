import { Router } from 'express';
import * as monetizationController from './monetization.controller';

// Named import ব্যবহার করা হলো। 
// (যদি আপনার ফাইলে default export থাকে, তবে ব্র্যাকেট {} সরিয়ে দেবেন)
import { requireAuth } from '../../middlewares/requireAuth';
import { rbacGuard } from '../../middlewares/rbacGuard';

const router = Router();

// এই রাউটগুলো মূলত এডমিনদের জন্য
router.use(requireAuth);
router.use(rbacGuard(['admin'])); 

// Plans
router.route('/plans')
  .get(monetizationController.getPlans)
  .post(monetizationController.createPlan);
router.delete('/plans/:id', monetizationController.deletePlan);

// Coupons
router.route('/coupons')
  .get(monetizationController.getCoupons)
  .post(monetizationController.createCoupon);
router.delete('/coupons/:code', monetizationController.deleteCoupon);

// Gamification - Achievements
router.route('/achievements')
  .get(monetizationController.getAchievements)
  .post(monetizationController.createAchievement);

// Gamification - Quests
router.route('/quests')
  .get(monetizationController.getQuests)
  .post(monetizationController.createQuest);

// Manual Override
router.post('/manual-override', monetizationController.grantManualOverride);

export default router;
