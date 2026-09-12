import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";

const smoke=resolve("scripts/smoke.mjs");
async function runFixture(javascript, deployedSubpath = false) {
 const root=mkdtempSync(join(tmpdir(),"wx-smoke-fixture-"));
 mkdirSync(join(root,"dist/assets"),{recursive:true});
 writeFileSync(join(root,"dist/index.html"),'<div id="root"></div><script type="module" src="./assets/app.js"></script>');
 writeFileSync(join(root,"dist/assets/app.js"),"/* createRoot Brier */\n"+javascript);
 let server;
 try {
  const args=[smoke];
  if(deployedSubpath) {
   server=createServer((req,res)=>{
    const file=req.url==="/weather-dashboard/"?"index.html":req.url==="/weather-dashboard/assets/app.js"?"assets/app.js":null;
    if(!file) { res.writeHead(404).end(); return; }
    res.writeHead(200,{"content-type":file.endsWith(".js")?"text/javascript":"text/html"});
    res.end(readFileSync(join(root,"dist",file)));
   });
   await new Promise((done,reject)=>{ server.once("error",reject); server.listen(0,"127.0.0.1",done); });
   args.push("--url",`http://127.0.0.1:${server.address().port}/weather-dashboard/`);
  }
  return await new Promise((resolveResult,reject)=>{
   const child=spawn(process.execPath,args,{cwd:root,stdio:["ignore","pipe","pipe"]});
   let output="";
   child.stdout.on("data",data=>output+=data);
   child.stderr.on("data",data=>output+=data);
   const timer=setTimeout(()=>{child.kill();reject(new Error("smoke fixture timeout"));},25000);
   child.on("error",reject);
   child.on("exit",code=>{clearTimeout(timer);resolveResult({code,output});});
  });
 } finally {
  if(server) { server.closeAllConnections(); await new Promise(done=>server.close(done)); }
  assert.equal(dirname(root),resolve(tmpdir()));
  rmSync(root,{recursive:true,force:true});
 }
}
test("smoke rejects a served entry chunk that throws before mounting",async()=>{
 const result=await runFixture('throw new Error("fixture mount failed");');
 assert.equal(result.code,1,result.output);
});
test("smoke rejects a served entry chunk that never mounts",async()=>{
 const result=await runFixture('document.title="still empty";');
 assert.equal(result.code,1,result.output);
});
test("smoke accepts an actual mounted dashboard",async()=>{
 const result=await runFixture('document.getElementById("root").innerHTML=\'<main data-testid="weather-app"><h1>Fixture weather</h1></main>\';');
 assert.equal(result.code,0,result.output);
});

test("post-deploy smoke mounts an app with relative assets at a project subpath",async()=>{
 const result=await runFixture('document.getElementById("root").innerHTML=\'<main data-testid="weather-app"><h1>Deployed fixture</h1></main>\';',true);
 assert.equal(result.code,0,result.output);
});
