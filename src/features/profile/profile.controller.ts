import { Request, Response } from 'express';
import { ProfileService } from './profile.service';

export class ProfileController {
  static async getPublicProfile(req: Request, res: Response) {
    try {
      const { id: targetId } = req.params;
      
      // আপনার auth middleware যদি req.user এ লগ-ইন করা ইউজারের ডাটা রাখে, তবে সেটা এখানে ধরতে পারবেন
      // উদাহরণস্বরূপ: const currentUserId = req.user?.id;
      // আপাতত header বা query থেকে নিচ্ছি টেস্ট করার সুবিধার্থে
      const currentUserId = req.headers['x-user-id'] as string || undefined;

      if (!targetId) {
        return res.status(400).json({ success: false, message: 'Profile ID is required' });
      }

      const profileData = await ProfileService.getPublicProfile(targetId, currentUserId);
      
      return res.status(200).json({
        success: true,
        data: profileData
      });
    } catch (error: any) {
      console.error('Error in getPublicProfile:', error);
      return res.status(500).json({ 
        success: false, 
        message: error.message || 'Failed to fetch public profile' 
      });
    }
  }
}
