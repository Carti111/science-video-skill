import {context,fs,path,read,write,assert,pcmFromWav,wavFor,hash,resolveAt} from './common.mjs';

const c=await context(process.argv[2]), {root,project,style,build,output,ff}=c;
assert(project.pages.length>0,'Define pages before synchronizing');
assert(project.audio.path,'User narration is required');
assert(Boolean(project.audio.phrasesFile)!==Boolean(project.audio.nativeTiming),'Use one timing source');
const original=path.join(build,'original.wav');
await ff(['-i',resolveAt(root,project.audio.path),'-vn','-ac','1','-ar','48000','-c:a','pcm_s16le',original],'decode-narration');
const pcm=pcmFromWav(await fs.readFile(original)), sourceSeconds=pcm.length/96000;
let phrases;
if(project.audio.phrasesFile) phrases=await read(resolveAt(root,project.audio.phrasesFile));
else {
  const native=await read(resolveAt(root,project.audio.nativeTiming));
  const track=native.tracks.find(t=>t.type==='text'); assert(track,'Native timing contains no text track');
  phrases=track.segments.map(s=>({start:(s.target_timerange.start||0)/1e6,
    end:((s.target_timerange.start||0)+s.target_timerange.duration)/1e6,
    text:JSON.parse(native.materials.texts.find(m=>m.id===s.material_id).content).text})).sort((a,b)=>a.start-b.start);
}
assert(Array.isArray(phrases) && phrases.length>0);
for(const [i,p] of phrases.entries()) {
  assert(Number.isFinite(p.start) && Number.isFinite(p.end) && p.start>=0 && p.end>p.start);
  assert(typeof p.text==='string' && p.text.trim());
  if(i) assert(p.start>=phrases[i-1].end-0.0001,'Timing must be ordered and non-overlapping');
}
assert(phrases[0].start<0.1 && Math.abs(phrases.at(-1).end-sourceSeconds)<0.1,'Audio differs from timing; align actual exported narration first');
const fps=style.fps, settings=project.timing||{}, intro=settings.introExtraSeconds??1.18;
const chapter=settings.chapterExtraSeconds??1.58, closing=settings.closingChapterSeconds??0.475;
assert(intro>=0 && chapter>=closing && closing>=0);
const firsts=project.pages.map(p=>p.firstPhrase);
assert.equal(firsts[0],0);
for(const [i,p] of project.pages.entries()) {
  const end=firsts[i+1]??phrases.length;
  assert(Number.isInteger(p.firstPhrase) && p.firstPhrase>=0 && end>p.firstPhrase && end<=phrases.length);
  assert(Number.isInteger(p.revealPhrase) && p.revealPhrase>=p.firstPhrase && p.revealPhrase<end);
  assert(Array.isArray(p.frames) && p.frames.length===2);
}
const chapters=new Set(firsts.slice(1).map(i=>i-1)), pauses=new Set(settings.pauseAfterPhrases||[]);
for(const i of pauses) assert(Number.isInteger(i) && i>=0 && i<phrases.length);
const gaps=phrases.flatMap((p,i)=>chapters.has(i)||pauses.has(i)?[{
  afterPhrase:i,original:p.end,atSample:Math.round(p.end*48000),
  extraSeconds:Math.round((chapters.has(i)?chapter:settings.sentenceExtraSeconds??0.18)*48000)/48000,
  chapter:chapters.has(i)
}]:[]);
assert(gaps.every(g=>g.extraSeconds>=0));
const headSamples=Math.round(intro*48000), actualIntro=headSamples/48000;
const before=t=>actualIntro+t+gaps.filter(g=>g.original<t-0.00001).reduce((a,g)=>a+g.extraSeconds,0);
const after=t=>actualIntro+t+gaps.filter(g=>g.original<=t+0.00001).reduce((a,g)=>a+g.extraSeconds,0);
const parts=[Buffer.alloc(headSamples*2)], speech=[]; let pos=0;
for(const g of gaps) {
  assert(g.atSample<=pcm.length/2);
  const part=pcm.subarray(pos*2,g.atSample*2); parts.push(part); speech.push(part);
  parts.push(Buffer.alloc(Math.round(g.extraSeconds*48000)*2)); pos=g.atSample;
}
parts.push(pcm.subarray(pos*2)); speech.push(pcm.subarray(pos*2));
assert.equal(Buffer.compare(Buffer.concat(speech),pcm),0);
const merged=Buffer.concat(parts), tail=settings.tailExtraSeconds??1;
assert(tail>=0);
const frameCount=Math.ceil((merged.length/96000+tail)*fps), seconds=frameCount/fps;
const finalPcm=Buffer.concat([merged,Buffer.alloc(Math.round(seconds*48000)*2-merged.length)]);
await fs.writeFile(path.join(output,'media/narration.wav'),wavFor(finalPcm));
// Split the inserted chapter gap between the departing and incoming pages.
const starts=project.pages.map((p,i)=>i===0?0:before(phrases[p.firstPhrase-1].end)+closing);
const stages=[], demos=[];
for(const [i,p] of project.pages.entries()) {
  const a=Math.round(starts[i]*fps), b=Math.round(after(phrases[p.revealPhrase].start)*fps);
  const end=i===project.pages.length-1?frameCount:Math.round(starts[i+1]*fps);
  assert(b>a && end>b,'Each page needs two positive-length visual states');
  stages.push({page:i,phase:0,startFrame:a,endFrame:b,image:resolveAt(root,p.frames[0])},
    {page:i,phase:1,startFrame:b,endFrame:end,image:resolveAt(root,p.frames[1])});
  if(!p.demo) continue;
  const sources=p.demo.sources.map(s=>({...s,path:resolveAt(root,s.path),sourceStart:s.sourceStart??0}));
  assert(sources.length===1 || sources.length===2);
  const box=p.demo.box || (sources.length===2?style.comparisonVideo:style.singleVideo);
  assert([box.left,box.top,box.width,box.height].every(Number.isInteger));
  assert(box.left>=0 && box.top>=0 && box.left+box.width<=style.width && box.top+box.height<=style.height);
  assert(box.width%2===0 && box.height%2===0);
  if(sources.length===2) assert((box.width-48)%4===0,'Pair cells must have even widths');
  const duration=(end-a)/fps, revealSeconds=(b-a)/fps;
  const motionStart=Math.ceil((sources.length===2?Math.max(style.holdStartSeconds,revealSeconds+style.holdAfterRevealSeconds):style.holdStartSeconds)*fps)/fps;
  const available=Math.min(...sources.map(s=>s.duration-s.sourceStart-1/fps));
  assert(sources.every(s=>Number.isFinite(s.duration) && s.duration>s.sourceStart && s.sourceStart>=0));
  const playSeconds=Math.floor(Math.min(duration-motionStart-style.holdEndSeconds,available)*fps)/fps;
  assert(playSeconds>1,'Page too short for initial hold, motion and ending hold');
  demos.push({page:i,file:`demo_${i+1}.mp4`,startFrame:a,endFrame:end,duration,box,sources,
    revealSeconds,motionStart,playSeconds,motionEnd:motionStart+playSeconds});
}
const captions=phrases.map(p=>({...p,start:after(p.start),end:before(p.end)}));
const plan={name:project.draftName,fps,width:style.width,height:style.height,seconds,frameCount,
  durationUs:Math.round(seconds*1e6),originalSeconds:sourceSeconds,intro:actualIntro,
  gaps,stages,demos,captions,speechSamplesPreserved:true,
  sourceAudioSha256:await hash(resolveAt(root,project.audio.path)),
  projectSha256:await hash(c.file)};
await write(path.join(build,'timeline.json'),plan);
const stamp=t=>{
  const ms=Math.round(t*1000);
  return `${String(Math.floor(ms/3600000)).padStart(2,'0')}:${String(Math.floor(ms/60000)%60).padStart(2,'0')}:${String(Math.floor(ms/1000)%60).padStart(2,'0')},${String(ms%1000).padStart(3,'0')}`;
};
await fs.writeFile(path.join(output,'captions.srt'),captions.map((p,i)=>`${i+1}\n${stamp(p.start)} --> ${stamp(p.end)}\n${p.text}\n`).join('\n'));
console.log(JSON.stringify({seconds,pages:project.pages.length,speechSamplesPreserved:true}));
