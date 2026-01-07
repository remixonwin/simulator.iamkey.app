import { ethers } from 'ethers';
import { Alchemy, Network } from 'alchemy-sdk';

type NotificationPreferences = {
  account_alerts: boolean;
  guardian_updates: boolean;
  marketplace_updates: boolean;
  tips_and_product: boolean;
};

function defaultNotificationPreferences(): NotificationPreferences {
  return {
    account_alerts: true,
    guardian_updates: true,
    marketplace_updates: true,
    tips_and_product: false,
  };
}

function base64url(arrayBuffer: ArrayBuffer | Uint8Array) {
  const bytes = arrayBuffer instanceof Uint8Array ? arrayBuffer : new Uint8Array(arrayBuffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function getFCMAccessToken(serviceAccount: any) {
  const header = { alg: 'RS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };

  const encodedHeader = base64url(new TextEncoder().encode(JSON.stringify(header)));
  const encodedPayload = base64url(new TextEncoder().encode(JSON.stringify(payload)));
  const unsignedToken = `${encodedHeader}.${encodedPayload}`;

  const pemHeader = '-----BEGIN PRIVATE KEY-----';
  const pemFooter = '-----END PRIVATE KEY-----';
  const pemContents = serviceAccount.private_key
    .replace(pemHeader, '')
    .replace(pemFooter, '')
    .replace(/\\n/g, '')
    .replace(/\n/g, '')
    .replace(/\s/g, '');

  const binaryDerString = atob(pemContents);
  const binaryDer = new Uint8Array(binaryDerString.length);
  for (let i = 0; i < binaryDerString.length; i++) {
    binaryDer[i] = binaryDerString.charCodeAt(i);
  }

  const privateKey = await crypto.subtle.importKey(
    'pkcs8',
    binaryDer.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, new TextEncoder().encode(unsignedToken));
  const signedToken = `${unsignedToken}.${base64url(signature)}`;

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${signedToken}`,
  });

  const data: any = await response.json();
  if (data.error) throw new Error(`OAuth error: ${data.error_description || data.error}`);
  return data.access_token;
}

async function getNotificationPreferences(c: any, lookupHash: string) {
  const prefsStr = await c.env.IAMKEY_KV.get(`notification_prefs:${lookupHash}`);
  if (!prefsStr) return defaultNotificationPreferences();
  try {
    return { ...defaultNotificationPreferences(), ...JSON.parse(prefsStr) };
  } catch {
    return defaultNotificationPreferences();
  }
}

function shouldSendNotification(type: string, prefs: NotificationPreferences) {
  if (type.startsWith('guardian')) return prefs.guardian_updates;
  if (type.startsWith('marketplace') || type.startsWith('order') || type.startsWith('escrow') || type.startsWith('trade')) {
    return prefs.marketplace_updates;
  }
  if (type.startsWith('tips')) return prefs.tips_and_product;
  return prefs.account_alerts;
}

async function storeNotification(c: any, lookupHash: string, payload: { title: string; body: string; type: string; data?: Record<string, string> }) {
  const key = `notifications:${lookupHash}`;
  let existing: any[] = [];
  const existingStr = await c.env.IAMKEY_KV.get(key);
  if (existingStr) {
    try {
      existing = JSON.parse(existingStr);
    } catch {
      existing = [];
    }
  }

  const entry = {
    id: crypto.randomUUID(),
    title: payload.title,
    body: payload.body,
    type: payload.type,
    data: payload.data || {},
    created_at: new Date().toISOString(),
    is_read: false,
  };

  const updated = [entry, ...existing].slice(0, 50);
  await c.env.IAMKEY_KV.put(key, JSON.stringify(updated));
  return entry;
}

async function sendFCMNotification(c: any, lookupHash: string, title: string, body: string, data?: Record<string, string>) {
  try {
    const notificationType = data?.type || 'account_alert';
    const prefs = await getNotificationPreferences(c, lookupHash);
    if (!shouldSendNotification(notificationType, prefs)) {
      console.log(`Notification suppressed for ${lookupHash}: type=${notificationType}, prefs=${JSON.stringify(prefs)}`);
      return;
    }

    await storeNotification(c, lookupHash, { title, body, type: notificationType, data: data || {} });

    const fcmTokensStr = await c.env.IAMKEY_KV.get(`fcm:${lookupHash}`);
    if (!fcmTokensStr) {
      console.log(`No FCM tokens found for identity: ${lookupHash}`);
      return;
    }

    let fcmTokens: string[] = [];
    try {
      const parsed = JSON.parse(fcmTokensStr);
      fcmTokens = Array.isArray(parsed) ? parsed : [parsed];
    } catch (e) {
      fcmTokens = [fcmTokensStr];
    }

    // Check for FCM service account
    if (!c.env.FCM_SERVICE_ACCOUNT) {
      console.error('FCM_SERVICE_ACCOUNT environment variable not configured');
      return;
    }

    const saJson = JSON.parse(c.env.FCM_SERVICE_ACCOUNT);
    
    if (!saJson.project_id || !saJson.client_email || !saJson.private_key) {
      console.error('FCM_SERVICE_ACCOUNT missing required fields (project_id, client_email, private_key)');
      return;
    }

    const accessToken = await getFCMAccessToken(saJson);

    for (const token of fcmTokens) {
      const message = {
        message: {
          token: token,
          notification: { title, body },
          data: data || {},
        },
      };

      const response = await fetch(`https://fcm.googleapis.com/v1/projects/${saJson.project_id}/messages:send`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(message),
      });

      const result: any = await response.json();
      if (!response.ok) {
        console.error(`FCM error for token ${token.substring(0, 10)}...:`, result);
      } else {
        console.log(`FCM success for token ${token.substring(0, 10)}...: messageId=${result.name}`);
      }
    }
  } catch (e) {
    console.error('Failed to send FCM notification:', e);
  }
}

export { sendFCMNotification, storeNotification, getNotificationPreferences, shouldSendNotification, defaultNotificationPreferences };
