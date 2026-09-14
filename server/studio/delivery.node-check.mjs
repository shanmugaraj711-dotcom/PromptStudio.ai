import test from "node:test";
import assert from "node:assert/strict";
import { makeAcceptedRevision } from "./acceptedRevision.js";
import { enqueueDelivery, runDelivery, publicDelivery } from "./deliveryQueue.js";
import { deliveryFiles } from "./deliveryBundle.js";

const uid = "customer";
const id = "job-12345678901234567890";
const files = {"/App.js": 'export default function App(){return <h1>Accepted customer edit</h1>}', "/styles.css": "h1{color:blue}"};
const revision = makeAcceptedRevision({uid, studioJobId:id, job:{uid,status:"ready",spec:{title:"Original"},renderer:"landing-page-v1"},files});
const payment = {uid,studioJobId:id,studioBuildRequestId:id,acceptedRevisionId:revision.revisionId,status:"PAID"};
function database() {
  const data = new Map([["studioBuildPayments/"+id, payment],["studioAcceptedRevisions/"+revision.revisionId, revision]]);
  let tail = Promise.resolve();
  const ref = (key) => ({key,get:async()=>snap({key})});
  const snap = (ref) => ({exists:data.has(ref.key),data:()=>structuredClone(data.get(ref.key))});
  const db = {data,collection:(name)=>({doc:(id)=>ref(name+"/"+id)}),runTransaction:(fn)=>{
    const result=tail.then(async()=>{
      const writes=[];
      const value=await fn({get:async(ref)=>snap(ref),create:(ref,value)=>{assert.equal(data.has(ref.key),false);writes.push([ref.key,value]);},update:(ref,value)=>writes.push([ref.key,{...data.get(ref.key),...value}])});
      for(const [key,value] of writes)data.set(key,structuredClone(value));
      return value;
    });tail=result.catch(()=>{});return result;
  }};return db;
}
test("paid delivery advances from frozen source to a verified public URL",async()=>{
  const db=database(); let time=1000; let submitted=0;
  await db.runTransaction(tx=>enqueueDelivery(tx,db,payment,revision));
  const provider={projectId:"existing-project",submit:async(job,source)=>{submitted++;assert.deepEqual(source.files,files);return{id:"deployment-1"};},inspect:async()=>({state:"READY",url:"site.vercel.app"}),verify:async(job)=>{assert.equal(job.acceptedRevisionId,revision.revisionId);return"https://site.vercel.app";}};
  await runDelivery({db,deliveryId:id,provider,now:()=>time});
  assert.equal(db.data.get("studioDeliveries/"+id).state,"BUILDING");
  time+=20000;
  await runDelivery({db,deliveryId:id,provider,now:()=>time});
  assert.equal(publicDelivery(db.data.get("studioDeliveries/"+id)).liveUrl,"https://site.vercel.app");
  assert.equal(submitted,1);
});
test("failed public verification never exposes a live URL",async()=>{
  const db=database();let time=1000;
  await db.runTransaction(tx=>enqueueDelivery(tx,db,payment,revision));
  const provider={projectId:"existing-project",submit:async()=>({id:"deployment-1"}),inspect:async()=>({state:"READY",url:"site.vercel.app"}),verify:async()=>{throw new Error("Protected deployment");}};
  await runDelivery({db,deliveryId:id,provider,now:()=>time});time+=20000;
  await runDelivery({db,deliveryId:id,provider,now:()=>time});
  assert.equal(publicDelivery(db.data.get("studioDeliveries/"+id)).liveUrl,null);
  assert.equal(db.data.get("studioDeliveries/"+id).state,"VERIFYING");
});
test("uncertain submission recovers the deployment instead of submitting again",async()=>{
  const db=database();let time=1000;let submissions=0;
  await db.runTransaction(tx=>enqueueDelivery(tx,db,payment,revision));
  const provider={projectId:"existing-project",submit:async()=>{submissions++;throw new Error("timeout");},recover:async()=>({id:"existing-deployment"})};
  await runDelivery({db,deliveryId:id,provider,now:()=>time});time+=40000;
  await runDelivery({db,deliveryId:id,provider,now:()=>time});
  assert.equal(submissions,1);assert.equal(db.data.get("studioDeliveries/"+id).deploymentId,"existing-deployment");
});
test("unpaid deliveries cannot reach the deployment provider",async()=>{
  const db=database();await db.runTransaction(tx=>enqueueDelivery(tx,db,payment,revision));
  db.data.set("studioBuildPayments/"+id,{...payment,status:"PAYMENT_PENDING"});
  await runDelivery({db,deliveryId:id,provider:{submit:async()=>assert.fail("unpaid deployment")},now:()=>1000});
  assert.equal(db.data.get("studioDeliveries/"+id).attempts,1);
});
test("customer bundle contains edited source and a revision marker, not a regenerated spec",()=>{
  const bundle=Object.fromEntries(deliveryFiles(revision).map(f=>[f.file,f.data]));
  assert.equal(bundle["App.js"],files["/App.js"]);
  assert.match(bundle["build.mjs"],new RegExp(revision.revisionId));
  assert.equal(JSON.parse(bundle["vercel.json"]).outputDirectory,"dist");
});
