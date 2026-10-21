import cron from 'node-cron';
import { supabase } from '../config/supabase';
import { supabaseAdmin } from '../config/supabaseAdmin';
import { messaging } from '../config/firebaseAdmin';
import { parseLanguage } from '../lib/utils/language';

const chooseText = (language: 'bn' | 'en', bn?: string | null, en?: string | null): string => {
  const preferred = language === 'en' ? en : bn;
  const fallback = language === 'en' ? bn : en;
  return preferred?.trim() || fallback?.trim() || '';
};

export const initNotificationCron = () => {
  console.log('⏳ Notification Cron Job Initialized (Running every minute)...');

  cron.schedule('* * * * *', async () => {
    try {
      const { data: campaigns, error } = await supabase
        .from('notifications')
        .select('id, title_bn, title_en, body_bn, body_en, image_url, action_link, target_user_id')
        .eq('status', 'scheduled');
      if (error) throw error;
      if (!campaigns?.length) return;

      console.log(`🚀 Found ${campaigns.length} scheduled campaigns. Processing...`);
      for (const campaign of campaigns) {
        let successCount = 0;
        try {
          let deviceQuery = supabaseAdmin.from('user_devices').select('user_id, fcm_token').not('fcm_token', 'is', null);
          if (campaign.target_user_id) deviceQuery = deviceQuery.eq('user_id', campaign.target_user_id);
          const { data: devices, error: deviceError } = await deviceQuery;
          if (deviceError) throw deviceError;

          const userIds = [...new Set((devices || []).map((device) => device.user_id).filter(Boolean))] as string[];
          const { data: profiles, error: profileError } = userIds.length
            ? await supabaseAdmin.from('profiles').select('id, language_preference').in('id', userIds)
            : { data: [], error: null };
          if (profileError) throw profileError;
          const languages = new Map((profiles || []).map((profile) => [profile.id, parseLanguage(profile.language_preference)]));
          const tokensByLanguage: Record<'bn' | 'en', string[]> = { bn: [], en: [] };
          for (const device of devices || []) {
            if (device.fcm_token) tokensByLanguage[languages.get(device.user_id) || 'bn'].push(device.fcm_token);
          }

          for (const language of ['bn', 'en'] as const) {
            const tokens = tokensByLanguage[language];
            if (!tokens.length) continue;
            const response = await messaging.sendEachForMulticast({
              data: {
                title: chooseText(language, campaign.title_bn, campaign.title_en) || 'New Notification',
                body: chooseText(language, campaign.body_bn, campaign.body_en),
                image_url: campaign.image_url || '',
                action_link: campaign.action_link || '/',
                type: 'campaign',
              },
              tokens,
            });
            successCount += response.successCount;
          }
        } catch (pushError) {
          // Mark once after the attempt to avoid duplicate sends on the next cron tick.
          console.error(`Failed to deliver scheduled campaign ${campaign.id}:`, pushError);
        }

        const { error: updateError } = await supabase.from('notifications')
          .update({ status: 'sent', sent_at: new Date().toISOString(), total_sent: successCount })
          .eq('id', campaign.id);
        if (updateError) console.error(`Failed to mark campaign ${campaign.id} as sent:`, updateError);
        else console.log(`✅ Campaign "${campaign.title_en || campaign.title_bn}" sent to ${successCount} devices.`);
      }
    } catch (error) {
      console.error('🔥 Error in Notification Cron Job:', error);
    }
  });
};
