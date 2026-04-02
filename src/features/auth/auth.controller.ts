import { Request, Response } from 'express';
import { authService } from './auth.service';

export const authController = {
  async getProfile(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id; 
      
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized user' });
      }

      const profile = await authService.getProfile(userId);
      
      authService.updateLastActive(userId).catch(console.error);

      return res.status(200).json(profile);
    } catch (error: any) {
      return res.status(400).json({ error: error.message });
    }
  },

  async getRoleAndPermissions(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id;
      
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized user' });
      }

      const role = await authService.getUserRole(userId);
      const permissions = await authService.getUserPermissions(role);

      return res.status(200).json({ role, permissions });
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  }
};
