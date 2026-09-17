import assert from 'node:assert/strict';
import {PHRASES, mauritiusClock, pickPhrase, shouldNotify} from '../supabase/functions/buddy-reminders/rules.mjs';

assert.equal(PHRASES.length,10);
for (const [utc,hour] of [[6,10],[9,13],[12,16],[15,19],[18,22]]) {
  const clock = mauritiusClock(new Date(`2026-10-03T${String(utc).padStart(2,'0')}:00:00Z`));
  assert.deepEqual(clock,{monthKey:'2026-10',day:3,hour});
  const device = {enabled:true,subscription:{endpoint:'push'},month_key:'2026-10',has_actual:true};
  assert.equal(shouldNotify(clock,device),hour===10,`${hour}:00: only the first push is unconditional`);
  assert.equal(shouldNotify(clock,{...device,has_actual:false}),true,`${hour}:00: empty month triggers`);
  assert.equal(shouldNotify(clock,{...device,month_key:'2026-09'}),true,'old status is not confirmation');
}
const off={enabled:false,subscription:{},month_key:'2026-10',has_actual:false};
assert.equal(shouldNotify({day:3,hour:10,monthKey:'2026-10'},off),false);
assert.equal(shouldNotify({day:2,hour:10,monthKey:'2026-10'},{...off,enabled:true}),false);
assert.equal(shouldNotify({day:3,hour:11,monthKey:'2026-10'},{...off,enabled:true}),false);
assert.equal(mauritiusClock(new Date('2026-10-02T20:00:00Z')).day,3,'Mauritius date starts at UTC+4');
for (let previous=0;previous<PHRASES.length;previous++) {
  for (const random of [0,0.1,0.5,0.9999]) {
    const next=pickPhrase(previous,()=>random);
    assert.ok(next>=0 && next<PHRASES.length && next!==previous);
  }
}
console.log('PASS: five local slots, unconditional first push, confirmed-month suppression, and phrase selection');
