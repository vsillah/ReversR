#!/usr/bin/env node
const fs=require('fs'),path=require('path');
const {spawnSync}=require('child_process');
const gate=require('../utils/igesGeneralizationGate');
const reasonText=reason=>typeof reason==='string'?reason:`${reason.severity||'info'} / ${reason.component||'gate'}: ${reason.message||JSON.stringify(reason)}`;
(async()=>{
 const [command,file,arg,out]=process.argv.slice(2);
 if(command==='freeze'){gate.freezeGate(file,arg);console.log('Frozen experiment; no acceptance implied.');}
 else if(command==='accept-dev'){gate.acceptDev(file,arg);console.log('DEV review acceptance recorded; not app/production acceptance.');}
 else if(command==='reconcile'){gate.reconcileHistory(file);console.log('Historical exposure receipts appended; originals unchanged.');}
 else if(command==='run'){
  gate.loadExperiment(file);const destination=gate.privatePath(out);
  const result=spawnSync(process.execPath,['--max-old-space-size=1536',__filename,'_run',file,arg,destination],{encoding:'utf8',timeout:120000,killSignal:'SIGKILL',maxBuffer:20*1024*1024,env:{...process.env,IGES_GATE_CHILD_LIMIT:'120000'}});
  process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');
  if(result.error){fs.mkdirSync(destination,{recursive:true});fs.writeFileSync(path.join(destination,'execution-limit.json'),JSON.stringify({accepted:false,error:result.error.message,limitMs:120000,phase:arg}));}
  process.exitCode=result.status??1;
 }else if(command==='_run'){
  if(process.env.IGES_GATE_CHILD_LIMIT!=='120000')throw Error('Use the bounded run command');
  const report=await gate.runGate(file,arg,out,{resourceBounded:true});console.log(JSON.stringify({coverage:report.coverage,gateAccepted:false,executionStatus:report.executionStatus}));
  for(const asset of report.assets)console.log(asset.id,asset.status,asset.reasons.map(reasonText).join('; '));
  if(!report.coverage.eligibleAfterGates)process.exitCode=2;
 }else throw new Error('Usage: freeze manifest freeze | run freeze phase output | accept-dev freeze "review reason" | reconcile receipts');
})().catch(error=>{console.error(error);process.exitCode=1;});
