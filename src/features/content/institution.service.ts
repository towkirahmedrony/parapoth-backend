import { supabase } from '../../config/supabase';
import { InstitutionPayload } from './content.types';

const COMMON_BOARD_NAMES: Record<string, string> = {
  'dhaka': 'ঢাকা বোর্ড', 'dhaka board': 'ঢাকা বোর্ড', 'd.b.': 'ঢাকা বোর্ড',
  'rajshahi': 'রাজশাহী বোর্ড', 'rajshahi board': 'রাজশাহী বোর্ড', 'r.b.': 'রাজশাহী বোর্ড',
  'cumilla': 'কুমিল্লা বোর্ড', 'comilla': 'কুমিল্লা বোর্ড', 'cumilla board': 'কুমিল্লা বোর্ড', 'c.b.': 'কুমিল্লা বোর্ড',
  'jashore': 'যশোর বোর্ড', 'jessore': 'যশোর বোর্ড', 'jashore board': 'যশোর বোর্ড', 'j.b.': 'যশোর বোর্ড',
  'chattogram': 'চট্টগ্রাম বোর্ড', 'chittagong': 'চট্টগ্রাম বোর্ড', 'chattogram board': 'চট্টগ্রাম বোর্ড', 'ctg. b.': 'চট্টগ্রাম বোর্ড',
  'barishal': 'বরিশাল বোর্ড', 'barisal': 'বরিশাল বোর্ড', 'barishal board': 'বরিশাল বোর্ড', 'b.b.': 'বরিশাল বোর্ড',
  'sylhet': 'সিলেট বোর্ড', 'sylhet board': 'সিলেট বোর্ড', 's.b.': 'সিলেট বোর্ড',
  'dinajpur': 'দিনাজপুর বোর্ড', 'dinajpur board': 'দিনাজপুর বোর্ড', 'din. b.': 'দিনাজপুর বোর্ড',
  'mymensingh': 'ময়মনসিংহ বোর্ড', 'mymensingh board': 'ময়মনসিংহ বোর্ড', 'mym. b.': 'ময়মনসিংহ বোর্ড',
  'madrasah': 'মাদ্রাসা বোর্ড', 'madrasah board': 'মাদ্রাসা বোর্ড', 'mad. b.': 'মাদ্রাসা বোর্ড',
  'technical': 'কারিগরি বোর্ড', 'technical board': 'কারিগরি বোর্ড', 'tec. b.': 'কারিগরি বোর্ড', 'bteb': 'কারিগরি বোর্ড'
};

export const getInstitutions = async () => {
  const { data, error } = await supabase
    .from('institutions' as any)
    .select('*')
    .order('name_bn', { ascending: true });

  if (error) throw new Error(error.message);
  return data;
};

export const createInstitution = async (payload: Partial<InstitutionPayload>) => {
  const { data, error } = await supabase
    .from('institutions' as any)
    .insert(payload)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
};

export const updateInstitution = async (id: string, payload: Partial<InstitutionPayload>) => {
  const { data, error } = await supabase
    .from('institutions' as any)
    .update(payload)
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
};

export const deleteInstitution = async (id: string) => {
  const { error } = await supabase
    .from('institutions' as any)
    .delete()
    .eq('id', id);

  if (error) throw new Error(error.message);
  return true;
};

export const autoCreateMissingInstitutions = async (questionsData: Record<string, unknown>[]) => {
  const newInstitutionsMap = new Map<string, any>();

  const extractRefs = (dataList: any[]) => {
    for (const item of dataList) {
      if (item.type === 'Comprehension' && Array.isArray(item.questions)) {
        extractRefs(item.questions);
      } else if (Array.isArray(item.exam_references)) {
        for (const ref of item.exam_references) {
          const kind = ref.source_kind;
          const rawName = ref.institution_name || ref.board || ref.name;

          if (kind && rawName && typeof rawName === 'string' && ['board', 'college', 'admission', 'school', 'university'].includes(kind)) {
            const nameStr = rawName.trim();
            const key = `${kind}_${nameStr.toLowerCase()}`;

            if (!newInstitutionsMap.has(key)) {
              const isBengali = /[\u0980-\u09FF]/.test(nameStr);
              let resolvedBnName = isBengali ? nameStr : (ref.name_bn || ref.institution_name_bn || ref.board_bn);
              if (!resolvedBnName && !isBengali && kind === 'board') {
                 resolvedBnName = COMMON_BOARD_NAMES[nameStr.toLowerCase()];
              }
              if (!resolvedBnName) resolvedBnName = nameStr; 

              let resolvedEnName = !isBengali ? nameStr : (ref.name_en || ref.institution_name_en || ref.board_en || null);
              
              let generatedCode = nameStr.toUpperCase().replace(/[^A-Z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
              if (!generatedCode || isBengali) {
                generatedCode = `${kind.toUpperCase()}_${Date.now().toString().slice(-6)}`;
              }

              newInstitutionsMap.set(key, {
                name_bn: resolvedBnName,
                name_en: resolvedEnName,
                code: generatedCode,
                aliases: [nameStr],
                type: kind,
              });
            }
          }
        }
      }
    }
  };

  extractRefs(questionsData);

  if (newInstitutionsMap.size === 0) return;

  const { data: existing } = await supabase
    .from('institutions' as any)
    .select('name_bn, short_name, name_en, code, aliases');

  const existingKeys = new Set(
    existing?.flatMap((item: any) => [
      item.name_bn?.toLowerCase(),
      item.name_en?.toLowerCase(),
      item.short_name?.toLowerCase(),
      item.code?.toLowerCase(),
      ...(item.aliases || []).map((a: string) => a.toLowerCase())
    ]).filter(Boolean) || []
  );

  const toInsert = Array.from(newInstitutionsMap.values()).filter(
    (institution) => {
      const nameBnLow = institution.name_bn?.toLowerCase();
      const nameEnLow = institution.name_en?.toLowerCase();
      const codeLow = institution.code?.toLowerCase();
      
      return !(
        (nameBnLow && existingKeys.has(nameBnLow)) ||
        (nameEnLow && existingKeys.has(nameEnLow)) ||
        (codeLow && existingKeys.has(codeLow))
      );
    }
  );

  if (toInsert.length > 0) {
    await supabase.from('institutions' as any).insert(toInsert);
  }
};
