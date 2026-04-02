export const extractTextFromJson = (jsonObj: any): string => {
  if (!jsonObj) return '';
  if (typeof jsonObj === 'string') return jsonObj;
  
  try {
    if (jsonObj.text) return String(jsonObj.text);
    if (jsonObj.question) return String(jsonObj.question); // প্রশ্নের বডির জন্য বাড়তি সাপোর্ট
    return JSON.stringify(jsonObj);
  } catch (error) {
    return '';
  }
};
