// Deterministic synthetic packet traffic on a directed 16 x 12 mesh.
// Packets advance at most one hop per cycle; each link has a FIFO and a
// finite service capacity. Module footprints are served by metal-layer routers.
export const FABRIC_MODEL='mesh-packets-v1';
export const WORKLOADS={balanced:{name:'均衡图形',shader:1,tensor:.55,rt:.7,memory:.7},raytrace:{name:'光追渲染',shader:.9,tensor:.35,rt:1.8,memory:1.15},ai:{name:'AI 推理',shader:.65,tensor:2.1,rt:.1,memory:1.5}};
const fabricClamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const fabricRound=(n,d=2)=>+n.toFixed(d);
export function meshPath(from,to){if(![from,to].every(p=>p&&Number.isInteger(p.x)&&Number.isInteger(p.y)&&p.x>=0&&p.x<16&&p.y>=0&&p.y<12))throw new Error('Mesh endpoints must be integer coordinates inside 16 x 12');const points=[{...from}];let x=from.x,y=from.y;while(x!==to.x){x+=Math.sign(to.x-x);points.push({x,y});}while(y!==to.y){y+=Math.sign(to.y-y);points.push({x,y});}return points;}

export function simulateTraffic(input,{cycles=192,warmup=48,capacity=3}={}){
 if(!Number.isInteger(cycles)||cycles<16||cycles>512||!Number.isInteger(warmup)||warmup<0||warmup>128||!Number.isInteger(capacity)||capacity<1||capacity>32)throw new Error('Invalid network simulation settings');
 const links=new Map();
 const flows=input.map((source,index)=>{if(!Number.isFinite(source.rate)||source.rate<0||source.rate>128)throw new Error('Invalid flow rate');const points=meshPath(source.from,source.to),path=[];for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],key=`${a.x},${a.y}>${b.x},${b.y}`;if(!links.has(key))links.set(key,{key,from:a,to:b,queue:[],head:0,served:0,offered:0,queueSum:0,maxQueue:0});const link=links.get(key);link.offered+=source.rate;path.push(link);}return {...source,index,points,path,acc:(index*.618033988749895)%1,sent:0,delivered:0,latencySum:0,hops:points.length-1};});
 const edges=[...links.values()];const total=warmup+cycles;
 for(let t=0;t<total;t++){
  const arrivals=[];
  // Stage all arrivals before enqueueing: iteration order cannot move a packet
  // across multiple routers in the same cycle.
  for(const edge of edges){let slots=capacity;while(slots--&&edge.head<edge.queue.length){const packet=edge.queue[edge.head++],flow=flows[packet.flow];if(t>=warmup)edge.served++;packet.step++;if(packet.step===flow.path.length){if(packet.born>=warmup){flow.delivered++;flow.latencySum+=t-packet.born+2;}}else arrivals.push({edge:flow.path[packet.step],packet});}if(edge.head>256&&edge.head*2>edge.queue.length){edge.queue=edge.queue.slice(edge.head);edge.head=0;}}
  for(const flow of flows){flow.acc+=flow.rate;const count=Math.floor(flow.acc+1e-10);flow.acc-=count;for(let j=0;j<count;j++){if(t>=warmup)flow.sent++;if(!flow.path.length){if(t>=warmup){flow.delivered++;flow.latencySum+=2;}}else arrivals.push({edge:flow.path[0],packet:{flow:flow.index,step:0,born:t}});}}
  for(const {edge,packet}of arrivals)edge.queue.push(packet);
  if(t>=warmup)for(const edge of edges){const waiting=edge.queue.length-edge.head;edge.queueSum+=waiting;edge.maxQueue=Math.max(edge.maxQueue,waiting);}
 }
 const reportLinks=edges.map(e=>({key:e.key,from:e.from,to:e.to,offered:fabricRound(e.offered,4),load:e.offered/capacity,utilization:e.served/(cycles*capacity),avgQueue:e.queueSum/cycles,maxQueue:e.maxQueue,backlog:e.queue.length-e.head,transfers:e.served}));
 const byKey=new Map(reportLinks.map(l=>[l.key,l]));
 const reportFlows=flows.map(f=>{const queueDelay=f.path.reduce((n,e)=>{const l=byKey.get(e.key);return n+Math.max(0,l.avgQueue-l.offered)/Math.max(.05,Math.min(capacity,l.offered));},0);const latency=f.hops+2+queueDelay;const drainCorrection=Math.max(.1,1-f.hops/cycles);const completion=f.sent?Math.min(1,f.delivered/(f.sent*drainCorrection)):1;const efficiency=1/(1+f.hops*.012+queueDelay*.014+(1-completion)*.35);return {fromId:f.fromId,toId:f.toId,owner:f.owner,kind:f.kind,from:f.from,to:f.to,points:f.points,rate:f.rate,hops:f.hops,queueDelay,latency,observedLatency:f.delivered?f.latencySum/f.delivered:latency,efficiency,completion,sent:f.sent,delivered:f.delivered};});
 const weighted=(items,get)=>{const weight=items.reduce((n,f)=>n+f.rate,0);return weight?items.reduce((n,f)=>n+get(f)*f.rate,0)/weight:0;};
 const distance=weighted(reportFlows,f=>f.hops),latency=weighted(reportFlows,f=>f.latency),queueDelay=weighted(reportFlows,f=>f.queueDelay),efficiency=reportFlows.length?weighted(reportFlows,f=>f.efficiency):1;
 const classes={};for(const type of ['shader','tensor','rt']){const local=reportFlows.filter(f=>f.owner===type||f.owner==='memory'||f.owner==='command');classes[type]=local.length?weighted(local,f=>f.efficiency):1;}
 const hot=reportLinks.filter(l=>l.load>=.85||l.avgQueue>3).sort((a,b)=>b.avgQueue-a.avgQueue||b.load-a.load||a.key.localeCompare(b.key));
 const physical=new Set(reportLinks.map(l=>[`${l.from.x},${l.from.y}`,`${l.to.x},${l.to.y}`].sort().join('|')));
 return {model:FABRIC_MODEL,cycles,warmup,capacity,links:reportLinks,flows:reportFlows,avgDistance:distance,avgLatency:latency,queueDelay,efficiency,classes,peakLoad:Math.max(0,...reportLinks.map(l=>l.load)),peakUtilization:Math.max(0,...reportLinks.map(l=>l.utilization)),congestedLinks:reportLinks.filter(l=>l.load>1||l.avgQueue>3).length,hotspots:hot.slice(0,5),wireLength:physical.size,wirePower:Math.round(reportLinks.reduce((n,l)=>n+l.transfers,0)/cycles*.045),injected:reportFlows.reduce((n,f)=>n+f.sent,0),delivered:reportFlows.reduce((n,f)=>n+f.delivered,0),backlog:reportLinks.reduce((n,l)=>n+l.backlog,0)};
}

