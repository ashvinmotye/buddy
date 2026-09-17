import {webcrypto, randomBytes} from 'node:crypto';

const keys = await webcrypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
const vapid = {
  publicKey: await webcrypto.subtle.exportKey('jwk',keys.publicKey),
  privateKey: await webcrypto.subtle.exportKey('jwk',keys.privateKey)
};
console.log('BUDDY_VAPID_KEYS (set as a single Edge Function secret; never put this in the website or Git):');
console.log(JSON.stringify(vapid));
console.log('\nBUDDY_CRON_SECRET (use the same value in Supabase Vault):');
console.log(randomBytes(32).toString('base64url'));
