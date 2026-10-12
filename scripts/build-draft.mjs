import {context,fs,path,read,write,assert,uuid,skillRoot,sharpFor,serialize,validateDraft,hash} from './common.mjs';

const c=await context(process.argv[2]), {project,style,build,output,r}=c;
const plan=await read(path.join(build,'timeline.json'));
assert(r.jianyingInstallDir,'Configure the local Jianying installation before building a draft');
await fs.access(r.codecPath);
assert.equal(plan.projectSha256,await hash(c.file),'Project changed; regenerate timing');
assert(project.draftName && !/[<>:"/\\|?*\x00-\x1f]/.test(project.draftName),'Use a valid draft directory name');
assert(!/[. ]$/.test(project.draftName) && !/^\.{1,2}$/.test(project.draftName));
const folder=path.join(output,'draft-package');
try { await fs.access(folder); throw new Error('Package already exists: create a new project revision'); }
catch(e) { if(e.code!=='ENOENT') throw e; }
const seed=await read(path.join(skillRoot,'assets/native-seeds.json'));
const draft=structuredClone(seed.content), now=Date.now()*1000;
Object.assign(draft,{id:uuid(),name:project.draftName,duration:plan.durationUs,fps:plan.fps,
  canvas_config:{width:plan.width,height:plan.height,ratio:'original'},color_space:0,tracks:[],materials:{},
  config:{original_sound_last_index:plan.demos.length+1,maintrack_adsorb:false}});
const inventory=[];
const put=(kind,m)=>{(draft.materials[kind]||=[]).push(m);return m;};
const cloneAux=segment=>(segment.extra_material_refs||[]).map(ref=>{
  for(const [kind,list] of Object.entries(seed.auxiliaries)) {
    const old=list.find(m=>m.id===ref);
    if(old) { const m={...structuredClone(old),id:uuid()}; put(kind,m); return m.id; }
  }
  throw new Error(`Missing auxiliary seed ${ref}`);
});
function addInventory(file,duration,localId,audio,width,height) {
  inventory.push({ai_group_type:'',create_time:Math.floor(now/1e6),duration,enter_from:0,
    extra_info:file,file_Path:path.join(folder,'media',file),height,id:localId,
    import_time:Math.floor(now/1e6),import_time_ms:now,item_source:1,material_color_tag:'',md5:'',
    metetype:audio?'audio':'video',roughcut_time_range:{start:0,duration},
    sub_time_range:{start:-1,duration:-1},type:audio?1:0,width});
}
function segment(file,start,duration,index,box) {
  const m=put('videos',{...structuredClone(seed.videoMaterial),id:uuid(),unique_id:uuid(),
    local_material_id:uuid(),duration,path:path.join(folder,'media',file),material_name:file,
    width:box?.width||plan.width,height:box?.height||plan.height});
  addInventory(file,duration,m.local_material_id,false,m.width,m.height);
  const s={...structuredClone(seed.videoSegment),id:uuid(),material_id:m.id,
    source_timerange:{start:0,duration},target_timerange:{start,duration},speed:1,volume:0,
    render_index:index,track_render_index:index,extra_material_refs:cloneAux(seed.videoSegment)};
  const scale=box?1/Math.min(plan.width/box.width,plan.height/box.height):1;
  s.clip={alpha:1,rotation:0,scale:{x:scale,y:scale},
    transform:{x:box?(box.left+box.width/2-plan.width/2)/(plan.width/2):0,
      y:box?(plan.height/2-box.top-box.height/2)/(plan.height/2):0},flip:{horizontal:false,vertical:false}};
  s.uniform_scale={on:true,value:1}; return s;
}
const base=segment('ppt_base.mp4',0,plan.durationUs,0);
const demos=plan.demos.map(d=>segment(d.file,Math.round(d.startFrame/plan.fps*1e6),
  Math.round((d.endFrame-d.startFrame)/plan.fps*1e6),1,d.box));
const audio=put('audios',{...structuredClone(seed.audioMaterial),id:uuid(),local_material_id:uuid(),
  name:'narration.wav',path:path.join(folder,'media/narration.wav'),duration:plan.durationUs});
addInventory('narration.wav',plan.durationUs,audio.local_material_id,true,0,0);
const narration={...structuredClone(seed.audioSegment),id:uuid(),material_id:audio.id,
  source_timerange:{start:0,duration:plan.durationUs},target_timerange:{start:0,duration:plan.durationUs},
  speed:1,volume:1,track_render_index:2,extra_material_refs:cloneAux(seed.audioSegment)};
draft.tracks=[{id:uuid(),name:'PPT底片（文字动效）',type:'video',flag:0,is_default_name:false,segments:[base]},
  {id:uuid(),name:'演示视频',type:'video',flag:2,is_default_name:false,segments:demos},
  {id:uuid(),name:'旁白',type:'audio',flag:0,is_default_name:false,segments:[narration]}];
const meta={...structuredClone(seed.meta),draft_id:uuid(),draft_name:project.draftName,
  draft_cover:'draft_cover.jpg',draft_fold_path:folder,draft_root_path:path.dirname(folder),
  draft_removable_storage_device:path.parse(folder).root.replaceAll('\\',''),
  tm_duration:plan.durationUs,tm_draft_create:now,tm_draft_modified:now,tm_draft_removed:0,
  draft_materials:[0,1,2,3,6,7,8].map(type=>({type,value:inventory.filter(m=>m.type===type)}))};
const files=validateDraft(draft,meta,folder);
await fs.mkdir(path.join(folder,'media'),{recursive:true});
for(const target of files) await fs.copyFile(path.join(output,'media',path.basename(target)),target);
meta.draft_timeline_materials_size_=(await Promise.all(files.map(async f=>(await fs.stat(f)).size))).reduce((a,b)=>a+b,0);
const projectInfo={config:{color_space:-1,hdr_vivid:false,mixed_track_mode_on:false,
  render_index_track_mode_on:true,use_float_render:false},create_time:now,id:uuid(),main_timeline_id:draft.id,
  timelines:[{create_time:now,id:draft.id,is_marked_delete:false,name:'时间线01',update_time:now}],update_time:now,version:0};
await write(path.join(folder,'Timelines/project.json'),projectInfo);
await write(path.join(folder,'Timelines/project.json.bak'),projectInfo);
await write(path.join(folder,'timeline_layout.json'),{activeTimeline:draft.id,
  dockItems:[{dockIndex:0,ratio:1,timelineIds:[draft.id],timelineNames:['时间线01']}],layoutOrientation:1});
for(const [f,value] of Object.entries(seed.attachments)) {
  await write(path.join(folder,f),value);
  if(f.startsWith('attachment_')) await write(path.join(folder,'Timelines',draft.id,f),value);
}
await fs.writeFile(path.join(folder,'draft_settings'),`[General]\ndraft_create_time=${Math.floor(now/1e6)}\ndraft_last_edit_time=${Math.floor(now/1e6)}\nreal_edit_seconds=0\nreal_edit_keys=0\ncloud_last_modify_platform=windows\n`);
await sharpFor(r)(plan.stages[1].image).jpeg({quality:90}).toFile(path.join(folder,'draft_cover.jpg'));
await fs.copyFile(path.join(folder,'draft_cover.jpg'),path.join(folder,'Timelines',draft.id,'draft_cover.jpg'));
await serialize(draft,meta,folder,r,path.join(build,'codec'));
await write(path.join(folder,'import-data/content.json'),draft);
await write(path.join(folder,'import-data/meta.json'),meta);
const fingerprints={};
for(const f of files) fingerprints[path.basename(f)]=await hash(f);
await write(path.join(folder,'import-data/manifest.json'),{
  name:project.draftName,timelineId:draft.id,draftId:meta.draft_id,seconds:plan.seconds,
  testedJianyingVersion:r.testedJianyingVersion,tracks:3,mediaSha256:fingerprints,checksPassed:false
});
await write(path.join(folder,'import-data/runtime-profile.json'),r);
for(const f of ['common.mjs','register-draft.mjs']) {
  await fs.mkdir(path.join(folder,'import-tools/scripts'),{recursive:true});
  await fs.copyFile(path.join(skillRoot,'scripts',f),path.join(folder,'import-tools/scripts',f));
}
await write(path.join(folder,'import-tools/assets/runtime-profile.json'),{
  ...r,codecPath:'assets/codec/jy-draftc.exe'
});
await fs.mkdir(path.join(folder,'import-tools/assets/codec'),{recursive:true});
for(const file of ['jy-draftc.cpp','LICENSE.txt'])
  await fs.copyFile(path.join(skillRoot,'assets/codec',file),path.join(folder,'import-tools/assets/codec',file));
await fs.copyFile(r.codecPath,path.join(folder,'import-tools/assets/codec/jy-draftc.exe'));
await fs.writeFile(path.join(folder,'import-tools/assets/codec/.env'),`JY_INSTALL_DIR=${r.jianyingInstallDir}\n`);
await fs.copyFile(path.join(skillRoot,'assets/import-draft.ps1'),path.join(folder,'import-tools/import-draft.ps1'));
await fs.copyFile(path.join(skillRoot,'assets/import-draft.cmd'),path.join(folder,'import-draft.cmd'));
await fs.writeFile(path.join(folder,'导入说明.txt'),
  `这是剪映原生草稿目录，不是可从媒体导入按钮导入的 MP4。\n已验证版本：Windows 剪映专业版 ${r.testedJianyingVersion}。\n保存现有工程并返回首页；双击 import-draft.cmd，确认路径后输入 IMPORT 注册新草稿。不要覆盖旧目录。\n另可用命令：\n"${r.nodePath}" "${path.join(folder,'import-tools/scripts/register-draft.mjs')}" "${folder}" --draft-root "${r.draftRoot}" --index "${r.indexPath}"\n移动包后将命令中的包和工具路径换成新位置；双击入口自动定位包。工具会重新映射所有媒体路径。\n需要本机已安装剪映并配置 codec 的 JY_INSTALL_DIR；不兼容版本先测试，不声称通用。\n三个可编辑部分：PPT 底片、演示视频、旁白。文字动画已烘焙在底片。\n`);
console.log(JSON.stringify({folder,tracks:3,seconds:plan.seconds,nativeRoundtrip:true}));