const fabricCache=new Map();
export function simulateFabric(blocks,modules,{clock=1500,workload='balanced'}={}){
 const profile=WORKLOADS[workload]??WORKLOADS.balanced;
 const ordered=[...blocks].sort((a,b)=>a.type.localeCompare(b.type)||a.x-b.x||a.y-b.y||Number(a.rot)-Number(b.rot));
 const key=JSON.stringify({blocks:ordered,clock,workload});if(fabricCache.has(key))return fabricCache.get(key);
 const nodes=ordered.map(b=>{const m=modules[b.type],w=b.rot?m.h:m.w,h=b.rot?m.w:m.h;return {...b,port:{x:fabricClamp(Math.floor(b.x+w/2),0,15),y:fabricClamp(Math.floor(b.y+h/2),0,11)}};});
 const caches=nodes.filter(n=>n.type==='cache'),memories=nodes.filter(n=>n.type==='memory'),commands=nodes.filter(n=>n.type==='command'),actors=nodes.filter(n=>['shader','tensor','rt'].includes(n.type));
 const dist=(a,b)=>Math.abs(a.port.x-b.port.x)+Math.abs(a.port.y-b.port.y);
 const nearest=(a,list)=>[...list].sort((b,c)=>dist(a,b)-dist(a,c)||b.port.x-c.port.x||b.port.y-c.port.y)[0];
 const flows=[],assigned=new Map(caches.map(c=>[c.id,0])),freq=clock/1500;
 const add=(a,b,rate,owner,kind)=>{if(a&&b&&rate>0)flows.push({from:a.port,to:b.port,fromId:a.id,toId:b.id,rate:rate*freq,owner,kind});};
 for(const actor of actors){const hub=nearest(actor,caches.length?caches:memories),weight=profile[actor.type];const data=actor.type==='shader'?.36:actor.type==='tensor'?.6:.5;add(actor,hub,.10*weight,actor.type,'request');add(hub,actor,data*weight,actor.type,'data');if(hub?.type==='cache')assigned.set(hub.id,assigned.get(hub.id)+weight);const cp=nearest(actor,commands);add(cp,actor,.035*weight,'command','dispatch');}
 for(const cache of caches){const mc=nearest(cache,memories),clients=assigned.get(cache.id);add(cache,mc,clients*.07*profile.memory,'memory','miss');add(mc,cache,clients*.16*profile.memory,'memory','refill');}
 const result={...simulateTraffic(flows),workload,profileName:profile.name};
 fabricCache.set(key,result);if(fabricCache.size>36)fabricCache.delete(fabricCache.keys().next().value);return result;
}
export function compactFabric(f){return {model:f.model,workload:f.workload,profileName:f.profileName,cycles:f.cycles,capacity:f.capacity,avgDistance:fabricRound(f.avgDistance),avgLatency:fabricRound(f.avgLatency),queueDelay:fabricRound(f.queueDelay),efficiency:fabricRound(f.efficiency,4),classes:{...f.classes},peakLoad:fabricRound(f.peakLoad,4),peakUtilization:fabricRound(f.peakUtilization,4),congestedLinks:f.congestedLinks,wireLength:f.wireLength,wirePower:f.wirePower,injected:f.injected,delivered:f.delivered,backlog:f.backlog};}
