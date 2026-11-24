/* DocQA: symbolic document QA. Regex extraction -> triple/frame KB -> rules + BFS search + inheritance. No NLP, no RAG. */
const SAMPLE=`# Solar System Fact Sheet
The Solar System is a planetary system. The Sun is a star.
## Planets
| Planet | Type | Moons | Diameter (km) | Day length (hours) |
|---|---|---|---|---|
| Mercury | Terrestrial | 0 | 4879 | 4222 |
| Venus | Terrestrial | 0 | 12104 | 2802 |
| Earth | Terrestrial | 1 | 12742 | 24 |
| Mars | Terrestrial | 2 | 6779 | 24.6 |
| Jupiter | Gas giant | 95 | 139820 | 9.9 |
| Saturn | Gas giant | 146 | 116460 | 10.7 |
| Uranus | Ice giant | 28 | 50724 | 17.2 |
| Neptune | Ice giant | 16 | 49244 | 16.1 |
## Terrestrial
Composition: Rock and metal
## Gas giant
Composition: Mostly hydrogen and helium
## Earth
Orbital period: 365.25 days
Earth has one natural satellite.
## Mars
Nickname: Red Planet
Orbital period: 687 days
Mars is a terrestrial planet.
Notable missions:
- Curiosity
- Perseverance
`;
const TESTS=[['What is the diameter of Mars?','6779','Attribute lookup'],['What is the nickname of Mars?','Red Planet','Attribute lookup'],['What is the orbital period of Earth?','365\\.25','Attribute lookup'],['What are the notable missions of Mars?','Curiosity.*Perseverance','Attribute lookup'],['How many moons does Jupiter have?','95','Counting'],['How many planets are there?','^8','Counting'],['List all planets','Mercury.*Neptune','Enumeration'],['Which planet has the most moons?','Saturn','Superlative'],['Which planet has the smallest diameter?','Mercury','Superlative'],['Which planets are gas giants?','Jupiter.*Saturn','Constraint filter'],['Which planets have more than 20 moons?','Jupiter.*Saturn.*Uranus','Constraint filter'],['Is Mars a terrestrial planet?','^Yes','Verification'],['Is Neptune a terrestrial planet?','^No\\b','Verification'],['Does Mercury have moons?','^No\\b','Verification'],['Compare Earth and Mars','12742[\\s\\S]*6779','Comparison'],['Define the Sun','star','Definition'],['What is the composition of Jupiter?','hydrogen','Inference'],['What is the composition of Earth?','rock','Inference'],['What is the capital of Mars?','could not find','Unanswerable'],['Who discovered Venus?','could not find','Unanswerable']];
const COURSE=`# AI Course Handbook
Artificial Intelligence is a core subject.
## Course Details
Course code: AID201A
Course title: Artificial Intelligence
Course leader: M Tanushri
Department: Computer Science and Engineering
Programme: B. Tech.
Semester: 3
## Assessment
Component: CET A Assignment
Total marks: 15
Report limit: 6 pages
Report format: IEEE
## Course Outcomes
| Outcome | Verb | Area |
|---|---|---|
| CO-1 | Describe | concepts of AI, intelligent agents, knowledge representation, search, learning, reasoning and planning |
| CO-2 | Apply | principles of knowledge representation, search, learning, reasoning and planning to design intelligent agents |
| CO-3 | Analyze | scenarios to identify strategies for knowledge representation, search, learning, reasoning and planning |
| CO-4 | Evaluate | the performance of intelligent agents using performance measures |
| CO-5 | Design | AI models and applications for real-world problems |
`;
const CTESTS=[['What is the course code?','AID201A','Slot search'],['Who is the course leader?','Tanushri','Slot search'],['What is the semester?','3','Slot search'],['What is the programme?','B\\. Tech','Slot search'],['What is the report limit?','6 pages','Slot search'],['What are the total marks?','15','Slot search'],['What is the area of CO-3?','strategies','Attribute lookup'],['What is the verb of CO-4?','Evaluate','Attribute lookup'],['List all course outcomes','CO-1.*CO-5','Enumeration'],['How many course outcomes are there?','^5','Counting'],['Which course outcomes involve Evaluate?','CO-4','Constraint filter'],['Compare CO-1 and CO-5','Describe[\\s\\S]*Design','Comparison'],['What is the exam date?','could not find','Unanswerable'],['Who teaches databases?','could not find','Unanswerable']];
const SAMPLES={solar:[SAMPLE,TESTS],course:[COURSE,CTESTS]};
let KB=null;const RES=new Set(['is','has','part of']),STOP=new Set('what is are was were the a an of who define describe tell me about please give show does do which how many much there'.split(' '));
const esc=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),nk=s=>s.replace(/\(.*?\)/g,'').trim().toLowerCase();
const of=(e,a)=>KB.F.filter(f=>f.s==e&&f.p==a),kids=e=>KB.F.filter(f=>f.p=='part of'&&f.v.toLowerCase()==e).map(f=>f.s),nm=k=>KB.E.get(k)||k,fmt=f=>f.v+(f.u?' '+f.u:'');

