import {createClient} from 'npm:@supabase/supabase-js@2.49.4';
import {ApplicationServer, importVapidKeys, exportApplicationServerKey, PushMessageError} from 'jsr:@negrel/webpush@0.5.0';
import {PHRASES, mauritiusClock, pickPhrase, shouldNotify} from './rules.mjs';

const origin = Deno.env.get('BUDDY_ORIGIN'); // Exact HTTPS origin of the hosted PWA.
const cronSecret = Deno.env.get('BUDDY_CRON_SECRET');
const adminKey = Deno.env.get('SUPABASE_SECRET_KEYS')
  ? JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')).default
  : Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const admin = createClient(Deno.env.get('SUPABASE_URL'), adminKey, {auth:{persistSession:false}});
const DEVICE_TABLE = 'buddy_reminder_devices';
const SEND_TABLE = 'buddy_reminder_sends';
let applicationServer;

function cors() {
  return {'Access-Control-Allow-Origin':origin, 'Access-Control-Allow-Headers':'authorization, content-type',
    'Access-Control-Allow-Methods':'GET, POST, OPTIONS', Vary:'Origin'};
}
function json(data, status = 200, browser = false) {
  return new Response(JSON.stringify(data), {status, headers:{'Content-Type':'application/json', ...(browser ? cors() : {})}});
}
function validEndpoint(endpoint) {
  if (typeof endpoint !== 'string' || endpoint.length > 2048) return false;
  try {
    const url = new URL(endpoint);
    const host = url.hostname;
    return url.protocol === 'https:' && !url.username && !url.password && !url.port &&
      (host === 'fcm.googleapis.com' || host.endsWith('.push.apple.com') ||
       host.endsWith('.push.services.mozilla.com') || host.endsWith('.notify.windows.com'));
  } catch { return false; }
}
function validSubscription(value) {
  return value && validEndpoint(value.endpoint) && value.keys &&
    typeof value.keys.auth === 'string' && /^[A-Za-z0-9_-]{20,40}$/.test(value.keys.auth) &&
    typeof value.keys.p256dh === 'string' && /^[A-Za-z0-9_-]{75,120}$/.test(value.keys.p256dh);
}
function validStatus(value) {
  return value && typeof value.monthKey === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value.monthKey) &&
    typeof value.hasActual === 'boolean';
}
async function body(req) {
  const text = await req.text();
  if (text.length > 6000) throw new Error('Request too large');
  return JSON.parse(text);
}
async function deviceId(req) {
  const token = req.headers.get('Authorization')?.replace(/^Bearer /, '');
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)));
  return [...digest].map(byte => byte.toString(16).padStart(2,'0')).join('');
}
async function pushServer() {
  if (!applicationServer) {
    const keys = await importVapidKeys(JSON.parse(Deno.env.get('BUDDY_VAPID_KEYS')));
    applicationServer = await ApplicationServer.new({contactInformation:origin, vapidKeys:keys});
  }
  return applicationServer;
}
function recordedForCurrentMonth(data) {
  return data.monthKey === mauritiusClock().monthKey && data.hasActual;
}
async function register(req, id) {
  const input = await body(req);
  if (!validStatus(input) || !validSubscription(input.subscription)) return json({error:'Invalid subscription or status'},400,true);
  const {error} = await admin.from(DEVICE_TABLE).upsert({
    id, subscription:{endpoint:input.subscription.endpoint,keys:{auth:input.subscription.keys.auth,p256dh:input.subscription.keys.p256dh}},
    enabled:true, month_key:mauritiusClock().monthKey, has_actual:recordedForCurrentMonth(input),
    updated_at:new Date().toISOString()
  }, {onConflict:'id'});
  if (error) throw error;
  return json({ok:true},200,true);
}
async function status(req, id) {
  const input = await body(req);
  if (!validStatus(input)) return json({error:'Invalid status'},400,true);
  const {data,error} = await admin.from(DEVICE_TABLE).update({
    month_key:mauritiusClock().monthKey, has_actual:recordedForCurrentMonth(input), updated_at:new Date().toISOString()
  }).eq('id',id).eq('enabled',true).select('id');
  if (error) throw error;
  return data?.length ? json({ok:true},200,true) : json({error:'Device not registered'},404,true);
}
async function disable(id) {
  const {error} = await admin.from(DEVICE_TABLE).update({enabled:false,subscription:null,updated_at:new Date().toISOString()}).eq('id',id);
  if (error) throw error;
  return json({ok:true},200,true);
}
async function dispatch() {
  const clock = mauritiusClock();
  if (clock.day !== 3 || ![10,13,16,19,22].includes(clock.hour)) return json({skipped:true});
  const {data:devices,error} = await admin.from(DEVICE_TABLE)
    .select('id,subscription,enabled,month_key,has_actual,last_phrase')
    .eq('enabled',true).not('subscription','is',null).limit(1000);
  if (error) throw error;
  let sent = 0, failed = 0;
  const server = await pushServer();
  for (const device of devices || []) {
    if (!shouldNotify(clock,device)) continue;
    // A unique row makes retries at the same slot safe, including an already recorded month at 10.
    const claim = {device_id:device.id,month_key:clock.monthKey,hour:clock.hour};
    const {error:claimError} = await admin.from(SEND_TABLE).insert(claim);
    if (claimError?.code === '23505') continue;
    if (claimError) {failed++; continue;}
    const phrase = pickPhrase(device.last_phrase);
    try {
      await server.subscribe(device.subscription).pushTextMessage(JSON.stringify({body:PHRASES[phrase]}),{ttl:3600});
      const {error:updateError} = await admin.from(DEVICE_TABLE).update({last_phrase:phrase}).eq('id',device.id);
      if (updateError) console.error('Could not save phrase selection');
      sent++;
    } catch (error) {
      failed++;
      if (error instanceof PushMessageError && [404,410].includes(error.response.status)) {
        await admin.from(DEVICE_TABLE).update({enabled:false,subscription:null}).eq('id',device.id);
      } else {
        // Release a failed claim so an operator can retry this slot before the next scheduled time.
        await admin.from(SEND_TABLE).delete().eq('device_id',device.id).eq('month_key',clock.monthKey).eq('hour',clock.hour);
      }
      console.error('Buddy push failed', error instanceof PushMessageError ? error.response.status : 'delivery error');
    }
  }
  return json({sent,failed});
}

