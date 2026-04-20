import { supabaseAdmin } from '../../config/supabaseAdmin';

export const economyService = {
  getUserBalance: async (userId: string) => {
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('coin_balance')
      .eq('id', userId)
      .single();

    if (error) throw new Error(error.message);
    return data;
  },

  getMarketplaceItems: async () => {
    // Note: 'marketplace_items' is cast to 'any' because it's not yet in database.ts types
    const { data, error } = await supabaseAdmin
      .from('marketplace_items' as any)
      .select('*')
      .eq('is_active', true)
      .order('price_coins', { ascending: true });

    if (error) throw new Error(error.message);
    return data;
  },

  purchaseItem: async (userId: string, itemId: string) => {
    // ১. আইটেমের তথ্য ফেচ করা
    const { data: item, error: itemError } = await supabaseAdmin
      .from('marketplace_items' as any)
      .select('*')
      .eq('id', itemId)
      .single();

    if (itemError || !item) {
      throw new Error('Item not found or inactive');
    }

    // ২. ইউজারের বর্তমান ব্যালেন্স চেক করা
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('coin_balance')
      .eq('id', userId)
      .single();

    if (profileError || !profile) {
      throw new Error('User profile not found');
    }

    const currentBalance = profile.coin_balance || 0;
    if (currentBalance < item.price_coins) {
      throw new Error('Insufficient coin balance');
    }

    // ৩. ব্যালেন্স কাটা
    const newBalance = currentBalance - item.price_coins;
    const { error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({ coin_balance: newBalance })
      .eq('id', userId);

    if (updateError) throw new Error('Failed to deduct coins');

    // ৪. ট্রানজেকশন রেকর্ড রাখা
    const { error: txError } = await supabaseAdmin
      .from('coin_transactions')
      .insert({
        user_id: userId,
        amount: -item.price_coins, // খরচ তাই মাইনাস
        transaction_type: 'purchase',
        description: `Purchased marketplace item: ${item.title}`,
        reference_id: item.id
      });

    if (txError) {
      console.error('Transaction log failed:', txError.message);
      // ব্যালেন্স কাটা হয়ে গেলে ট্রানজেকশন ফেইল করলেও ইউজারকে এরর দেখানো ঠিক হবে না, তাই শুধু লগ করলাম
    }

    // ৫. (ঐচ্ছিক) এখানে ইউজারের একাউন্টে প্রিমিয়াম ফিচার আনলক করার লজিক যোগ করতে পারেন
    // যেমন: item.item_type === 'premium_feature' হলে profiles.subscription_status আপডেট করা

    return { 
      success: true, 
      message: `Successfully purchased ${item.title}`, 
      new_balance: newBalance 
    };
  }
};
