import { supabase } from '../../config/supabase';
import { supabaseAdmin } from '../../config/supabaseAdmin';
import { messaging } from '../../config/firebaseAdmin';

// --- CAMPAIGNS ---
export const createCampaign = async (campaignData: any, adminId: string) => {
  // ১. ডাটাবেসে সেভ করা (status 'scheduled' এর বদলে 'sent' দেওয়া হলো যাতে সাথে সাথে যায়)
  const { data, error } = await supabase.from('notifications').insert({ 
    ...campaignData, 
    created_by: adminId, 
    status: 'sent', 
    total_sent: 0, 
    total_clicks: 0 
  }).select().single();
  
  if (error) throw new Error(error.message); 

  // ২. ফায়ারবেসের মাধ্যমে পুশ নোটিফিকেশন পাঠানো
  try {
    // সব ইউজারের ফায়ারবেস টোকেন নিয়ে আসা (যাদের টোকেন null নয়)
    const { data: userDevices } = await supabaseAdmin
      .from('user_devices')
      .select('fcm_token')
      .not('fcm_token', 'is', null);

    if (userDevices && userDevices.length > 0) {
      const tokens = userDevices.map(device => device.fcm_token);
      
      const message = {
        notification: {
          title: campaignData.title_bn || campaignData.title_en,
          body: campaignData.body_bn || campaignData.body_en,
        },
        webpush: {
          headers: {
            image: campaignData.image_url || ''
          },
          fcm_options: {
            link: campaignData.action_link || '/'
          }
        },
        tokens: tokens // সব টোকেনে পাঠানো হচ্ছে
      };

      const response = await messaging.sendEachForMulticast(message);
      
      // কতজনকে পাঠানো হলো সেই সংখ্যাটি ডাটাবেসে আপডেট করা
      await supabase.from('notifications').update({ total_sent: response.successCount }).eq('id', data.id);
      console.log(`Campaign broadcasted. Success: ${response.successCount}, Failed: ${response.failureCount}`);
    }
  } catch (pushError) {
    console.error('Error broadcasting push notification:', pushError);
  }

  return data;
};

export const getCampaigns = async () => {
  const { data, error } = await supabase.from('notifications').select('*').order('created_at', { ascending: false });
  if (error) throw new Error(error.message); return data;
};

export const cancelCampaign = async (id: string) => {
  const { data, error } = await supabase.from('notifications').update({ status: 'cancelled' }).eq('id', id).select().single();
  if (error) throw new Error(error.message); return data;
};

export const updateCampaign = async (id: string, payload: any) => {
  const { data, error } = await supabase.from('notifications').update(payload).eq('id', id).select().single();
  if (error) throw new Error(error.message); return data;
};

export const deleteCampaign = async (id: string) => {
  const { data, error } = await supabase.from('notifications').delete().eq('id', id).select().single();
  if (error) throw new Error(error.message); return data;
};

// --- GLOBAL NOTICES ---
export const createNotice = async (noticeData: any, adminId: string) => {
  const { data, error } = await supabase.from('notices').insert({ ...noticeData, created_by: adminId }).select().single();
  if (error) throw new Error(error.message); return data;
};

export const getNotices = async () => {
  const { data, error } = await supabase.from('notices').select('*').order('created_at', { ascending: false });
  if (error) throw new Error(error.message); return data;
};

export const updateNotice = async (id: string, payload: any) => {
  const { data, error } = await supabase.from('notices').update(payload).eq('id', id).select().single();
  if (error) throw new Error(error.message); return data;
};

export const deleteNotice = async (id: string) => {
  const { data, error } = await supabase.from('notices').delete().eq('id', id).select().single();
  if (error) throw new Error(error.message); return data;
};
