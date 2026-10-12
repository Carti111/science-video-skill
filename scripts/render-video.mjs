import {context,fs,path,read,assert,hash,sharpFor} from './common.mjs';

const c=await context(process.argv[2]), {project,style,build,output,ff}=c;
const plan=await read(path.join(build,'timeline.json'));
assert.equal(plan.projectSha256,await hash(c.file),'Project changed: synchronize narration again');
const sharp=sharpFor(c.r), media=path.join(output,'media'), segmentDir=path.join(build,'base-segments');
await fs.mkdir(segmentDir,{recursive:true});
const fps=plan.fps, parts=[];
const encode=['-an','-c:v','libx264','-preset','veryfast','-crf','19','-threads','4',
  '-r',String(fps),'-fps_mode','cfr','-video_track_timescale',String(fps*1000),'-movflags','+faststart'];
for(const [i,s] of plan.stages.entries()) {
  const dimensions=await sharp(s.image).metadata();
  assert.equal(dimensions.width,plan.width); assert.equal(dimensions.height,plan.height);
  const file=path.join(segmentDir,`state-${i}.mp4`);
  const args=['-loop','1','-framerate',String(fps),'-i',s.image];
  if(s.phase) args.push('-loop','1','-framerate',String(fps),'-i',plan.stages[i-1].image,
    '-filter_complex',`[0:v]format=rgba,fade=t=in:st=0:d=${style.fadeSeconds}:alpha=1[new];[1:v]format=rgba[old];[old][new]overlay=shortest=1,format=yuv420p[out]`,'-map','[out]');
  else args.push('-vf','format=yuv420p');
  await ff([...args,...encode,'-frames:v',String(s.endFrame-s.startFrame),file],`base-${i}`);
  parts.push(file); console.log(`PPT state ${i+1}/${plan.stages.length}`);
}
const concat=path.join(build,'base.ffconcat');
assert(parts.every(f=>!f.includes("'")&&!f.includes('\n')),'Concat paths contain unsupported quoting');
await fs.writeFile(concat,'ffconcat version 1.0\n'+parts.map(f=>`file '${f.replaceAll('\\','/')}'`).join('\n'));
await ff(['-f','concat','-safe','0','-i',concat,'-c','copy','-movflags','+faststart',path.join(media,'ppt_base.mp4')],'concat-base');
const bg=style.colors.background.replace('#','0x');
for(const d of plan.demos) {
  const {width,height}=d.box, cellWidth=d.sources.length===2?(width-48)/2:width;
  // A second fps after trim is required: otherwise tpad can lose its frame rate.
  const clock=`setpts=PTS-STARTPTS,fps=${fps},scale=${cellWidth}:${height}:force_original_aspect_ratio=decrease,pad=${cellWidth}:${height}:(ow-iw)/2:(oh-ih)/2:color=${bg},setsar=1,trim=duration=${d.playSeconds},setpts=PTS-STARTPTS,fps=${fps},tpad=start_mode=clone:start_duration=${d.motionStart}:stop_mode=clone:stop_duration=${d.duration}`;
  const args=d.sources.flatMap(s=>['-ss',String(s.sourceStart),'-i',s.path]);
  if(d.sources.length===1) args.push('-vf',clock+',format=yuv420p');
  else args.push('-filter_complex',
    `color=c=${bg}:s=${width}x${height}:r=${fps}:d=${d.duration}[bg];[0:v]${clock}[left];[1:v]${clock},format=rgba,fade=t=in:st=${d.revealSeconds}:d=${style.fadeSeconds}:alpha=1[right];[bg][left]overlay=x=0:y=0:shortest=1[one];[one][right]overlay=x=${cellWidth+48}:y=0:enable='gte(t,${d.revealSeconds})',format=yuv420p[out]`, '-map','[out]');
  await ff([...args,...encode,'-frames:v',String(d.endFrame-d.startFrame),path.join(media,d.file)],`demo-${d.page}`);
  console.log(`Demo page ${d.page+1}`);
}
const args=['-i',path.join(media,'ppt_base.mp4'),'-i',path.join(media,'narration.wav')];
const filters=[]; let last='0:v';
for(const [i,d] of plan.demos.entries()) {
  args.push('-i',path.join(media,d.file));
  const start=d.startFrame/fps,end=d.endFrame/fps;
  filters.push(`[${i+2}:v]setpts=PTS-STARTPTS+${start}/TB[demo${i}]`);
  filters.push(`[${last}][demo${i}]overlay=x=${d.box.left}:y=${d.box.top}:eof_action=pass:enable='gte(t,${start})*lt(t,${end})'[layer${i}]`);
  last=`layer${i}`;
}
filters.push(`[${last}]format=yuv420p[out]`);
await ff([...args,'-filter_complex',filters.join(';'),'-map','[out]','-map','1:a',
  '-frames:v',String(plan.frameCount),'-t',String(plan.seconds),'-c:v','libx264','-preset','veryfast',
  '-crf','20','-threads','4','-c:a','aac','-b:a','192k','-movflags','+faststart',path.join(output,'preview.mp4')],'preview');
console.log(JSON.stringify({preview:path.join(output,'preview.mp4'),seconds:plan.seconds}));