Deno.serve(async req => {
  const route = new URL(req.url).pathname.split('/').pop();
  const isDispatch = route === 'dispatch';
  if (isDispatch) {
    if (req.method !== 'POST' || !cronSecret || req.headers.get('Authorization') !== `Bearer ${cronSecret}`) return json({error:'Unauthorized'},401);
    try { return await dispatch(); } catch (error) {console.error('Reminder dispatch failed',error); return json({error:'Dispatch failed'},500);}
  }
  if (!origin || req.headers.get('Origin') !== origin) return json({error:'Origin not allowed'},403);
  if (req.method === 'OPTIONS') return new Response(null,{status:204,headers:cors()});
  try {
    if (route === 'public-key' && req.method === 'GET') {
      const publicKey = await exportApplicationServerKey((await pushServer()).vapidKeys);
      return json({publicKey},200,true);
    }
    if (req.method !== 'POST') return json({error:'Unknown route'},404,true);
    const id = await deviceId(req);
    if (!id) return json({error:'Invalid device token'},401,true);
    if (route === 'register') return await register(req,id);
    if (route === 'status') return await status(req,id);
    if (route === 'disable') return await disable(id);
    return json({error:'Unknown route'},404,true);
  } catch (error) {
    console.error('Buddy reminder request failed',error);
    return json({error:'Request failed'},500,true);
  }
});
