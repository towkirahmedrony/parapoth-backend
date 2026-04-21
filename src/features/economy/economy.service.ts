import { supabaseAdmin } from '../../config/supabaseAdmin';

export const economyService = {
  // === ইউজার এন্ডপয়েন্ট ===
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
    const { data, error } = await supabaseAdmin
      .from('marketplace_items' as any)
      .select('*')
      .eq('is_active', true)
      .order('price_coins', { ascending: true });

    if (error) throw new Error(error.message);
    return data;
  },

  purchaseItem: async (userId: string, itemId: string) => {
    const { data: item, error: itemError } = await supabaseAdmin
      .from('marketplace_items' as any)
      .select('*')
      .eq('id', itemId)
      .single();

    if (itemError || !item) throw new Error('Item not found or inactive');

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('coin_balance')
      .eq('id', userId)
      .single();

    if (profileError || !profile) throw new Error('User profile not found');

    const currentBalance = profile.coin_balance || 0;
    if (currentBalance < item.price_coins) throw new Error('Insufficient coin balance');

    const newBalance = currentBalance - item.price_coins;
    const { error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({ coin_balance: newBalance })
      .eq('id', userId);

    if (updateError) throw new Error('Failed to deduct coins');

    const { error: txError } = await supabaseAdmin
      .from('coin_transactions')
      .insert({
        user_id: userId,
        amount: -item.price_coins,
        transaction_type: 'purchase',
        description: `Purchased marketplace item: ${item.title}`,
        reference_id: item.id
      });

    if (txError) console.error('Transaction log failed:', txError.message);

    return { success: true, message: `Successfully purchased ${item.title}`, new_balance: newBalance };
  },

  // === এডমিন এন্ডপয়েন্ট (CRUD) ===
  getAdminMarketplaceItems: async () => {
    // এডমিন প্যানেলের জন্য ইনঅ্যাক্টিভ আইটেমসহ সব আনা হবে
    const { data, error } = await supabaseAdmin
      .from('marketplace_items' as any)
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    return data;
  },

  createMarketplaceItem: async (itemData: any) => {
    const { data, error } = await supabaseAdmin
      .from('marketplace_items' as any)
      .insert([itemData])
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  },

  updateMarketplaceItem: async (id: string, updateData: any) => {
    const { data, error } = await supabaseAdmin
      .from('marketplace_items' as any)
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  },

  deleteMarketplaceItem: async (id: string) => {
    const { error } = await supabaseAdmin
      .from('marketplace_items' as any)
      .delete()
      .eq('id', id);

    if (error) throw new Error(error.message);
    return { success: true, message: 'Item deleted successfully' };
  }
};
