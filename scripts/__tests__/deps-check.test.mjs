import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const gate = resolve("scripts/deps-check.mjs");
function runFixture(mode) {
  const root = mkdtempSync(join(tmpdir(), "wx-dependency-gate-"));
  const bin = join(root, "bin");
  mkdirSync(bin);
  const fake = join(root, "npm-fixture.mjs");
  writeFileSync(fake, `
const mode=process.env.WX_GATE_FIXTURE;
if(process.argv[2]==="audit") {
  if(mode==="audit-unavailable") { console.log(JSON.stringify({error:{code:"ENETUNREACH"}})); process.exit(1); }
  if(mode==="audit-malformed") { console.log("unparseable"); process.exit(1); }
  console.log(JSON.stringify({metadata:{vulnerabilities:{critical:0,high:mode==="high-advisory"?1:0,moderate:0,low:0,info:0,total:mode==="high-advisory"?1:0}}}));
  process.exit(mode==="high-advisory"?1:0);
}
if(mode==="tree-unavailable") { console.log(JSON.stringify({error:{code:"ELSPROBLEMS"}})); process.exit(1); }
if(mode==="missing-license" || mode==="license-and") {
 console.log(JSON.stringify({dependencies:{"missing-license":{name:"missing-license",version:"1.0.0",path:process.env.WX_MISSING_PACKAGE}}}));
} else console.log(JSON.stringify({dependencies:{}}));
`);
  const missing = join(root, "missing-package");
  mkdirSync(missing);
  writeFileSync(join(missing, "package.json"), JSON.stringify({name:"missing-license",version:"1.0.0",...(mode==="license-and"?{license:"(MIT AND GPL-3.0-only)"}:{})}));
  if(process.platform==="win32") {
    writeFileSync(join(bin,"npm.cmd"), `@"${process.execPath}" "${fake}" %*\r\n`);
  } else {
    const shim=join(bin,"npm");
    writeFileSync(shim, `#!/bin/sh\nexec "${process.execPath}" "${fake}" "$@"\n`);
    chmodSync(shim,0o755);
  }
  try {
    const pathKey=Object.keys(process.env).find(k=>k.toLowerCase()==="path")??"PATH";
    const env={...process.env,[pathKey]:bin+(process.platform==="win32"?";":":")+process.env[pathKey],npm_execpath:fake,WX_GATE_FIXTURE:mode,WX_MISSING_PACKAGE:missing};
    return spawnSync(process.execPath,[gate],{cwd:root,env,encoding:"utf8",timeout:15000});
  } finally {
    assert.equal(dirname(root),resolve(tmpdir()));
    rmSync(root,{recursive:true,force:true});
  }
}

for(const mode of ["audit-unavailable","audit-malformed","tree-unavailable","missing-license","license-and"]) {
 test(`dependency gate fails closed when evidence is ${mode}`,()=>{
   const result=runFixture(mode);
   assert.equal(result.error,undefined);
   assert.equal(result.status,1, result.stdout+"\n"+result.stderr);
 });
}
test("dependency gate rejects a reported high advisory",()=>{
 const result=runFixture("high-advisory");
 assert.equal(result.status,1,result.stdout+"\n"+result.stderr);
});
test("dependency gate accepts complete clean evidence",()=>{
 const result=runFixture("clean");
 assert.equal(result.status,0,result.stdout+"\n"+result.stderr);
});
