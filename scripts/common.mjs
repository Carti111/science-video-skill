import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {randomUUID, createHash} from 'node:crypto';
import assert from 'node:assert/strict';

export {fs, path, assert};
export const skillRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const read = async f => JSON.parse(await fs.readFile(f, 'utf8'));
export const write = async (f, value) => {
  await fs.mkdir(path.dirname(f), {recursive:true});
  await fs.writeFile(f, JSON.stringify(value, null, 2));
};
export const uuid = () => randomUUID().toUpperCase();
export const hash = async f => createHash('sha256').update(await fs.readFile(f)).digest('hex');
export const resolveAt = (root, f) => path.resolve(root, f);
export async function run(exe, args, logFile, cwd) {
  const child = spawn(exe, args, {cwd, windowsHide:true, stdio:['ignore','pipe','pipe']});
  let log = '';
  child.stdout.on('data', c => log += c);
  child.stderr.on('data', c => log += c);
  const code = await new Promise((resolve,reject) => {
    child.once('error',reject); child.once('close',resolve);
  });
  if (logFile) {
    await fs.mkdir(path.dirname(logFile), {recursive:true});
    await fs.writeFile(logFile, log);
  }
  if (code !== 0) throw new Error(`${path.basename(exe)} exited ${code}: ${log.slice(-5000)}`);
  return log;
}
export async function runtime(overrides = {}) {
  let local = {};
  try { local = await read(path.join(skillRoot,'assets/runtime-profile.local.json')); }
  catch(e) { if(e.code!=='ENOENT') throw e; }
  const r = {...await read(path.join(skillRoot,'assets/runtime-profile.json')), ...local, ...overrides};
  if (!r.nodePath || r.nodePath==='node') r.nodePath=process.execPath;
  for (const key of ['codecPath','nodeModules'])
    if (r[key] && !path.isAbsolute(r[key])) r[key] = resolveAt(skillRoot,r[key]);
  if (r.ffmpegPath && /[/\\]/.test(r.ffmpegPath) && !path.isAbsolute(r.ffmpegPath))
    r.ffmpegPath=resolveAt(skillRoot,r.ffmpegPath);
  return r;
}
export function sharpFor(r) {
  return createRequire(path.join(r.nodeModules,'__world_model_require__.cjs'))('sharp');
}
export async function context(projectFile) {
  assert(projectFile, 'Pass an absolute project.json path');
  const file = path.resolve(projectFile), root = path.dirname(file), project = await read(file);
  assert.equal(project.schemaVersion,1);
  const r = await runtime(project.runtime);
  const style = {...await read(path.join(skillRoot,'assets/style.json')), ...project.style};
  assert(Number.isInteger(style.fps) && style.fps > 0);
  const build = path.join(root,'build'), output = path.join(root,'output');
  await fs.mkdir(build,{recursive:true});
  await fs.mkdir(path.join(output,'media'),{recursive:true});
  const ff = (args,label) => run(r.ffmpegPath,['-hide_banner','-loglevel','error','-y',...args],path.join(build,`${label}.log`));
  return {file,root,project,r,style,build,output,ff};
}
export function pcmFromWav(wav) {
  assert.equal(wav.toString('ascii',0,4),'RIFF');
  let pcm, fmt;
  for (let pos=12;pos+8<=wav.length;) {
    const n=wav.readUInt32LE(pos+4), tag=wav.toString('ascii',pos,pos+4);
    if(tag==='data') pcm=wav.subarray(pos+8,pos+8+n);
    if(tag==='fmt ') fmt=wav.subarray(pos+8,pos+8+n);
    pos+=8+n+n%2;
  }
  assert(fmt && pcm);
  assert.equal(fmt.readUInt16LE(0),1); assert.equal(fmt.readUInt16LE(2),1);
  assert.equal(fmt.readUInt32LE(4),48000); assert.equal(fmt.readUInt16LE(14),16);
  return pcm;
}
export function wavFor(pcm) {
  const h=Buffer.alloc(44);
  h.write('RIFF'); h.writeUInt32LE(36+pcm.length,4); h.write('WAVEfmt ',8);
  h.writeUInt32LE(16,16); h.writeUInt16LE(1,20); h.writeUInt16LE(1,22);
  h.writeUInt32LE(48000,24); h.writeUInt32LE(96000,28);
  h.writeUInt16LE(2,32); h.writeUInt16LE(16,34); h.write('data',36);
  h.writeUInt32LE(pcm.length,40); return Buffer.concat([h,pcm]);
}
export function validateDraft(draft,meta,folder) {
  assert.equal(draft.tracks.length,3);
  assert.deepEqual(draft.tracks.map(t=>t.type),['video','video','audio']);
  assert.equal(draft.duration,meta.tm_duration);
  const materials=Object.values(draft.materials).flat(), ids=new Map(materials.map(m=>[m.id,m]));
  assert.equal(ids.size,materials.length,'Duplicate material IDs');
  const files=[];
  for(const t of draft.tracks) for(const s of t.segments) {
    const m=ids.get(s.material_id); assert(m,'Missing material');
    for(const ref of s.extra_material_refs || []) assert(ids.has(ref),'Missing auxiliary reference');
    assert(s.target_timerange.start >= 0 && s.target_timerange.duration > 0);
    assert(s.target_timerange.start+s.target_timerange.duration <= draft.duration+1);
    assert(s.source_timerange.start+s.source_timerange.duration <= m.duration+1);
    assert.equal(path.resolve(m.path),path.resolve(folder,'media',path.basename(m.path)));
    files.push(m.path);
  }
  return [...new Set(files)];
}
export async function serialize(draft,meta,folder,r,logRoot) {
  assert(r.jianyingInstallDir,'Configure jianyingInstallDir in assets/runtime-profile.local.json or project.runtime');
  assert(r.codecPath,'Configure a compatible native codec');
  await fs.access(r.codecPath);
  const id=draft.id, timeline=path.join(folder,'Timelines',id);
  await fs.mkdir(timeline,{recursive:true});
  const plain=path.join(logRoot,'native-content.json'), plainMeta=path.join(logRoot,'native-meta.json');
  await write(plain,draft); await write(plainMeta,meta);
  const codec=(args,label)=>run(r.codecPath,args,path.join(logRoot,`${label}.log`),path.dirname(r.codecPath));
  // The native codec discovers Jianying DLLs through the JY_INSTALL_DIR setting.
  await fs.access(r.jianyingInstallDir);
  const envFile=path.join(path.dirname(r.codecPath),'.env');
  const existingEnv=await fs.readFile(envFile,'utf8');
  assert(existingEnv.includes(`JY_INSTALL_DIR=${r.jianyingInstallDir}`),'Codec .env differs from runtime; configure a private codec copy first');
  const content=path.join(folder,'draft_content.json'), metaFile=path.join(folder,'draft_meta_info.json');
  await codec(['--enc',plain,content],'encode-content');
  await codec(['--enc',plainMeta,metaFile],'encode-meta');
  for(const f of ['draft_content.json','draft_content.json.bak','template-2.tmp']) {
    if(f!=='draft_content.json') await fs.copyFile(content,path.join(folder,f));
    await fs.copyFile(content,path.join(timeline,f));
  }
  await fs.copyFile(plain,path.join(timeline,'template.tmp'));
  for(const [encoded,expected,label] of [[content,draft,'content'],[metaFile,meta,'meta']]) {
    const decoded=path.join(logRoot,`roundtrip-${label}.json`);
    await codec(['--dec',encoded,decoded],`decode-${label}`);
    assert.deepEqual(await read(decoded),expected);
  }
}
