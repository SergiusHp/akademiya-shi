// Витягує модулі першої версії курсу (Main.dc.html) у src/source/mine.json
const fs=require('fs'),vm=require('vm');
const src=fs.readFileSync(process.argv[2],'utf8');
const logic=src.match(/<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/)[1];
const ctx={};vm.createContext(ctx);
vm.runInContext('class DCLogic{constructor(p){this.props=p||{}}}\n'+logic+'\nthis.mods=new Component({}).mods;',ctx);
fs.writeFileSync(__dirname+'/../src/source/mine.json',JSON.stringify(ctx.mods,null,1));
console.log(ctx.mods.length,'modules');
