import {context,fs,path,read,write,assert,validateDraft,pcmFromWav,hash,run,sharpFor} from './common.mjs';

const c=await context(process.argv[2]), {project,style,build,output,r,ff}=c;
const plan=await read(path.join(build,'timeline.json'));
assert.equal(plan.projectSha256,await hash(c.file),'Project changed since synchronization');
assert.equal(plan.sourceAudioSha256,await hash(path.resolve(c.root,project.audio.path)));
const folder=path.join(output,'draft-package');
const draft=await read(path.join(folder,'import-data/content.json'));
const meta=await read(path.join(folder,'import-data/meta.json'));
const manifest=await read(path.join(folder,'import-data/manifest.json'));
const files=validateDraft(draft,meta,folder);
assert.equal(draft.tracks[0].segments.length,1);
assert.equal(draft.tracks[1].segments.length,plan.demos.length);
assert.equal(draft.tracks[2].segments.length,1);
assert.equal(draft.fps,plan.fps); assert.equal(draft.canvas_config.width,plan.width);
assert.equal(draft.canvas_config.height,plan.height);
assert.equal((await read(path.join(folder,'Timelines/project.json'))).main_timeline_id,draft.id);
assert.equal((await read(path.join(folder,'timeline_layout.json'))).activeTimeline,draft.id);
const timeline=path.join(folder,'Timelines',draft.id);
assert.equal(await hash(path.join(folder,'draft_content.json')),await hash(path.join(timeline,'draft_content.json')));
for(const [label,expected,file] of [['content',draft,'draft_content.json'],['meta',meta,'draft_meta_info.json']]) {
  const out=path.join(build,`checked-${label}.json`);
  await run(r.codecPath,['--dec',path.join(folder,file),out],path.join(build,`check-codec-${label}.log`),path.dirname(r.codecPath));
  assert.deepEqual(await read(out),expected);
}
for(const f of [...files,path.join(output,'preview.mp4')]) {
  const log=await ff(['-i',f,'-progress','pipe:1','-f','null','-'],`decode-${path.basename(f)}`);
  if(f.endsWith('.mp4')) {
    const counts=[...log.matchAll(/^frame=(\d+)\s*$/gm)].map(m=>Number(m[1]));
    const demo=plan.demos.find(d=>d.file===path.basename(f));
    assert.equal(counts.at(-1),demo?demo.endFrame-demo.startFrame:plan.frameCount,'Wrong video length/frame count');
  }
}
// Reconstruct the original PCM by removing only the exact inserted silent ranges.
const original=pcmFromWav(await fs.readFile(path.join(build,'original.wav')));
const narrated=pcmFromWav(await fs.readFile(path.join(folder,'media/narration.wav')));
assert(Math.abs(narrated.length/96000-plan.seconds)<1/plan.fps);
const speech=[];let input=0, outputPos=Math.round(plan.intro*48000)*2;
assert(narrated.subarray(0,outputPos).every(x=>x===0));
for(const g of plan.gaps) {
  const length=g.atSample*2-input;
  speech.push(narrated.subarray(outputPos,outputPos+length)); outputPos+=length;
  const silence=Math.round(g.extraSeconds*48000)*2;
  assert(narrated.subarray(outputPos,outputPos+silence).every(x=>x===0));
  outputPos+=silence; input=g.atSample*2;
}
speech.push(narrated.subarray(outputPos,outputPos+original.length-input));
assert.equal(Buffer.compare(Buffer.concat(speech),original),0,'Speech samples changed');
const sharp=sharpFor(r), checks=[];
let n=0;
async function frame(file,t,width,height,filter='') {
  const out=path.join(build,`qa-${n++}.png`);
  await ff(['-ss',String(Math.max(0,t)),'-i',file,'-vf',filter?`${filter},scale=${width}:${height}`:`scale=${width}:${height}`,
    '-frames:v','1',out],`frame-${n}`);
  return sharp(out).removeAlpha().raw().toBuffer();
}
function mae(a,b) {
  assert.equal(a.length,b.length); let sum=0;
  for(let i=0;i<a.length;i++) sum+=Math.abs(a[i]-b[i]); return sum/a.length;
}
const baseErrors=[];
for(const s of plan.stages) {
  const sampleFrame=Math.min(s.endFrame-1,s.startFrame+Math.ceil((s.phase?style.fadeSeconds+0.1:0.1)*plan.fps));
  assert(sampleFrame>=s.startFrame,'Invalid visual phase');
  const actual=await frame(path.join(folder,'media/ppt_base.mp4'),sampleFrame/plan.fps,320,180);
  const expected=await sharp(s.image).resize(320,180).removeAlpha().raw().toBuffer();
  const error=mae(actual,expected);
  assert(error<5,'PPT state timing or image does not match'); baseErrors.push(error);
}
for(const d of plan.demos) {
  const file=path.join(folder,'media',d.file);
  const headCrop=d.sources.length===2?`crop=${(d.box.width-48)/2}:${d.box.height}:0:0`:'';
  const first=await frame(file,0.15,192,108,headCrop), held=await frame(file,Math.min(1.45,style.holdStartSeconds-0.05),192,108,headCrop);
  const headError=mae(first,held); assert(headError<0.8,'Initial demo hold is missing');
  const endA=await frame(file,d.motionEnd+0.2,192,108);
  const endB=await frame(file,Math.min(d.duration-1/plan.fps,d.motionEnd+0.7),192,108);
  const tailError=mae(endA,endB); assert(tailError<0.8,'Ending demo hold is missing');
  const moveA=await frame(file,d.motionStart+0.1,192,108);
  const moveB=await frame(file,d.motionStart+Math.min(1.1,d.playSeconds-0.1),192,108);
  const motion=mae(moveA,moveB); assert(motion>0.4,'Demo may be frozen; inspect selected source interval');
  const row={page:d.page,headError,tailError,motion};
  if(d.sources.length===2) {
    const cell=(d.box.width-48)/2; row.synchronizedErrors=[];
    for(const offset of [0.3,Math.min(1.5,d.playSeconds-0.2)]) {
      for(const [i,s] of d.sources.entries()) {
        const actual=await frame(file,d.motionStart+offset,192,108,`crop=${cell}:${d.box.height}:${i*(cell+48)}:0`);
        let best=Infinity;
        for(const adjustment of [-1/plan.fps,0,1/plan.fps]) {
          const expected=await frame(s.path,s.sourceStart+offset+adjustment,192,108,
            `scale=${cell}:${d.box.height}:force_original_aspect_ratio=decrease,pad=${cell}:${d.box.height}:(ow-iw)/2:(oh-ih)/2:color=${style.colors.background.replace('#','0x')}`);
          best=Math.min(best,mae(actual,expected));
        }
        assert(best<10,'Comparison clocks do not match source timestamps'); row.synchronizedErrors.push(best);
      }
    }
  }
  checks.push(row);
}
for(const [file,digest] of Object.entries(manifest.mediaSha256))
  assert.equal(await hash(path.join(folder,'media',file)),digest);
manifest.checksPassed=true;
manifest.contentSha256=await hash(path.join(folder,'import-data/content.json'));
manifest.metaSha256=await hash(path.join(folder,'import-data/meta.json'));
await write(path.join(folder,'import-data/manifest.json'),manifest);
await write(path.join(build,'validation.json'),{status:'pass',tracks:3,pages:project.pages.length,
  seconds:plan.seconds,fullDecode:true,speechSamplesPreserved:true,nativeRoundtrip:true,
  basePixelErrors:baseErrors,demoPixelChecks:checks,screenPlaybackTested:false});
console.log(JSON.stringify({status:'pass',seconds:plan.seconds,tracks:3,pages:project.pages.length}));
