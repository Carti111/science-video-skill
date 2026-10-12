import {fs,path,write,assert} from './common.mjs';

const [folder, modelName] = process.argv.slice(2);
assert(folder && modelName,'Usage: init-project.mjs <project-directory> <model-name>');
const file=path.resolve(folder,'project.json');
try { await fs.access(file); throw new Error('Project exists; refusing to replace it'); }
catch(e) { if(e.code!=='ENOENT') throw e; }
await write(file,{
  schemaVersion:1,modelName,manufacturer:'',draftName:`${modelName}_科普`,
  phase:'research',delivery:'package',runtime:{},
  audio:{path:'',phrasesFile:''},
  timing:{introExtraSeconds:1.18,chapterExtraSeconds:1.58,
    closingChapterSeconds:0.475,sentenceExtraSeconds:0.18,
    tailExtraSeconds:1,pauseAfterPhrases:[]},
  pages:[],sources:[],media:[]
});
console.log(file);