function build(text){ // E1-E5 extraction rules
 const F=[],E=new Map(),stack=[];let cur='Document',hdr=null,lk=null;E.set('document','Document');
 const add=(s,p,v,ln,u='')=>{s=s.replace(/^(the|a|an)\s+/i,'').trim();v=String(v).trim();if(!s||!v)return;const k=s.toLowerCase();if(!E.has(k))E.set(k,s);
  let n=null;const m=v.match(/^(-?\d[\d,]*(?:\.\d+)?)\s*([A-Za-z%°\/ ]{1,14})?$/);if(m){n=parseFloat(m[1].replace(/,/g,''));v=m[1];u=u||(m[2]||'').trim()}
  F.push({s:k,p:nk(p),pd:p.replace(/\s*\(.*?\)/g,'').trim(),v,u,n,ln})};
 text.split('\n').forEach((raw,i)=>{const l=raw.trim(),ln=i+1;let m;
  if(!l){lk=null;hdr=null;return}
  if(l[0]=='|'){const c=l.split('|').slice(1,-1).map(x=>x.trim());if(c.every(x=>/^:?-+:?$/.test(x)))return;if(!hdr){hdr=c;return}
   add(c[0],'part of',cur,ln);c.slice(1).forEach((x,j)=>{const h=hdr[j+1]||'';add(c[0],h,x,ln,(h.match(/\((.*?)\)/)||[])[1]||'')});return}
  hdr=null;
  if(m=l.match(/^(#+)\s+(.*)/)){const lv=m[1].length,par=stack[lv-2];stack.length=Math.min(stack.length,lv-1);stack[lv-1]=m[2];cur=m[2];if(!E.has(cur.toLowerCase()))E.set(cur.toLowerCase(),cur);if(par)add(cur,'part of',par,ln);lk=null;return}
  if(m=l.match(/^([A-Za-z][A-Za-z0-9 ()\-]{0,40}):\s*(.*)$/)){if(m[2])add(cur,m[1],m[2],ln);else lk=m[1];return}
  if(m=l.match(/^[-*•]\s+(.*)/)){add(cur,lk||'items',m[1],ln);return}
  l.split(/(?<=\.)\s+/).forEach(s=>{let t;if(t=s.match(/^(.+?)\s+(is|are)\s+(.+?)\.?$/i))add(t[1],'is',t[3],ln);else if(t=s.match(/^(.+?)\s+(has|have)\s+(.+?)\.?$/i))add(t[1],'has',t[3],ln)})});
 const by=(a,b)=>b.length-a.length;
 KB={F,E,ents:[...E.keys()].sort(by),attrs:[...new Set(F.map(f=>f.p))].filter(p=>!RES.has(p)).sort(by),vals:[...new Set(F.filter(f=>f.n==null&&f.p!='part of'&&f.v.length<32).map(f=>f.v.toLowerCase()))].sort(by)};return KB}

function parse(q){let s=' '+q.toLowerCase().replace(/[?!,;]|\.(?=\s|$)/g,' ')+' '; // grounding = dictionary match on KB labels
 const grab=L=>{const o=[];for(const l of L){const m=new RegExp('(^|[^a-z0-9])'+esc(l)+'s?(?![a-z0-9])').exec(s);if(m){const i=m.index+m[1].length;o.push({l,i});s=s.slice(0,i)+' '.repeat(l.length)+s.slice(i+l.length)}}return o.sort((a,b)=>a.i-b.i).map(x=>x.l)};
 const e=grab(KB.ents),a=grab(KB.attrs),v=grab(KB.vals);return{e,a,v,res:s.split(/\s+/).filter(w=>w&&!STOP.has(w)&&!/^[\d.]+$/.test(w))}}

function lookup(e,a){const seen=new Set([e]),q=[[e,[]]]; // BFS over semantic network with inheritance
 while(q.length){const[x,path]=q.shift(),r=of(x,a);if(r.length)return{r,path};
  if(path.length<2)KB.F.filter(f=>f.s==x).forEach(f=>{const t=f.v.toLowerCase();if(KB.E.has(t)&&!seen.has(t)){seen.add(t);q.push([t,[...path,`${nm(x)} —${f.pd}→ ${nm(t)}`]])}})}
 return null}

function answer(q){const P=parse(q),ql=q.toLowerCase(),tr=[],{e:E,a:A,v:V}=P,names=x=>x.map(nm).join(', ')||'–';
 tr.push(`Grounding → entities: ${names(E)} | attributes: ${A.join(', ')||'–'} | values: ${V.join(', ')||'–'}`);
 const R=(a,rule,conf,f)=>({a,rule,conf,tr,src:f?'line '+f.ln:''}),grp=E.find(e=>kids(e).length),ks=grp?kids(grp):[],hm=/how many/.test(ql);
 const cmp=ql.match(/\b(more|greater|higher|larger|fewer|less|lower|smaller)\s+than\s+(-?\d+(?:\.\d+)?)/);
 if(/\b(compare|difference|versus|vs)\b/.test(ql)&&E.length>1){const[x,y]=E,ps=[...new Set(KB.F.filter(f=>(f.s==x||f.s==y)&&!RES.has(f.p)).map(f=>f.p))],g=(e,p)=>{const r=of(e,p);return r.length?r.map(fmt).join(', '):'—'};
  tr.push('R1 fired: gather union of slots of both frames and align them');
  return R(`Comparison of ${nm(x)} and ${nm(y)}:\n`+ps.map(p=>`• ${p}: ${nm(x)} = ${g(x,p)}; ${nm(y)} = ${g(y,p)}`).join('\n'),'R1 Frame comparison',.9,of(x,ps[0])[0])}
 const oth=[...E.filter(e=>e!=grp),...V];
 if(grp&&(cmp||oth.length)&&/\b(which|list|what|name|show|how many)\b/.test(ql)){let c=ks;
  if(cmp&&A.length){const up=/more|greater|higher|larger/.test(cmp[1]),t=+cmp[2];c=c.filter(k=>of(k,A[0]).some(f=>f.n!=null&&(up?f.n>t:f.n<t)));tr.push(`R3 fired: generate-and-test over ${ks.length} members of ${nm(grp)}: ${A[0]} ${up?'>':'<'} ${t}`)}
  oth.forEach(o=>{c=c.filter(k=>KB.F.some(f=>f.s==k&&f.v.toLowerCase().includes(o)));tr.push(`constraint: member has value “${o}”`)});
  return R(hm?`${c.length}${c.length?': '+c.map(nm).join(', '):''}`:c.length?c.map(nm).join(', '):'No member of '+nm(grp)+' satisfies the constraints.','R3 Constraint filtering (generate & test)',.9)}
 const sup=ql.match(/\b(highest|largest|biggest|most|longest|greatest|heaviest|maximum|lowest|smallest|least|shortest|fewest|lightest|minimum)\b/);
 if(sup&&A.length){const mx=/high|larg|big|most|long|great|heav|max/.test(sup[1]),c=KB.F.filter(f=>f.p==A[0]&&f.n!=null&&(!grp||ks.includes(f.s)));
  if(c.length){c.sort((x,y)=>mx?y.n-x.n:x.n-y.n);tr.push(`R2 fired: arg${mx?'max':'min'} over ${c.length} numeric “${A[0]}” facts`);return R(`${nm(c[0].s)} (${fmt(c[0])})`,'R2 Superlative (search over numeric facts)',.95,c[0])}}
 if(grp&&!A.length&&/\b(list|all|which|what are|name|show|how many)\b/.test(ql)){tr.push(`R4 fired: enumerate members of ${nm(grp)} via part-of links`);
  return R((hm?ks.length+': ':'')+ks.map(nm).join(', '),'R4 Enumeration / counting over part-of hierarchy',.9)}
 if(/^\s*(is|are|does|do|has|have|can|was|were)\b/.test(ql)&&E.length){const e=E[0],cs=[...E.slice(1),...V],ok=[];
  if(cs.length||A.length){cs.forEach(c=>KB.F.filter(f=>f.s==e&&f.p!='part of'&&f.v.toLowerCase().includes(c)).forEach(f=>ok.push(f)));
   A.forEach(a=>{const L=lookup(e,a);if(L&&L.r.some(f=>f.n!==0))ok.push(...L.r)});tr.push('R6 fired: match asserted value against the frame (closed-world assumption)');
   return R(ok.length?`Yes — ${nm(e)}: ${[...new Set(ok.map(f=>f.pd+' = '+fmt(f)))].join('; ')}`:`No — the Knowledge Base has no fact linking ${nm(e)} to ${[...cs,...A].join(', ')}.`,'R6 Verification (fact matching + closed-world assumption)',ok.length?.9:.7,ok[0])}}
 if(E.length&&!A.length&&!P.res.length&&/\b(define|describe)\b|^\s*(what|who)\s+(is|are|was)\b|tell me about/.test(ql)){const e=E[0],is=of(e,'is'),fr=KB.F.filter(f=>f.s==e&&!RES.has(f.p)).map(f=>`${f.pd}: ${fmt(f)}`);
  if(is.length||fr.length){tr.push('R7 fired: definition → is-a facts, then frame summary');return R((is.length?`${nm(e)} is ${is.map(f=>f.v).join('; ')}. `:'')+fr.join(' | '),'R7 Definition (is-a + frame)',.85,is[0])}}
 if(E.length&&A.length){const out=[];let inf=false,f0;
  E.forEach(e=>A.forEach(a=>{const L=lookup(e,a);if(L){const vs=L.r.map(fmt);out.push(`${nm(e)} — ${L.r[0].pd}: ${vs.join(', ')}`+(hm&&vs.length>1&&L.r[0].n==null?` (count = ${vs.length})`:''));f0=f0||L.r[0];if(L.path.length){inf=true;tr.push('Not a direct slot → inferred via '+L.path.join('; '))}else tr.push(`Direct slot found: ${nm(e)}.${a}`)}}));
  if(out.length)return R(out.join('\n'),inf?'R8 BFS graph search + property inheritance':'R8 Attribute lookup (frame slot)',inf?.8:.95,f0)}
 if(!E.length&&A.length&&!P.res.length){const f=KB.F.filter(f=>f.p==A[0]);if(f.length){tr.push('R8b fired: no entity named → search every frame for slot “'+A[0]+'”');return R(f.slice(0,5).map(x=>`${nm(x.s)} — ${x.pd}: ${fmt(x)}`).join('\n'),'R8b Slot search across all frames',f.length==1?.9:.6,f[0])}}
 const sc=KB.F.map(f=>({f,s:(E.includes(f.s)?2:0)+(A.includes(f.p)?2:0)+(V.includes(f.v.toLowerCase())?1:0)})).filter(x=>x.s>=2).sort((a,b)=>b.s-a.s).slice(0,3),rel=sc.map(x=>`${nm(x.f.s)} — ${x.f.pd}: ${fmt(x.f)}`).join('\n');
 tr.push('No reasoning rule produced an answer; fallback ranks facts by grounded-label overlap');
 if(P.res.length||!sc.length)return R('I could not find an answer in the Knowledge Base.'+(P.res.length?` Unrecognised term(s): ${P.res.join(', ')}.`:'')+(rel?'\nRelated facts:\n'+rel:''),'R9 Abstain (closed-world assumption)',0);
 return R('Closest facts (low confidence):\n'+rel,'R9 Fallback by label overlap',.4,sc[0].f)}

function evaluate(T){const rows=T.map(([q,x,t='General'])=>{const t0=performance.now(),r=answer(q),ms=performance.now()-t0;return{q,x,t,a:r.a,ab:/could not find/.test(r.a),ok:(()=>{try{return new RegExp(x,'i').test(r.a)}catch(e){return r.a.toLowerCase().includes(x.toLowerCase())}})(),ms}});
 const N=rows.length,ok=rows.filter(r=>r.ok).length,an=rows.filter(r=>!r.ab),by={};rows.forEach(r=>{by[r.t]=by[r.t]||[0,0];by[r.t][0]++;by[r.t][1]+=r.ok?1:0});
 return{rows,N,acc:ok/N,cov:an.length/N,prec:an.length?an.filter(r=>r.ok).length/an.length:0,by,ms:rows.reduce((s,r)=>s+r.ms,0)/N}}

if(typeof document!=='undefined'&&document.getElementById('doc')){const $=s=>document.querySelector(s),H=s=>String(s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
 const load=k=>{$('#doc').value=SAMPLES[k][0];$('#tests').value=SAMPLES[k][1].map(t=>t.join(' => ')).join('\n');bui();$('#chips').innerHTML=SAMPLES[k][1].slice(0,20).map(t=>`<button class="chip">${H(t[0])}</button>`).join('');document.querySelectorAll('.chip').forEach(c=>c.onclick=()=>ask(c.textContent));$('#out').innerHTML=''};
 const tab=t=>document.querySelectorAll('nav button,.tab').forEach(x=>x.classList.toggle('on',x.dataset.t==t||x.id==t));document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>tab(b.dataset.t));
 const bui=()=>{build($('#doc').value);$('#stats').innerHTML=[['Entities',KB.ents.length],['Facts',KB.F.length],['Attributes',KB.attrs.length]].map(([k,v])=>`<div class="tile"><b>${v}</b>${k}</div>`).join('');
  $('#facts').innerHTML='<tr><th>Subject<th>Predicate<th>Value<th>Line</tr>'+KB.F.slice(0,400).map(f=>`<tr><td>${H(nm(f.s))}<td>${H(f.pd)}<td>${H(fmt(f))}<td>${f.ln}</tr>`).join('')};
 const ask=q=>{if(!q.trim())return;$('#q').value=q;const r=answer(q);$('#out').innerHTML=`<div class="ans">${H(r.a)}</div><p class="meta"><b>${H(r.rule)}</b> · confidence ${Math.round(r.conf*100)}%${r.src?' · source: '+r.src:''}</p><b>Reasoning trace</b><ol>${r.tr.map(t=>`<li>${H(t)}</li>`).join('')}</ol>`};
 $('#sam').onchange=e=>load(e.target.value);
 $('#build').onclick=bui;$('#go').onclick=()=>ask($('#q').value);$('#q').onkeydown=e=>{if(e.key=='Enter')ask($('#q').value)};
 $('#file').onchange=e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=()=>{let t=r.result;if(/\.csv$/i.test(f.name))t='# '+f.name.replace(/\.csv$/i,'')+'\n## Records\n'+t.trim().split(/\r?\n/).map(l=>'|'+l.split(',').join('|')+'|').join('\n');$('#doc').value=t;bui()};r.readAsText(f)};
 $('#run').onclick=()=>{const T=$('#tests').value.split('\n').map(l=>l.split(' => ').map(s=>s.trim())).filter(a=>a.length>=2),m=evaluate(T);
  $('#metrics').innerHTML=[['Accuracy',m.acc],['Coverage',m.cov],['Precision',m.prec]].map(([k,v])=>`<div class="tile"><b>${Math.round(v*100)}%</b>${k}</div>`).join('')+`<div class="tile"><b>${m.ms.toFixed(2)} ms</b>Avg latency</div>`;
  $('#bytype').innerHTML='<tr><th>Question type<th>Passed</tr>'+Object.entries(m.by).map(([k,[n,p]])=>`<tr><td>${H(k)}<td>${p}/${n}</tr>`).join('');
  $('#res').innerHTML='<tr><th><th>Question<th>System answer<th>Expected</tr>'+m.rows.map(r=>`<tr class="${r.ok?'pass':'fail'}"><td>${r.ok?'✔':'✘'}<td>${H(r.q)}<td>${H(r.a.split('\n')[0])}<td>${H(r.x)}</tr>`).join('')};
 load('solar')}
if(typeof module!=='undefined')module.exports={build,answer,evaluate,SAMPLE,TESTS};
