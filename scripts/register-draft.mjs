import {fs,path,read,write,assert,runtime,serialize,validateDraft,hash} from './common.mjs';

const argv=process.argv.slice(2), folder=path.resolve(argv[0]||'.');
const option=name=>{const i=argv.indexOf(name); return i>=0?argv[i+1]:undefined;};
const draftRoot=option('--draft-root'), indexFile=option('--index');
assert(argv[0] && draftRoot && indexFile,'Usage: register-draft.mjs <package> --draft-root <root> --index <root_meta_info.json>');
const root=path.resolve(draftRoot), indexPath=path.resolve(indexFile);
const manifest=await read(path.join(folder,'import-data/manifest.json'));
assert.equal(manifest.checksPassed,true,'Package checks have not passed');
assert.equal(await hash(path.join(folder,'import-data/content.json')),manifest.contentSha256,'Draft content changed since validation');
assert.equal(await hash(path.join(folder,'import-data/meta.json')),manifest.metaSha256,'Draft metadata changed since validation');
assert(manifest.name && !/[<>:"/\\|?*\x00-\x1f]/.test(manifest.name));
assert(!/[. ]$/.test(manifest.name) && !/^\.{1,2}$/.test(manifest.name));
const target=path.resolve(root,manifest.name);
assert.equal(path.dirname(target),root,'Target escapes selected draft root');
try { await fs.access(target); throw new Error('Draft already exists; refusing to overwrite'); }
catch(e) { if(e.code!=='ENOENT') throw e; }
const bytes=await fs.readFile(indexPath,'utf8'), index=JSON.parse(bytes);
assert(Array.isArray(index.all_draft_store),'Not a Jianying root index');
assert(!index.all_draft_store.some(e=>e.draft_id===manifest.draftId ||
  path.resolve(e.draft_fold_path||'.').toLowerCase()===target.toLowerCase()),'Draft already registered');
for(const [file,digest] of Object.entries(manifest.mediaSha256)) {
  assert.equal(path.basename(file),file);
  assert.equal(await hash(path.join(folder,'media',file)),digest,'Media has changed since validation');
}
const content=await read(path.join(folder,'import-data/content.json'));
const meta=await read(path.join(folder,'import-data/meta.json'));
assert.equal(content.id,manifest.timelineId); assert.equal(meta.draft_id,manifest.draftId);
for(const list of Object.values(content.materials)) for(const m of list)
  if(m.path) m.path=path.join(target,'media',path.basename(m.path));
for(const group of meta.draft_materials) for(const m of group.value)
  m.file_Path=path.join(target,'media',path.basename(m.file_Path));
meta.draft_fold_path=target; meta.draft_root_path=root;
meta.draft_removable_storage_device=path.parse(root).root.replaceAll('\\','');
meta.tm_draft_modified=Date.now()*1000;
const files=validateDraft(content,meta,target);
const r=await runtime();
const backup=path.join(path.dirname(indexPath),`root-meta-backup-${Date.now()}.json`);
await fs.writeFile(backup,bytes,{flag:'wx'});
await fs.mkdir(root,{recursive:true});
await fs.cp(folder,target,{recursive:true,force:false,errorOnExist:true});
for(const f of files) await fs.access(f);
await serialize(content,meta,target,r,path.join(target,'import-data/codec-registration'));
await write(path.join(target,'import-data/content.json'),content);
await write(path.join(target,'import-data/meta.json'),meta);
assert.equal(await fs.readFile(indexPath,'utf8'),bytes,'Draft index changed concurrently. Stop; unregistered copy remains at target');
const previous=structuredClone(index.all_draft_store);
const entry={...meta,draft_cover:path.join(target,'draft_cover.jpg'),
  draft_json_file:path.join(target,'draft_content.json'),
  draft_timeline_materials_size:meta.draft_timeline_materials_size_,
  streaming_edit_draft_ready:true,draft_is_invisible:false};
for(const f of ['draft_materials','draft_enterprise_info','draft_materials_copied_info','draft_segment_extra_info']) delete entry[f];
index.all_draft_store.unshift(entry);
await fs.writeFile(indexPath,JSON.stringify(index));
assert.deepEqual((await read(indexPath)).all_draft_store.slice(1),previous);
await write(path.join(target,'import-data/install-receipt.json'),{
  name:manifest.name,target,seconds:manifest.seconds,tracks:3,backup,
  previousProjectsPreserved:true,nativeRoundtrip:true
});
console.log(JSON.stringify({name:manifest.name,target,seconds:manifest.seconds,tracks:3}));
