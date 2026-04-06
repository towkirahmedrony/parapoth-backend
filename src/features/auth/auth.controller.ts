import { Request, Response } from 'express';
import { authService } from './auth.service';
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import crypto from 'crypto';

const generateJWT = (userId: string) => `mock_jwt_for_${userId}`;

export const authController = {
  async getProfile(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id; 
      if (!userId) return res.status(401).json({ error: 'Unauthorized user' });

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
      if (!userId) return res.status(401).json({ error: 'Unauthorized user' });

      const role = await authService.getUserRole(userId);
      const permissions = await authService.getUserPermissions(role);

      return res.status(200).json({ role, permissions });
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  },

  async setup2FA(req: Request, res: Response) {
    // ... (আপনার আগের setup2FA কোড যা ছিল তাই থাকবে)
    try {
      const userId = (req as any).user?.id;
      const email = (req as any).user?.email || 'admin@parapoth.com';
      if (!userId) return res.status(401).json({ error: 'Unauthorized user' });

      const secret = speakeasy.generateSecret({
        name: `ParaPoth Admin (${email})`
      });

      const otpauthUrl = secret.otpauth_url;
      if (!otpauthUrl) throw new Error("Failed to generate OTP Auth URL");

      const qrCodeImage = await QRCode.toDataURL(otpauthUrl);
      await authService.save2FASecret(userId, secret.base32);

      return res.status(200).json({ qrCode: qrCodeImage, setupKey: secret.base32, message: "Scan this QR code" });
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  },

  async adminLoginInit(req: Request, res: Response) {
    try {
      // 👈 এখানে আসল প্রোডাকশনে ডাটাবেজ থেকে ইউজারের 2FA স্ট্যাটাস চেক করতে হবে
      // আপাতত আপনার mock প্রোফাইল দিয়ে রাখা হলো
      const mockAdminProfile = { id: 'some-uuid', is_2fa_enabled: true }; 
      const trustedDeviceToken = req.cookies?.['trusted_admin_device'];

      if (mockAdminProfile.is_2fa_enabled) {
        if (trustedDeviceToken && await authService.isDeviceTrusted(mockAdminProfile.id, trustedDeviceToken)) {
          return res.status(200).json({ token: generateJWT(mockAdminProfile.id), status: 'success' });
        } else {
          return res.status(200).json({ 
            status: 'require_2fa', 
            message: "Please enter your 2FA code." 
          });
        }
      }
      return res.status(200).json({ token: generateJWT(mockAdminProfile.id), status: 'success' });
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  },

  async verify2FA(req: Request, res: Response) {
    try {
      // 👈 requireAuth মিডলওয়্যার থেকে ভেরিফাইড userId পেয়ে যাচ্ছি!
      const userId = (req as any).user?.id; 
      const { token, trustDevice } = req.body;

      if (!userId) return res.status(401).json({ error: "User ID not found. Token might be invalid." });

      const secret = await authService.get2FASecret(userId);
      
      if (!secret) return res.status(400).json({ error: "2FA is not configured for this user." });

      const isValid = speakeasy.totp.verify({
        secret: secret,
        encoding: 'base32',
        token: token,
        window: 1 
      });

      if (!isValid) return res.status(400).json({ error: "Invalid 2FA code." });

      await authService.enable2FA(userId);

      if (trustDevice) {
        const deviceToken = crypto.randomBytes(32).toString('hex');
        await authService.saveTrustedDevice(userId, deviceToken);

        res.cookie('trusted_admin_device', deviceToken, {
          maxAge: 30 * 24 * 60 * 60 * 1000,
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict'
        });
      }

      return res.status(200).json({ status: 'success', message: '2FA Verified Successfully' });
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  }
};
