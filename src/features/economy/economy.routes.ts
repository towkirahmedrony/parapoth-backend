import { Router } from 'express';
import { requireAuth } from '../../middlewares/requireAuth';
import { rbacGuard } from '../../middlewares/rbacGuard'; // 👈 এডমিন রাউটের জন্য
import { 
  getUserBalance, 
  getMarketplaceItems, 
  purchaseItem,
  getAdminMarketplaceItems,
  createMarketplaceItem,
  updateMarketplaceItem,
  deleteMarketplaceItem
} from './economy.controller';

const router = Router();

// === ইউজার রাউটস ===
router.get('/user/balance', requireAuth, getUserBalance);
router.get('/marketplace/items', requireAuth, getMarketplaceItems);
router.post('/marketplace/purchase', requireAuth, purchaseItem);

// === এডমিন রাউটস (RBAC Guard সহ) ===
router.get('/admin/marketplace/items', requireAuth, rbacGuard(['admin']), getAdminMarketplaceItems);
router.post('/admin/marketplace/items', requireAuth, rbacGuard(['admin']), createMarketplaceItem);
router.put('/admin/marketplace/items/:id', requireAuth, rbacGuard(['admin']), updateMarketplaceItem);
router.delete('/admin/marketplace/items/:id', requireAuth, rbacGuard(['admin']), deleteMarketplaceItem);

export default router;
