// Cooperative local integrity journal. Immutable receipts are authoritative;
// history.json is only a rebuildable index. No stale-lock bypass or retries.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert/strict');
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const createExposureStore=root=>{
  const lock=path.join(root,'freshness.lock');
  const withLock=callback=>{
    fs.mkdirSync(root,{recursive:true});let fd;
    try{fd=fs.openSync(lock,'wx');}catch(error){if(error.code==='EEXIST')throw Error('Exposure store busy: inspect owner; no stale-lock bypass');throw error;}
    try{fs.writeFileSync(fd,JSON.stringify({pid:process.pid,createdAt:new Date().toISOString()}));const result=callback();assert(!result?.then,'Exposure transaction must be synchronous');return result;}
    finally{fs.closeSync(fd);fs.unlinkSync(lock);}
  };
  const receipts=()=>{
    if(!fs.existsSync(root))return [];
    const files=fs.readdirSync(root).filter(f=>f.endsWith('-exposed.json')||f.endsWith('-reconciled.json'));
    const records=files.map(file=>({file,value:JSON.parse(fs.readFileSync(path.join(root,file)))}));
    const superseded=new Map(records.flatMap(r=>(r.value.supersedes||[]).map(s=>[s.file,s.sha256])));
    return records.filter(r=>!superseded.has(r.file)||superseded.get(r.file)!==sha(path.join(root,r.file))).map(r=>r.value);
  };
  const assertFreshUnlocked=sources=>{
    const records=receipts();
    for(const source of sources){
      assert(!records.some(r=>(r.sources||[]).some(old=>old.family===source.family||old.sourceSha256===source.sha256)||(r.sourceFamilies||[]).includes(source.family)),'Holdout family/source previously exposed');
    }
    assert(records.every(r=>Array.isArray(r.sources)&&r.sources.every(s=>s.family&&/^[a-f0-9]{64}$/.test(s.sourceSha256))),'Legacy exposure receipt needs reconciliation before freshness can be established');
  };
  const index=()=>fs.writeFileSync(path.join(root,'history.json'),JSON.stringify({authoritative:false,events:receipts().flatMap(r=>(r.sources||[]).map(s=>({...s,receiptId:r.id||r.experimentId,phase:r.phase})))},null,2));
  const writeReceipt=(file,value)=>{assert(path.basename(file)===file,'Unsafe receipt name');fs.writeFileSync(path.join(root,file),JSON.stringify(value,null,2),{flag:'wx'});index();return value;};
  return {
    withLock,
    assertFreshUnlocked,
    assertFresh:sources=>withLock(()=>assertFreshUnlocked(sources)),
    reserve:(receipt,requireFresh=false)=>withLock(()=>{
      if(requireFresh)assertFreshUnlocked(receipt.sources.map(s=>({family:s.family,sha256:s.sourceSha256})));
      assert(receipt.sources.every(s=>s.family&&/^[a-f0-9]{64}$/.test(s.sourceSha256)),'Exposure needs family and source hash');
      return writeReceipt(receipt.experimentId+'-'+receipt.phase+'-exposed.json',receipt);
    }),
    reconcile:receipt=>withLock(()=>{
      assert(receipt.sources.length&&receipt.sources.every(s=>s.family&&/^[a-f0-9]{64}$/.test(s.sourceSha256)),'Reconciliation needs sources');
      for(const old of receipt.supersedes||[]){assert(path.basename(old.file)===old.file);assert.equal(sha(path.join(root,old.file)),old.sha256,'Legacy receipt changed');}
      return writeReceipt(crypto.randomUUID()+'-reconciled.json',{...receipt,id:crypto.randomUUID(),reconciledAt:new Date().toISOString()});
    }),
    receipts,
  };
};
module.exports={createExposureStore};
