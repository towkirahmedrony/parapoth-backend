import { supabase } from '../../config/supabase';
import { COMMON_BOARD_NAMES, COMMON_COLLEGE_NAMES, COMMON_COLLEGE_CODES } from './institution.constants';

// Added local type definition
export interface InstitutionPayload {
  [key: string]: any;
}

export const getInstitutions = async () => {
  const { data, error } = await supabase
    .from('institutions')
    .select('*')
    .order('name_bn', { ascending: true });

  if (error) throw new Error(error.message);
  return data;
};

export const createInstitution = async (payload: Partial<InstitutionPayload>) => {
  const { data, error } = await supabase
    .from('institutions')
    .insert(payload)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
};

export const updateInstitution = async (id: string, payload: Partial<InstitutionPayload>) => {
  const { data, error } = await supabase
    .from('institutions')
    .update(payload)
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
};

export const deleteInstitution = async (id: string) => {
  const { error } = await supabase
    .from('institutions')
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
              
              if (!resolvedBnName && !isBengali) {
                if (kind === 'board') {
                  resolvedBnName = COMMON_BOARD_NAMES[nameStr.toLowerCase()];
                } else if (kind === 'college') {
                  resolvedBnName = COMMON_COLLEGE_NAMES[nameStr.toLowerCase()];
                }
              }
              
              if (!resolvedBnName) resolvedBnName = nameStr; 

              let resolvedEnName = !isBengali ? nameStr : (ref.name_en || ref.institution_name_en || ref.board_en || null);
              
              let generatedCode = COMMON_COLLEGE_CODES[resolvedBnName];
              
              if (!generatedCode) {
                generatedCode = nameStr.toUpperCase().replace(/[^A-Z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
                if (!generatedCode || isBengali) {
                  generatedCode = `${kind.toUpperCase()}_${Date.now().toString().slice(-6)}`;
                }
              }

              newInstitutionsMap.set(key, {
                name_bn: resolvedBnName,
                name_en: resolvedEnName,
                code: generatedCode,
                eiin: COMMON_COLLEGE_CODES[resolvedBnName] || null, // Optional: if you have an EIIN column
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
    .from('institutions')
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
    await supabase.from('institutions').insert(toInsert);
  }
};
