const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');
const source = ['lunar-data','core','extract'].map(n=>readFileSync(join(__dirname,'../web',n+'.js'),'utf8')).join('\n');
const { C, chats } = vm.runInThisContext('(function(){'+source+';return {C:PostalCore,chats:ChatImport};})()');
const candidate = (t,name='')=>chats.candidates(chats.read(t),name);
const b = (m,d,calendar='solar',leap=false)=>({calendar,month:m,day:d,leap});
const person = (id,name,birthday)=>({id,name,birthday,alias:'',relation:'',interests:'',wish:''});

test('first-person dates, nickname, relationship, hobby and wish',()=>{
  const [p]=candidate('小禾：你可以叫我阿禾。\n小禾：我的生日是5月18日。我很喜欢骑行。\n小禾：我们是大学同学，我今年想骑完环湖线。');
  assert.deepEqual(p.choices,[b(5,18)]); assert.equal(p.alias,'阿禾'); assert.equal(p.wish,'骑完环湖线');
  assert.equal(p.interests,'骑行'); assert.equal(p.relation,'大学同学');
});
test('never attribute third parties, questions, quoted dates and negations to a friend',()=>{
  for(const t of ['我妈妈的生日是5月1日','你生日是5月1日吗？','我的生日不是5月1日','他说：“我的生日是5月1日”','我可能5月1日过生日','小王生日是5月1号']) {
    assert.equal(candidate('小禾：'+t)[0].choices.length,0,t);
  }
});
test('outgoing messages ignored, distinct speakers and conflict evidence retained',()=>{
  const rows=candidate('我：我生日是1月3号\n自己账号：我生日是6月8号\n小禾：我生日是4月3号。\n小禾：我的生日是4月2日。\n阿七：周末见。','自己账号');
  assert.equal(rows.length,2); assert.equal(rows[0].choices.length,2); assert.equal(rows[1].choices.length,0);
});
test('relative dates use source timestamp with leap, month and year rollover',()=>{
  assert.deepEqual(candidate('2024-02-28 08:10 小禾：明天是我的生日')[0].choices,[b(2,29)]);
  assert.deepEqual(candidate('2026-01-01 08:10 小禾：昨天是我生日')[0].choices,[b(12,31)]);
  assert.deepEqual(candidate('小禾：明天是我的生日')[0].choices,[]);
  assert.deepEqual(candidate('小禾：我的生日是2月30日')[0].choices,[]);
});
test('multi-line QQ export, bracketed timestamps and sender-first transcripts',()=>{
  const qq='2025-06-09 09:10:00 小禾(12000345)\n今天是我生日\n2025-06-10 10:30:00 小禾(12000345)\n我喜欢摄影';
  assert.deepEqual(candidate(qq)[0].choices,[b(6,9)]);
  assert.equal(candidate(qq)[0].interests,'摄影');
  assert.deepEqual(candidate('[2025/12/30 09:00] 小禾: 我生日是12.30')[0].choices,[b(12,30)]);
  assert.deepEqual(candidate('小禾 2025-11-25 18:00\n今天是我的生日')[0].choices,[b(11,25)]);
  assert.deepEqual(candidate('2025-11-25 18:00\n小禾：今天是我的生日')[0].choices,[b(11,25)]);
});
test('structured sender ids survive nickname change and separate namesakes',()=>{
  const records=[{senderName:'小禾',senderId:'100',text:'我的生日是1月2日'}, {senderName:'小禾',senderId:'200',text:'我的生日是10月20日'},
    {sender:'我',isSend:1,content:'我生日是3月31日'}];
  const p=candidate(JSON.stringify({messages:records}));
  assert.equal(p.length,2); assert.notEqual(p[0].id,p[1].id);
  const next=candidate(JSON.stringify([{...records[0],senderName:'阿禾'}]));
  assert.ok(p.some(person=>person.id===next[0].id));
});
test('CSV quoting, TSV and Unicode text',()=>{
  assert.equal(candidate('时间,发送者,内容\n2024-01-01,安安,"我的生日是4月3日，我喜欢玩飞盘。"')[0].interests,'玩飞盘');
  assert.deepEqual(candidate('sender\ttext\n安安\t我生日是6月8号')[0].choices,[b(6,8)]);
});
test('birthday answers and outgoing wishes are only linked in individual conversations',()=>{
  assert.deepEqual(candidate('我：你生日是几月几号？\n小禾：5月12号')[0].choices,[b(5,12)]);
  const single=candidate('小禾：收到啦\n2024-11-25 10:00 我：祝你生日快乐！');
  assert.deepEqual(single[0].choices,[b(11,25)]); assert.match(single[0].evidence[0],/推测/);
  const group=candidate('2024-11-25 10:00 我：祝你生日快乐！\n小禾：谢谢\n阿柏：周末见');
  assert.ok(group.every(p=>!p.choices.length));
});
test('Gregorian leap days skip non-leap years and equal dates count as today',()=>{
  assert.equal(C.iso(C.next(b(2,29),C.days(2025,1,1))),'2028-02-29');
  assert.equal(C.next(b(1,1),C.days(2026,1,1)),C.days(2026,1,1));
});
test('lunar new year, mid-autumn, leap month and lunar days in next Gregorian year',()=>{
  assert.equal(C.iso(C.occurrence(b(1,1,'lunar'),2024)),'2024-02-10');
  assert.equal(C.iso(C.occurrence(b(8,15,'lunar'),2024)),'2024-09-17');
  assert.equal(C.iso(C.occurrence(b(6,1,'lunar',true),2025)),'2025-07-25');
  assert.equal(C.occurrence(b(6,1,'lunar',true),2024),null);
  assert.equal(C.iso(C.next(b(12,8,'lunar'),C.days(2026,1,1))),'2026-01-26');
  assert.deepEqual(candidate('小禾：我生日是农历八月十五')[0].choices,[b(8,15,'lunar')]);
  assert.deepEqual(candidate('小禾：我生日是闰六月初一')[0].choices,[b(6,1,'lunar',true)]);
});
test('strict whitelist pack, invalid dates, duplicate ids and future versions',()=>{
  const p=person('p-1','小禾',b(6,9)); p.evidence=['私密的原句']; p.source='private';
  const pack=C.makePack([p]); assert.equal(JSON.stringify(pack).includes('private'),false);
  assert.equal(C.validBirthday(b(1,367)),false);
  assert.deepEqual(C.readPack(JSON.stringify(pack)),[C.profile(p)]);
  for(const data of [{...pack,version:2},{...pack,people:[p,p]}, {...pack,people:[{...p,birthday:b(2,31)}]}, {...pack,people:[{...p,id:'__proto__'}]}])
    assert.throws(()=>C.readPack(JSON.stringify(data)));
});
test('reimports upsert stable ids and do not affect a local greeting',()=>{
  const a=person('p-1','旧名',b(6,9)), other=person('p-2','另一个',b(7,9));
  assert.deepEqual(C.merge([a,other],[{...a,name:'新名'}]).map(p=>p.name),['新名','另一个']);
  const p={...a,alias:'阿禾',interests:'摄影',wish:'拍好星空'};
  const text=C.greeting(p); for(const f of ['阿禾','摄影','拍好星空']) assert.ok(text.includes(f));
  assert.notEqual(C.greeting(p,'自然',1),text);
});
test('reminder schedule groups dates, honors current local time and shares lunar occurrences',()=>{
  const list=[person('p1','阿禾',b(9,17)),person('p2','星星',b(8,15,'lunar'))];
  const groups=C.rules(list);
  const e=C.upcoming(groups,2,'09:00',new Date(2024,8,17,8,59));
  assert.deepEqual(e[0],{date:'2024-09-17',names:['阿禾','星星']});
  assert.notEqual(C.upcoming(groups,1,'09:00',new Date(2024,8,17,9,1))[0].date,e[0].date);
  assert.ok(C.androidRules(groups)[1].dates.includes(e[0].date));
});
