import { supabase } from '../../config/supabase';
import { supabaseAdmin } from '../../config/supabaseAdmin';
import { messaging } from '../../config/firebaseAdmin';
import { IMarkReadPayload, IDeviceTokenPayload } from './notifications.types';

export const getUserNotifications = async (userId: string) => {
  const { data, error } = await supabase
    .from('notifications')
    .select(`
      id, title_en, title_bn, body_en, body_bn, type, image_url, action_link, created_at,
      notification_reads (is_read, is_clicked)
    `)
    .eq('target_user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data;
};

export const markNotificationAsRead = async (userId: string, payload: IMarkReadPayload) => {
  const { data, error } = await supabase
    .from('notification_reads')
    .upsert({
      notification_id: payload.notification_id,
      user_id: userId,
      is_read: true,
      is_clicked: payload.is_clicked || false,
      read_at: new Date().toISOString(),
      clicked_at: payload.is_clicked ? new Date().toISOString() : null,
      device_platform: 'web'
    });

  if (error) throw error;
  return data;
};

export const saveUserDeviceToken = async (userId: string, payload: IDeviceTokenPayload) => {
  const { data, error } = await supabase
    .from('user_devices')
    .upsert({
      device_id: payload.device_id,
      user_id: userId,
      device_name: payload.device_name || 'Web Client',
      os_or_browser: payload.os_or_browser || 'Unknown',
      fcm_token: payload.fcm_token,
      last_active_at: new Date().toISOString(),
      is_trusted: true
    }, { onConflict: 'device_id' });

  if (error) throw error;
  return data;
};

// ==========================================
// FCM Web Push Notification Function
// ==========================================
export const sendPushNotification = async (userId: string, title: string, body: string, imageUrl?: string, actionLink?: string) => {
  try {
    const { data: userDevices, error } = await supabaseAdmin
      .from('user_devices')
      .select('fcm_token')
      .eq('user_id', userId)
      .not('fcm_token', 'is', null);

    if (error || !userDevices || userDevices.length === 0) return;

    const tokens = userDevices.map(device => device.fcm_token);

    const message = {
      data: {
        title: title || 'New Notification',
        body: body || '',
        image_url: imageUrl || '',
        action_link: actionLink || '/',
        type: 'general'
      },
      tokens: tokens
    };

    const response = await messaging.sendEachForMulticast(message);
    console.log(`FCM Push Sent: ${response.successCount} success, ${response.failureCount} failed.`);
  } catch (err) {
    console.error('FCM Push Notification Error:', err);
  }
};

// ==========================================
// Automated System Notification Helper
// ==========================================
export const sendRewardNotification = async (userId: string, title: string, body: string, coins: number = 0, xp: number = 0) => {
  try {
    let metadata = {};
    if (coins > 0 || xp > 0) {
      metadata = { reward: { coins, xp } };
    }

    const { error } = await supabaseAdmin.from('notifications').insert({
      target_user_id: userId,
      title_en: title,
      title_bn: title,
      body_en: body,
      body_bn: body,
      type: 'reward', // স্পেশাল টাইপ যা ফ্রন্টএন্ডে গিফট আইকন দেখাতে সাহায্য করবে
      channel: 'in_app',
      meta_data: metadata
    });

    if (error) {
      console.error('❌ Failed to send reward notification to DB:', error);
      return; 
    }

    // Call Web Push Notification
    await sendPushNotification(userId, title, body, "https://parapoth.com/icons/reward.webp", "/profile");

  } catch (err) {
    console.error('❌ Notification Exception:', err);
  }
};
