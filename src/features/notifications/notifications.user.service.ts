import { supabase } from '../../config/supabase';

export const getUserNotifications = async (userId: string) => {
  // 1. ইউজারের প্রোফাইল ইনফরমেশন নিয়ে আসা
  const { data: profile } = await supabase
    .from('profiles')
    .select('class_level, subscription_status')
    .eq('id', userId)
    .single();

  const classLevel = profile?.class_level || 'all';
  const subStatus = profile?.subscription_status === 'active' ? 'premium' : 'free';

  // 2. সেন্ট (sent) হওয়া সাধারণ নোটিফিকেশনগুলো ফেচ করা
  const { data: notifications, error: notifError } = await supabase
    .from('notifications')
    .select(`
      *,
      notification_reads (is_read, is_clicked)
    `)
    .eq('status', 'sent')
    .order('created_at', { ascending: false });

  if (notifError) throw new Error(notifError.message);

  // 3. নতুন notices টেবিল থেকে গ্লোবাল নোটিশ ফেচ করা
  const { data: notices, error: noticeError } = await supabase
    .from('notices')
    .select('*')
    .eq('is_active', true)
    .lte('published_at', new Date().toISOString())
    .order('published_at', { ascending: false });

  if (noticeError) throw new Error(noticeError.message);

  // 4. টার্গেট রুলস অনুযায়ী সাধারণ নোটিফিকেশন ফিল্টার করা
  const filteredNotifications = notifications.filter(notif => {
    if (notif.target_user_id && notif.target_user_id !== userId) return false;
    
    if (notif.target_rules) {
      const rules = notif.target_rules as any;
      if (rules.subscription_status && rules.subscription_status !== 'all' && rules.subscription_status !== subStatus) return false;
      if (rules.class_level && Array.isArray(rules.class_level) && rules.class_level.length > 0) {
        if (!rules.class_level.includes('all') && !rules.class_level.includes(classLevel)) return false;
      }
    }
    return true;
  });

  // 5. টার্গেট রুলস অনুযায়ী নোটিশ ফিল্টার এবং ম্যাপ (Map) করা
  const mappedNotices = notices.filter(notice => {
    // Expiry চেক
    if (notice.expires_at && new Date(notice.expires_at) < new Date()) return false;

    if (notice.target_rules) {
      const rules = notice.target_rules as any;
      if (rules.subscription_status && rules.subscription_status !== 'all' && rules.subscription_status !== subStatus) return false;
      if (rules.class_level && Array.isArray(rules.class_level) && rules.class_level.length > 0) {
        if (!rules.class_level.includes('all') && !rules.class_level.includes(classLevel)) return false;
      }
    }
    return true;
  }).map(notice => ({
    ...notice,
    type: 'global_notice', // ফ্রন্টএন্ডের ট্যাবের জন্য ফোর্স টাইপ
    created_at: notice.published_at || notice.created_at, // সর্টিংয়ের জন্য
    // নোটিশের জন্য ডামি রিড স্ট্যাটাস, যাতে ফ্রন্টএন্ডে এটি unread হিসেবে শো না করে
    notification_reads: [{ is_read: true, is_clicked: true }] 
  }));

  // 6. দুটি অ্যারে একত্রে মার্জ করে সময় অনুযায়ী সর্ট করা
  const combined = [...filteredNotifications, ...mappedNotices].sort((a, b) => {
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  return combined;
};

export const markNotificationAsRead = async (userId: string, notificationId: string, isClicked: boolean) => {
  const { data, error } = await supabase
    .from('notification_reads')
    .upsert({
      notification_id: notificationId,
      user_id: userId,
      is_read: true,
      is_clicked: isClicked,
      read_at: new Date().toISOString(),
      ...(isClicked && { clicked_at: new Date().toISOString() })
    }, { onConflict: 'notification_id, user_id' })
    .select();

  if (error) throw new Error(error.message);
  return data;
};
