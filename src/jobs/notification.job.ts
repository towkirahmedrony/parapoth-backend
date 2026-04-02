import cron from 'node-cron';
import { supabase } from '../config/supabase';

export const initNotificationCron = () => {
  console.log('⏳ Notification Cron Job Initialized (Running every minute)...');

  // প্রতি ১ মিনিটে রান করবে
  cron.schedule('* * * * *', async () => {
    try {
      // ১. Scheduled নোটিফিকেশনগুলো খুঁজে বের করা
      const { data: pendingCampaigns, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('status', 'scheduled');

      if (error) throw error;
      
      // যদি কোনো পেন্ডিং ক্যাম্পেইন না থাকে, তাহলে কিছু করার দরকার নেই
      if (!pendingCampaigns || pendingCampaigns.length === 0) return;

      console.log(`🚀 Found ${pendingCampaigns.length} scheduled campaigns. Processing...`);

      for (const campaign of pendingCampaigns) {
        // ২. স্ট্যাটাস আপডেট করে 'sent' করা
        const { error: updateError } = await supabase
          .from('notifications')
          .update({
            status: 'sent',
            sent_at: new Date().toISOString()
          })
          .eq('id', campaign.id);

        if (updateError) {
          console.error(`Failed to update campaign ${campaign.id}:`, updateError);
          continue;
        }

        console.log(`✅ Campaign "${campaign.title_en || campaign.title_bn}" marked as SENT.`);

        // [নোট] Firebase Admin SDK দিয়ে ইউজারের ফোনে Push পপ-আপ পাঠানোর আসল লজিকটি আমরা পরবর্তীতে এখানে বসাব।
        // আপাতত এটি 'sent' হয়ে যাওয়ায় আপনার ইউজার অ্যাপের নোটিফিকেশন লিস্টে সাথে সাথেই শো করবে।
      }
    } catch (error) {
      console.error('🔥 Error in Notification Cron Job:', error);
    }
  });
};
