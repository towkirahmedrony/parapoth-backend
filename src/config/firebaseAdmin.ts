import * as admin from 'firebase-admin';
import dotenv from 'dotenv';

dotenv.config();

// \n string কে আসল new line এ কনভার্ট করা হচ্ছে
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: privateKey,
    }),
  });
}

export const messaging = admin.messaging();
