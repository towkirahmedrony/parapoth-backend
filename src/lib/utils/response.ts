import { Response } from 'express';

/**
 * Universal Response Utility
 * এটি অবজেক্ট স্টাইল: sendResponse(res, { statusCode: 200, ... }) 
 * এবং আর্গুমেন্ট স্টাইল: sendResponse(res, 200, true, '...', data) - উভয়ই সাপোর্ট করে।
 */
const sendResponse = (
  res: Response,
  arg2: any, // এটি হয় statusCode হবে অথবা পুরো Response Object হবে
  success?: boolean,
  message?: string,
  data: any = null
) => {
  // যদি ২য় প্যারামিটারটি একটি অবজেক্ট হয় (পুরনো কোডের জন্য)
  if (typeof arg2 === 'object' && arg2 !== null && 'statusCode' in arg2) {
    const { statusCode, success: s, message: m, data: d } = arg2;
    return res.status(statusCode || 500).json({
      success: s,
      message: m || (s ? 'Success' : 'Failed'),
      data: d,
    });
  }

  // যদি প্যারামিটারগুলো আলাদা আলাদাভাবে আসে (নতুন কোডের জন্য)
  return res.status(arg2 || 500).json({
    success: !!success,
    message: message || (success ? 'Operation successful' : 'Operation failed'),
    data,
  });
};

export default sendResponse;
