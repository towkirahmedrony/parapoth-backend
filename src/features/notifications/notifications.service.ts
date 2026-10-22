import { supabase } from '../../config/supabase';
import { supabaseAdmin } from '../../config/supabaseAdmin';
import { messaging } from '../../config/firebaseAdmin';
import { IMarkReadPayload, IDeviceTokenPayload } from './notifications.types';
import { Language, parseLanguage } from '../../lib/utils/language';

type BilingualCopy = { bn: string; en: string };
const localizedCopy = (copy: BilingualCopy, language: Language): string =>
  copy[language]?.trim() || copy[language === 'en' ? 'bn' : 'en']?.trim() || '';

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
      device_platform: 'web',
    });

  if (error) throw error;
  return data;
};

export const saveUserDeviceToken = async (userId: string, payload: IDeviceTokenPayload) => {
  if (!userId) {
    throw new Error('User ID is required');
  }

  if (!payload.device_id) {
    throw new Error('Device ID is required');
  }

  const { data, error } = await supabase
    .from('user_devices')
    .upsert(
      {
        user_id: userId,
        device_id: payload.device_id,
        device_name: payload.device_name || 'Web Client',
        os_or_browser: payload.os_or_browser || 'Unknown',
        fcm_token: payload.fcm_token,
        ip_address: payload.ip_address || null,
        last_active_at: new Date().toISOString(),
        is_trusted: true,
      },
      {
        onConflict: 'user_id,device_id',
      }
    )
    .select();

  if (error) {
    console.error('Device token save failed:', error);
    throw new Error(error.message);
  }

  console.log('Device token saved or updated:', data);

  return data;
};

// ==========================================
// FCM Web Push Notification Function
// ==========================================
export const sendPushNotification = async (
  userId: string,
  title: BilingualCopy,
  body: BilingualCopy,
  imageUrl?: string,
  actionLink?: string
) => {
  try {
    const { data: profile } = await supabaseAdmin.from('profiles').select('language_preference').eq('id', userId).maybeSingle();
    const language = parseLanguage(profile?.language_preference);
    const { data: userDevices, error } = await supabaseAdmin
      .from('user_devices')
      .select('fcm_token')
      .eq('user_id', userId)
      .not('fcm_token', 'is', null);

    if (error || !userDevices || userDevices.length === 0) return;

    const tokens = userDevices
      .map((device) => device.fcm_token)
      .filter(Boolean) as string[];

    if (tokens.length === 0) return;

    const message = {
      data: {
        title: localizedCopy(title, language) || 'New Notification',
        body: localizedCopy(body, language),
        image_url: imageUrl || '',
        action_link: actionLink || '/',
        type: 'general',
      },
      tokens,
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
/**
 * Bilingual "payment successful" notification.
 *
 * Only sent after the payment row has actually transitioned to `paid`, and it
 * deliberately contains no transaction id, sender number or amount so payment
 * credentials never end up in a notification payload. Failures are swallowed:
 * a notification must never roll back a completed payment.
 */
export const sendPaymentSuccessNotification = async (
  userId: string,
  plan: { name?: string | null; nameEn?: string | null; days?: number | null } = {}
) => {
  try {
    const planBn = (plan.name || '').trim();
    const planEn = (plan.nameEn || plan.name || '').trim();
    const days = Number(plan.days);

    const title: BilingualCopy = {
      bn: 'পেমেন্ট সফল হয়েছে',
      en: 'Payment successful',
    };

    const body: BilingualCopy = {
      bn: planBn
        ? `আপনার "${planBn}" প্ল্যান চালু হয়েছে। এখন প্রিমিয়াম সুবিধা ব্যবহার করতে পারবেন।`
        : 'আপনার প্রিমিয়াম প্ল্যান চালু হয়েছে। এখন প্রিমিয়াম সুবিধা ব্যবহার করতে পারবেন।',
      en: planEn
        ? `Your "${planEn}" plan is now active. Premium access is available.`
        : 'Your premium plan is now active. Premium access is available.',
    };

    const { error } = await supabaseAdmin.from('notifications').insert({
      target_user_id: userId,
      title_bn: title.bn,
      title_en: title.en,
      body_bn: body.bn,
      body_en: body.en,
      type: 'payment',
      channel: 'in_app',
      action_link: '/premium',
      meta_data: Number.isFinite(days) && days > 0 ? { plan_days: days } : {},
    });

    if (error) {
      console.error('❌ Failed to store payment notification:', error.message);
      return;
    }

    await sendPushNotification(userId, title, body, undefined, '/premium');
  } catch (err) {
    console.error('❌ Payment notification exception:', err);
  }
};

export const sendRewardNotification = async (
  userId: string,
  title: BilingualCopy,
  body: BilingualCopy,
  coins: number = 0,
  xp: number = 0
) => {
  try {
    let metadata = {};

    if (coins > 0 || xp > 0) {
      metadata = { reward: { coins, xp } };
    }

    const { error } = await supabaseAdmin.from('notifications').insert({
      target_user_id: userId,
      title_en: title.en,
      title_bn: title.bn,
      body_en: body.en,
      body_bn: body.bn,
      type: 'reward',
      channel: 'in_app',
      meta_data: metadata,
    });

    if (error) {
      console.error('❌ Failed to send reward notification to DB:', error);
      return;
    }

    await sendPushNotification(
      userId,
      title,
      body,
      'https://parapoth.com/icons/reward.webp',
      '/profile'
    );
  } catch (err) {
    console.error('❌ Notification Exception:', err);
  }
};
