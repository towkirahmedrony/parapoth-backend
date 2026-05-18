import { Request, Response } from 'express';
import { authService } from './auth.service';
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import crypto from 'crypto';

const generateJWT = (userId: string) => `mock_jwt_for_${userId}`;

const getClientIp = (req: Request): string => {
  // সব সম্ভাব্য উপায়ে আইপি খোঁজা
  const forwarded = req.headers['x-forwarded-for'];
  const realIp = req.headers['x-real-ip'];
  const cfIp = req.headers['cf-connecting-ip'];
  
  let ip = '';
  
  if (req.ips && req.ips.length > 0) {
    ip = req.ips[0];
  } else if (typeof forwarded === 'string') {
    ip = forwarded.split(',')[0].trim();
  } else if (Array.isArray(forwarded)) {
    ip = forwarded[0];
  } else if (realIp) {
    ip = realIp as string;
  } else if (cfIp) {
    ip = cfIp as string;
  } else {
    ip = req.ip || req.socket.remoteAddress || '';
  }

  // ক্লিনআপ
  if (ip.includes('::ffff:')) ip = ip.split(':').pop() || '';

  console.log('\n--- [IP LOGGING START] ---');
  console.log('X-Forwarded-For:', forwarded);
  console.log('req.ip:', req.ip);
  console.log('req.ips (Trust Proxy Chain):', req.ips);
  console.log('Extracted IP:', ip);
  console.log('--- [IP LOGGING END] ---\n');

  return ip;
};

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
    try {
      const userId = (req as any).user?.id;
      const email = (req as any).user?.email || 'admin@parapoth.com';
      if (!userId) return res.status(401).json({ error: 'Unauthorized user' });
      const secret = speakeasy.generateSecret({ name: `ParaPoth Admin (${email})` });
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
      const mockAdminProfile = { id: 'some-uuid', is_2fa_enabled: true }; 
      const trustedDeviceToken = req.cookies?.['trusted_admin_device'];
      if (mockAdminProfile.is_2fa_enabled) {
        if (trustedDeviceToken && await authService.isDeviceTrusted(mockAdminProfile.id, trustedDeviceToken)) {
          return res.status(200).json({ token: generateJWT(mockAdminProfile.id), status: 'success' });
        } else {
          return res.status(200).json({ status: 'require_2fa', message: "Please enter your 2FA code." });
        }
      }
      return res.status(200).json({ token: generateJWT(mockAdminProfile.id), status: 'success' });
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  },

  async verify2FA(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id; 
      const { token, trustDevice } = req.body;
      const ipAddress = getClientIp(req);
      if (!userId) return res.status(401).json({ error: "User ID not found." });
      const secret = await authService.get2FASecret(userId);
      if (!secret) return res.status(400).json({ error: "2FA not configured." });
      const isValid = speakeasy.totp.verify({ secret, encoding: 'base32', token, window: 1 });
      if (!isValid) return res.status(400).json({ error: "Invalid code." });
      await authService.enable2FA(userId);
      if (trustDevice) {
        const deviceToken = crypto.randomBytes(32).toString('hex');
        await authService.saveTrustedDevice(userId, deviceToken, ipAddress || 'unknown');
        res.cookie('trusted_admin_device', deviceToken, { maxAge: 30 * 24 * 60 * 60 * 1000, httpOnly: true, secure: true, sameSite: 'strict' });
      }
      return res.status(200).json({ status: 'success' });
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  },

  async saveDeviceInfo(req: Request, res: Response) {
    try {
      const { user_id, device_name, os_or_browser, fcm_token } = req.body;
      if (!user_id) return res.status(400).json({ error: "User ID required" });
      
      const ipAddress = getClientIp(req);
      console.log(`[SAVE_DEVICE] User: ${user_id}, IP: ${ipAddress || 'EMPTY'}`);

      await authService.saveUserDevice({
        user_id,
        device_name,
        os_or_browser,
        fcm_token,
        ip_address: ipAddress || '0.0.0.0' // আইপি না পেলে ডিফল্ট ভ্যালু সেভ হবে
      });

      return res.status(200).json({ success: true });
    } catch (error: any) {
      console.error('[SAVE_DEVICE_ERROR]:', error.message);
      return res.status(500).json({ error: error.message });
    }
  }
};
