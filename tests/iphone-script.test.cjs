// Exercises the shipped Scriptable package with deterministic doubles for iOS-only APIs.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const pkg=JSON.parse(fs.readFileSync(path.join(root,'dist/生辰邮局-iPhone.scriptable'),'utf8'));

test('iPhone package imports, schedules, edits, copies, merges and cancels its own requests only',async()=>{
  const store=new Map(), pending=new Map(), prompts=[], messages=[];
  let clipboard='', completed=false;
  const dirs=new Set(), local={
    libraryDirectory:()=>'/library',joinPath:(a,b)=>a+'/'+b,fileExists:p=>store.has(p)||dirs.has(p),
    createDirectory:p=>dirs.add(p),writeString:(p,t)=>store.set(p,t),readString:p=>store.get(p),fileSize:p=>Buffer.byteLength(store.get(p))/1024
  };
  const p={id:'p-one',name:'阿禾',birthday:{calendar:'solar',month:5,day:18},alias:'阿禾',interests:'骑行',wish:'环湖旅行'};
  store.set('/files/pack.json',JSON.stringify({format:'birthday-post.profiles',version:1,people:[p]}));
  class Alert {
    addAction(){} addCancelAction(){} addTextField(label,value){this.value=value;}
    textFieldValue(){return this.value;}
    async presentSheet(){const action=prompts.shift();assert.equal(this.title,action[0]);return action[1];}
    async presentAlert(){
      if(this.value!==undefined){
        const items=prompts.shift();assert.equal(this.title,items[0]);this.value=items[2];return items[1];
      }
      messages.push([this.title,this.message]);return 0;
    }
  }
  class Notification {
    setTriggerDate(d){this.when=d;}
    async schedule(){pending.set(this.identifier,this);}
    static async allPending(){return [...pending.values()];}
    static async removePending(ids){for(const id of ids)pending.delete(id);}
  }
  pending.set('other-script',{identifier:'other-script'});
  const context=vm.createContext({FileManager:{local:()=>local},Alert,Notification,
    URLScheme:{forRunningScript:()=>'scriptable:///run/BirthdayPost'},
    DocumentPicker:{open:async()=>['/files/pack.json']},Pasteboard:{copyString:v=>{clipboard=v;}},
    Script:{complete:()=>{completed=true;}},console});
  async function run(inputs){
    prompts.push(...inputs);
    await vm.runInContext('(async()=>{'+pkg.script+'\n})()',context);
    assert.deepEqual(prompts,[]);assert.equal(completed,true);completed=false;
  }
  await run([
    ['生辰邮局',2],['导入生日资料',0],['生辰邮局',3],['提醒设置',0],['每天几点提醒',0,'09:15'],
    ['生辰邮局',1],['写给阿禾的祝福',1],['编辑生日祝福',0,'阿禾，等你的环湖照片！'],['写给阿禾的祝福',0],['生辰邮局',-1]
  ]);
  assert.equal(clipboard,'阿禾，等你的环湖照片！');
  const requests=[...pending.values()].filter(v=>v.title?.includes('1 位好友'));
  assert.ok(requests.length>1);assert.equal(requests[0].when.getHours(),9);assert.equal(requests[0].when.getMinutes(),15);
  assert.equal(requests[0].when.getMonth()+1,5);assert.equal(requests[0].when.getDate(),18);assert.match(requests[0].body,/阿禾/);
  assert.ok(pending.has('birthdaypost.v1.refill'));
  clipboard='';
  await run([
    ['生辰邮局',2],['导入生日资料',0],['生辰邮局',1],['写给阿禾的祝福',0],
    ['生辰邮局',3],['提醒设置',1],['生辰邮局',-1]
  ]);
  assert.equal(clipboard,'阿禾，等你的环湖照片！');
  assert.deepEqual([...pending.keys()],['other-script']);
  assert.equal(messages.some(m=>m[0]==='操作未完成'),false);
});
