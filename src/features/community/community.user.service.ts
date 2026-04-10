import { supabase } from '../../config/supabase';

export const getLobbyDashboard = async (userId: string) => {
  const { data: profile, error: profileErr } = await supabase.from('profiles').select('current_group_id').eq('id', userId).single();
  if (profileErr) throw new Error('User profile not found');

  let myGroup = null;
  let squadActivity: any[] = [];

  if (profile?.current_group_id) {
    const { data: groupData } = await supabase.from('study_groups').select('id, name, group_level, total_xp, current_streak').eq('id', profile.current_group_id).single();
    myGroup = groupData;
    const { data: activities } = await supabase.from('group_chats').select('id, content, created_at, profiles(full_name)').eq('group_id', profile.current_group_id).order('created_at', { ascending: false }).limit(5);
    squadActivity = activities || [];
  }

  const { data: topGroups } = await supabase.from('study_groups').select('id, name, group_level, total_xp').order('total_xp', { ascending: false }).limit(10);
  return { hasGroup: !!myGroup, myGroup, topGroups: topGroups || [], squadActivity };
};

export const startFocusSession = async (userId: string, topic: string) => {
  const { data: profile } = await supabase.from('profiles').select('current_group_id').eq('id', userId).single();
  if (!profile?.current_group_id) throw new Error("You must be in a study group to start a focus session");
  const { data, error } = await supabase.from('group_focus_sessions').insert({ group_id: profile.current_group_id, started_by: userId, topic: topic, start_time: new Date().toISOString() }).select().single();
  if (error) throw new Error(`Failed to start focus session: ${error.message}`);
  return data;
};

export const initiateBattle = async (userId: string) => {
  const { data: profile } = await supabase.from('profiles').select('current_group_id').eq('id', userId).single();
  if (!profile?.current_group_id) throw new Error("Join a group first to challenge others!");
  const { data, error } = await supabase.from('group_battles').insert({ initiated_by: userId, group_id: profile.current_group_id, status: 'pending' }).select().single();
  if (error) throw new Error(`Failed to initiate battle: ${error.message}`);
  return data;
};

export const sendBuzz = async (senderId: string, targetUserId: string) => {
  const { error } = await supabase.from('notifications').insert({ target_user_id: targetUserId, title_en: 'Buzz! 🔔', body_en: 'Your teammate just buzzed you to join the lobby/study session!', type: 'buzz', channel: 'in_app' });
  if (error) throw new Error('Failed to send buzz notification');
  return true;
};

export const rewardFirstTimeGroupJoin = async (userId: string) => {
  // Use a sensible default of 100 if not set in config
  await supabase.rpc('update_user_progress', { p_coins: 0, p_user_id: userId, p_xp: 100 });
};

export const rewardGroupBattleWin = async (groupId: string) => {
  const { data } = await supabase.from('app_configs').select('value').eq('key', 'xp_rules').maybeSingle();
  const xp = (data?.value as any)?.group_battle_win || 200;

  const { data: members } = await supabase.from('group_members').select('user_id').eq('group_id', groupId);
  if (members && members.length > 0) {
    for (const member of members) {
      if (member.user_id) {
        await supabase.rpc('update_user_progress', { p_coins: 0, p_user_id: member.user_id, p_xp: xp });
      }
    }
  }
};
