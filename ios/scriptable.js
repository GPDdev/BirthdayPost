// The build prepends the identical calendar, validation and greeting code used by the native clients.
const C = PostalCore;
const fm = FileManager.local();
const folder = fm.joinPath(fm.libraryDirectory(), "BirthdayPost");
if (!fm.fileExists(folder)) fm.createDirectory(folder, true);
const slots = ["book-a.json", "book-b.json"].map(name => fm.joinPath(folder, name));
const prefix = "birthdaypost.v1.";
let revision = 0;
let book = C.fresh();
function loadBook() {
  let found = false;
  for (const path of slots) {
    if (!fm.fileExists(path)) continue;
    try {
      const obj = JSON.parse(fm.readString(path));
      if (!Number.isSafeInteger(obj.revision) || !Array.isArray(obj.state.people)) continue;
      const people = obj.state.people.map(C.profile);
      if (obj.revision >= revision) {
        revision = obj.revision; book = {...C.fresh(), ...obj.state, people}; found = true;
      }
    } catch (_) { /* An interrupted write can leave the other slot valid. */ }
  }
  if (!found && slots.some(path => fm.fileExists(path))) throw new Error("本机资料无法读取。请从电脑端保留的资料包恢复。");
}
function saveBook(state) {
  const seq = revision + 1;
  fm.writeString(slots[seq % 2], JSON.stringify({revision:seq,state}));
  book = state; revision = seq;
}
async function message(title, body) {
  const a = new Alert(); a.title = title; a.message = body; a.addAction("好"); await a.presentAlert();
}
async function choices(title, body, labels, cancel="返回") {
  const a = new Alert(); a.title=title; a.message=body;
  for (const label of labels) a.addAction(label);
  a.addCancelAction(cancel); return await a.presentSheet();
}
async function editLine(title, label, old) {
  const a = new Alert(); a.title=title; a.addTextField(label,old); a.addAction("保存"); a.addCancelAction("取消");
  return (await a.presentAlert()) === 0 ? a.textFieldValue(0).trim() : null;
}
function bodyFor(names) { return names.join("、").slice(0,230) + "，点此写生日祝福。"; }
async function refreshNotifications() {
  const listed = await Notification.allPending();
  const ours = listed.filter(n => String(n.identifier).startsWith(prefix));
  if (!book.enabled || !book.people.length) {
    if (ours.length) await Notification.removePending(ours.map(n => n.identifier));
    return "";
  }
  const room = Math.min(54, 62 - (listed.length - ours.length));
  if (room < 2) throw new Error("Scriptable 的待发通知名额不足。请清理其他脚本的提醒后，重新打开生辰邮局。");
  const entries = C.upcoming(C.rules(book.people), room-1, book.time);
  if (!entries.length) throw new Error("当前资料没有可安排的未来日期。");
  const [hour,minute] = book.time.split(":").map(Number);
  const requests = entries.map(e => {
    const [y,m,d] = e.date.split("-").map(Number);
    return { id:prefix+e.date, when:new Date(y,m-1,d,hour,minute), title:"今天有 "+e.names.length+" 位好友过生日", body:bodyFor(e.names) };
  });
  const end = requests[requests.length-1].when;
  const renewal = new Date(end.getTime());
  renewal.setDate(renewal.getDate()-1);
  if (renewal > new Date()) requests.push({id:prefix+"refill",when:renewal,title:"续排生日提醒",body:"点此打开生辰邮局，继续安排后续生日。"});
  const keep = new Set(requests.map(r=>r.id));
  const stale = ours.filter(n=>!keep.has(n.identifier)).map(n=>n.identifier);
  if (stale.length) await Notification.removePending(stale);
  const old = new Map(ours.map(n=>[n.identifier,n]));
  for (const r of requests) {
    const fingerprint = [r.when.getTime(),r.title,r.body].join("|");
    if (old.get(r.id)?.userInfo?.fingerprint === fingerprint) continue;
    const n = new Notification();
    n.identifier=r.id; n.threadIdentifier=prefix; n.title=r.title; n.body=r.body; n.sound="default";
    n.userInfo={fingerprint}; n.openURL=URLScheme.forRunningScript();
    n.setTriggerDate(r.when); await n.schedule();
  }
  return "已排到 "+entries[entries.length-1].date+"，打开脚本会自动续排。";
}
async function importBook() {
  const pick = await DocumentPicker.open(["public.json","public.text","public.data"]);
  const path = Array.isArray(pick) ? pick[0] : pick;
  if (!path) return;
  if (fm.fileSize(path) > 32*1024) throw new Error("资料包超过 32 MB。");
  const incoming = C.readPack(fm.readString(path));
  const known = new Set(book.people.map(p=>p.id));
  const updates = incoming.filter(p=>known.has(p.id)).length;
  const ok = await choices("导入生日资料","将新增 "+(incoming.length-updates)+" 位好友，更新 "+updates+" 位。已保存的祝福草稿会保留。",["确认导入"]);
  if (ok !== 0) return;
  saveBook({...book,people:C.merge(book.people,incoming)});
  const info = book.enabled ? await refreshNotifications() : "在「提醒设置」里开启生日通知。";
  await message("生日资料已导入",info);
}
async function choosePerson(entries,title) {
  if (!entries.length) {await message(title,"还没有符合条件的好友。"); return null;}
  const table=new UITable(); table.showSeparators=true;
  const header=new UITableRow(); header.isHeader=true; header.addText(title); table.addRow(header);
  let selected=null;
  for (const entry of entries) {
    const p=entry.person, row=new UITableRow(); row.height=60; row.dismissOnSelect=true;
    row.addText(p.name, C.birthdayLabel(p.birthday)+(p.relation?"　"+p.relation:""));
    row.onSelect=()=>{selected=p;}; table.addRow(row);
  }
  await table.present(); return selected;
}
async function composePerson(p) {
  let draft=book.drafts[p.id] || {tone:"自然",version:0,text:C.greeting(p)};
  while (true) {
    const pick=await choices("写给"+(p.alias || p.name)+"的祝福",draft.text,["复制祝福","编辑正文","更换语气","换一版","移除这位好友"]);
    if(pick < 0) return;
    if(pick===4) {
      if(await choices("移除好友","移除"+p.name+"的本机资料、草稿和后续提醒？",["确认移除"])!==0) continue;
      const drafts={...book.drafts}; delete drafts[p.id];
      saveBook({...book,people:book.people.filter(f=>f.id!==p.id),drafts});
      if(book.enabled) await refreshNotifications();
      return;
    }
    if(pick===0) {Pasteboard.copyString(draft.text); saveBook({...book,drafts:{...book.drafts,[p.id]:draft}}); await message("祝福已复制","打开聊天，粘贴后即可发送。"); return;}
    if(pick===1) {
      const text=await editLine("编辑生日祝福","祝福正文",draft.text);
      if(text===null) continue;
      if(!text) {await message("请输入正文","祝福内容不能为空。"); continue;}
      draft={...draft,text:text.slice(0,4000)};
    } else {
      let tone=draft.tone;
      if(pick===2) {
        const tones=["自然","俏皮","郑重"], i=await choices("选择语气","将以选中的语气重新生成这份草稿。",tones);
        if(i<0) continue; tone=tones[i];
      }
      const version=pick===2?0:draft.version+1;
      draft={tone,version,text:C.greeting(p,tone,version)};
    }
    saveBook({...book,drafts:{...book.drafts,[p.id]:draft}});
  }
}
async function reminderSettings() {
  const text=(book.enabled?"已开启":"未开启")+"　"+book.time+"\n有生日的日子才会发送通知。";
  const pick=await choices("提醒设置",text,book.enabled?["修改提醒时间","关闭提醒"]:["开启生日提醒"]);
  if(pick<0) return;
  if(pick===1) {saveBook({...book,enabled:false});await refreshNotifications();return;}
  const time=await editLine("每天几点提醒","例如 09:00",book.time);
  if(time===null) return;
  if(!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error("请输入 24 小时制时间，例如 09:00。");
  saveBook({...book,time,enabled:true});
  const details=await refreshNotifications();
  await message("提醒设置已保存",details || "导入好友后即可安排通知。");
}
async function runPostal() {
  loadBook();
  if (book.enabled) {
    try {await refreshNotifications();} catch(e) {await message("提醒尚未排好",e.message+" 请检查 Scriptable 的系统通知权限。");}
  }
  while (true) {
    const entries=C.sorted(book.people), same=entries.filter(e=>e.date===C.today());
    const subtitle=same.length ? "今天过生日："+same.map(e=>e.person.name).join("、") :
      entries.length ? "今天没有好友过生日。" : "先从电脑导入一份生日资料包。";
    const pick=await choices("生辰邮局",subtitle,["今日生日（"+same.length+"）","好友名册（"+entries.length+"）","导入生日资料包","提醒设置"],"完成");
    if(pick<0) break;
    try {
      if(pick<2) {
        const list=pick===0?same:entries;
        const p=list.length===1?list[0].person:await choosePerson(list,pick===0?"今日生日":"好友名册");
        if(p) await composePerson(p);
      } else if(pick===2) await importBook();
      else await reminderSettings();
    } catch(e) {if(!/cancel|取消/i.test(String(e))) await message("操作未完成",e.message || String(e));}
  }
}
await runPostal();
Script.complete();
