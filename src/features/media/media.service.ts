import { v2 as cloudinary } from 'cloudinary';
import { supabase } from '../../config/supabase';

// Cloudinary Configuration
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export const MediaService = {
  // ১. আপলোডের জন্য সিগনেচার তৈরি
  generateUploadSignature: () => {
    const timestamp = Math.round(new Date().getTime() / 1000);
    const paramsToSign = { timestamp, folder: 'parapoth_media' }; 
    const signature = cloudinary.utils.api_sign_request(
      paramsToSign,
      process.env.CLOUDINARY_API_SECRET as string
    );

    return { timestamp, signature, folder: 'parapoth_media', apiKey: process.env.CLOUDINARY_API_KEY };
  },

  // ২. আপলোডের পর ডাটাবেজে রেকর্ড সেভ করা (Tags ও Metadata সহ)
  saveMediaRecord: async (userId: string, mediaData: any) => {
    const { data, error } = await supabase
      .from('media_library')
      .insert({
        uploader_id: userId,
        file_name: mediaData.file_name,
        file_url: mediaData.file_url,
        file_type: mediaData.file_type,
        cloud_provider_id: mediaData.public_id,
        metadata: mediaData.metadata || {},
        tags: mediaData.tags || [],
        usage_count: 0,
        is_active: true
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  },

  // ৩. গ্যালারির জন্য সব একটিভ মিডিয়া আনা (Sorting লজিক সহ)
  getAssets: async (typeFilter: string, search: string, sortBy: string = 'newest') => {
    let query = supabase
      .from('media_library')
      .select('*')
      .is('deleted_at', null);

    if (typeFilter && typeFilter !== 'all') {
      query = query.eq('file_type', typeFilter);
    }
    
    if (search) {
      query = query.ilike('file_name', `%${search}%`);
    }

    // Apply Sorting logic
    if (sortBy === 'oldest') {
      query = query.order('created_at', { ascending: true });
    } else if (sortBy === 'usage_high') {
      query = query.order('usage_count', { ascending: false }).order('created_at', { ascending: false });
    } else {
      // Default: newest
      query = query.order('created_at', { ascending: false });
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data;
  },

  // ৪. ট্রাশ বিনের মিডিয়া আনা
  getTrashAssets: async () => {
    const { data, error } = await supabase
      .from('media_library')
      .select('*')
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false });

    if (error) throw new Error(error.message);
    return data;
  },

  // ৫. মিডিয়া সফট ডিলিট করা (Move to Trash)
  softDeleteAssets: async (assetIds: string[]) => {
    const { error } = await supabase
      .from('media_library')
      .update({ deleted_at: new Date().toISOString() })
      .in('id', assetIds);

    if (error) throw new Error(error.message);
    return { success: true, count: assetIds.length };
  },

  // ৬. ট্রাশ থেকে রিস্টোর করা
  restoreAssets: async (assetIds: string[]) => {
    const { error } = await supabase
      .from('media_library')
      .update({ deleted_at: null })
      .in('id', assetIds);

    if (error) throw new Error(error.message);
    return { success: true, count: assetIds.length };
  },

  // ৭. অব্যবহৃত মিডিয়া স্ক্যান করা
  getUnusedMedia: async () => {
    const { data, error } = await supabase
      .from('media_library')
      .select('*')
      .is('deleted_at', null)
      .or('usage_count.eq.0,usage_count.is.null');

    if (error) throw new Error(error.message);

    return data.map(asset => ({
      asset_id: asset.id,
      file_name: asset.file_name,
      file_url: asset.file_url,
      size_mb: asset.metadata && typeof asset.metadata === 'object' && 'size_mb' in asset.metadata 
        ? (asset.metadata as any).size_mb 
        : 0 
    }));
  },

  // ৮. পার্মানেন্ট ডিলিট করা (Cloudinary + Database)
  forceDeleteAssets: async (assetIds: string[]) => {
    const { data: assets, error: fetchError } = await supabase
      .from('media_library')
      .select('id, cloud_provider_id')
      .in('id', assetIds);

    if (fetchError) throw new Error(fetchError.message);
    
    const publicIds = assets?.map(a => a.cloud_provider_id).filter(Boolean) as string[];

    if (publicIds.length > 0) {
      await cloudinary.api.delete_resources(publicIds);
    }

    const { error: deleteError } = await supabase
      .from('media_library')
      .delete()
      .in('id', assetIds);

    if (deleteError) throw new Error(deleteError.message);
    return { success: true, deletedCount: assetIds.length };
  },

  // ৯. মিডিয়া রেকর্ড আপডেট করা (Edit Details)
  updateMediaRecord: async (assetId: string, updateData: { file_name?: string, tags?: string[] }) => {
    const { data, error } = await supabase
      .from('media_library')
      .update(updateData)
      .eq('id', assetId)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  }
};
