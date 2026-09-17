import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import {runInNewContext} from 'node:vm';

const storage = new Map();
const calls = [];
let onToggle;
let currentSubscription;
const help = {textContent:'On the 3rd, Buddy checks in at 10:00.'};
const toggle = {checked:false,disabled:false,addEventListener(type,handler){if(type==='change') onToggle=handler;}};
const registration = {pushManager:{
  async getSubscription(){return currentSubscription},
  async subscribe(){
    calls.push('subscribe');
    currentSubscription = {toJSON:()=>({endpoint:'https://web.push.apple.com/example',keys:{auth:'a'.repeat(22),p256dh:'b'.repeat(87)}}),
      async unsubscribe(){calls.push('unsubscribe');currentSubscription=null;return true}};
    return currentSubscription;
  }
}};
const notification = {permission:'default',requestPermission(){calls.push('permission');this.permission='granted';return Promise.resolve('granted')}};
const context={
  window:{BUDDY_REMINDER_URL:'https://example.supabase.co/functions/v1/buddy-reminders',PushManager(){},Notification:notification,addEventListener(){}},
  Notification:notification,
  navigator:{serviceWorker:{register:async()=>registration,getRegistration:async()=>registration}},
  location:{protocol:'https:',hostname:'buddy.example'},
  document:{getElementById:id=>id==='reminder-toggle'?toggle:help,addEventListener(){}},
  localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},
  crypto:webcrypto,btoa,atob,Uint8Array,fetch:async(url,options={})=>{
    const route=url.split('/').pop();calls.push(route);
    if (route==='register') {
      const data=JSON.parse(options.body);
      assert.deepEqual(Object.keys(data).sort(),['hasActual','monthKey','subscription']);
      assert.equal(data.hasActual,false);
      assert.equal(data.monthKey,'2026-09');
    }
    return {ok:true,json:async()=>route==='public-key'?{publicKey:'abc'}:{ok:true}};
  }
};
runInNewContext(readFileSync(new URL('../reminders.js',import.meta.url),'utf8'),context);
context.window.BuddyReminders.init(()=>({monthKey:'2026-09',hasActual:false}));
assert.equal(toggle.disabled,false);
toggle.checked=true;onToggle();
await new Promise(resolve=>setTimeout(resolve,15));
assert.equal(calls[0],'permission','permission must be requested synchronously from the tap');
assert.equal(storage.get('buddy-reminders-enabled'),'true');
assert.ok(calls.includes('register'));
toggle.checked=false;onToggle();
await new Promise(resolve=>setTimeout(resolve,15));
assert.equal(storage.has('buddy-reminders-enabled'),false);
assert.ok(calls.includes('unsubscribe'));
assert.ok(calls.includes('disable'));
console.log('PASS: one-tap enable, status-only registration, and unsubscribe on disable');
