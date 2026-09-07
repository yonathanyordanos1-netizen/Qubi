const fs=require('fs');
const path=require('path');
const roots=['src','App.tsx','index.ts','app','gates'];
function walk(d){
  let out=[];
  if(fs.lstatSync(d).isFile()){ if(/\.(ts|tsx|js|jsx)$/.test(d)) out.push(d); return out;}
  fs.readdirSync(d).forEach(e=>{ try{ out=out.concat(walk(path.join(d,e)));}catch(err){} });
  return out;
}
let files=[];
roots.forEach(r=>{ try{ files=files.concat(walk(r)); }catch(e){} });
console.log('files:',files.length);
const pats=[/setInterval/,/setTimeout/,/requestAnimationFrame/,/withRepeat\([^)]*,-1/,/\.loop/,/setState.*\(.*=>.*\)/,/\/\/\s*console\.log/];
files.forEach(f=>{
  const c=fs.readFileSync(f,'utf8');
  const lines=c.split('\n');
  lines.forEach((ln,i)=>{
    pats.forEach(p=>{
      if(p.test(ln)){
        console.log(`${f}:${i+1}: ${ln.trim().slice(0,120)}`);
      }
    });
  });
});