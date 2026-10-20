import assert from 'node:assert/strict';
import {freshState,clusteredDesign,metrics,canPlace,addBlock,benchmark,deliver,unlock,restore,CONTRACTS} from './dist/engine.mjs';
const s=freshState();
assert(metrics(s).valid,'starter architecture must be viable');
assert(metrics(s).score>=CONTRACTS[0].score&&metrics(s).power<=CONTRACTS[0].power,'starter can complete first contract');
assert(!canPlace(s,'shader',1,2),'modules cannot overlap');
assert(!canPlace(s,'cache',15,10),'modules cannot exceed die boundary');
assert(canPlace(s,'shader',0,0)===false,'memory controller overlap is blocked');
assert(!canPlace(s,'shader',NaN,0),'invalid coordinates rejected');
assert(!addBlock(s,'unknown',2,2),'unknown modules rejected');
assert(deliver(s).error,'untested chip cannot be delivered');
const run=benchmark(s);assert(!run.error&&run.score>0);assert.equal(s.rp,135,'novel design earns research');
benchmark(s);assert.equal(s.rp,135,'repeat layout does not farm research');
const before=s.cash;const reward=deliver(s);assert(!reward.error);assert.equal(s.cash,before+reward.reward);assert.equal(s.contract,1);
assert(deliver(s).error,'same run cannot be paid twice');
assert(unlock(s,7),'first contract research unlocks 7 nm');assert(!unlock(s,7),'already unlocked research cannot be repurchased');assert(!unlock(s,3),'research must be sequential');
const a=metrics(s);s.process=7;const b=metrics(s);assert(b.power<a.power&&b.area<a.area,'advanced process reduces power and area');
const sample=freshState();benchmark(sample);sample.blocks.pop();assert(deliver(sample).error,'edited architecture must be tested again');
assert(restore(JSON.stringify(s)),'valid saved game restores');assert.equal(restore('{broken'),null);assert.equal(restore(JSON.stringify({...s,clock:99999})),null);assert.equal(restore(JSON.stringify({...s,blocks:[...s.blocks,s.blocks[0]]})),null);
const empty=freshState();empty.blocks=[];assert(benchmark(empty).error,'empty architecture cannot be tested');
const journey=freshState();for(let step=0;step<5;step++){
 if(step===1){assert(unlock(journey,7));journey.process=7;journey.clock=1600;journey.blocks.filter(v=>v.type==='tensor').forEach(v=>v.type='rt');journey.blocks.filter(v=>v.type==='shader'&&v.y===6&&v.x>10).forEach(v=>v.type='tensor');}
 if(step===2){Object.assign(journey,clusteredDesign());journey.clock=1800;journey.blocks.filter(v=>v.type==='shader').slice(-4).forEach(v=>v.type='tensor');}
 if(step===3){Object.assign(journey,clusteredDesign());journey.process=7;journey.clock=1400;}
 if(step===4){assert(unlock(journey,5),'5nm affordable by final contract');journey.process=5;journey.clock=2200;}
 const test=benchmark(journey);assert(!test.error);const delivery=deliver(journey);assert(!delivery.error,`contract ${step+1} must be attainable (score ${test.score}, power ${test.power})`);
}
assert.equal(journey.completed.length,5);assert(unlock(journey,3),'completing all contracts makes 3nm research affordable');console.log('All game checks passed: placement, progression, research, scoring, save validation and all five contracts.');console.log('Starter:',JSON.stringify({score:metrics(freshState()).score,tf:metrics(freshState()).tf,power:metrics(freshState()).power}));

