import { supabaseAdmin } from '../../config/supabaseAdmin';

export class ReferralService {
  static async getStats(userId: string) {
    const { data: profile, error: profileErr } = await supabaseAdmin
      .from('profiles')
      .select('referral_code')
      .eq('id', userId)
      .single();

    if (profileErr) throw profileErr;

    const { count, error: countErr } = await supabaseAdmin
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('referred_by', userId);

    if (countErr) throw countErr;

    const { data: txs, error: txErr } = await supabaseAdmin
      .from('coin_transactions')
      .select('amount')
      .eq('user_id', userId)
      .eq('transaction_type', 'referral_bonus');

    if (txErr) throw txErr;

    const totalEarned = txs?.reduce((sum, tx) => sum + (tx.amount || 0), 0) || 0;

    return {
      referralCode: profile?.referral_code || 'GENERATE',
      totalReferrals: count || 0,
      totalEarned: totalEarned,
      currency: 'Coins'
    };
  }

  static async getHistory(userId: string) {
    // অ্যাডমিন প্যানেলের xp_rules থেকে ডায়নামিক ভ্যালু রিড করা
    const { data: configData, error: configError } = await supabaseAdmin
      .from('app_configs')
      .select('value')
      .eq('key', 'xp_rules')
      .single();

    let currentBonus = 200; // Default
    if (!configError && configData?.value) {
      const rules = configData.value as any;
      if (rules.referral_bonus) currentBonus = Number(rules.referral_bonus);
    }

    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, avatar_url, created_at, account_status')
      .eq('referred_by', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return (data || []).map((user: any) => ({
      user: {
        id: user.id,
        full_name: user.full_name || 'Unknown User',
        avatar_url: user.avatar_url,
        joined_at: user.created_at,
        status: user.account_status === 'active' ? 'active' : 'pending',
      },
      bonus_amount: currentBonus,
    }));
  }

  static async redeemCode(userId: string, code: string) {
    if (!code) throw new Error("Referral code is required");
    
    const { error } = await supabaseAdmin.rpc('apply_referral_code', {
      p_user_id: userId,
      p_referral_code: code.trim().toUpperCase()
    });

    if (error) {
      throw new Error(error.message || "Failed to apply referral code.");
    }

    return { success: true, message: "Referral applied successfully!" };
  }
}
