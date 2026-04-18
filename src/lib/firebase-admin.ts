import * as admin from 'firebase-admin';

function formatPrivateKey(key: string) {
  if (!key) return undefined;
  return key.replace(/\\n/g, '\n');
}

export function getAdminApp() {
  if (!admin.apps.length) {
    // Prevent initialization error if keys are temporarily missing during build
    if (process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
        admin.initializeApp({
        credential: admin.credential.cert({
            projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: formatPrivateKey(process.env.FIREBASE_PRIVATE_KEY),
        }),
        });
    } else {
        // Fallback for build time if undefined
         admin.initializeApp();
    }
  }
  return admin.app();
}

export const adminDb = getAdminApp().firestore();
