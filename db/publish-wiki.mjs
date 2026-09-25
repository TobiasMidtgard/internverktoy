// Source-controlled learning articles. Dry-run by default; --apply publishes atomically.
// Existing employee edits are protected by a last-published digest or an exact seed match.
import {readFileSync,writeFileSync,readdirSync,mkdirSync,renameSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import pg from 'pg';
const ROOT=resolve(fileURLToPath(new URL('..',import.meta.url)));
const DIR=resolve(ROOT,'content/wiki'),LEDGER=resolve(DIR,'published.json');
const seeds={
 'reservedeler-og-passform':['d427a57a-eda5-410c-927f-ac72086332e1','Bildeler'],
 'barneseter-og-passform':['003eb507-157b-4aca-8761-c9977c4ab9e8','Barneseter'],
 'bilvask-og-kjemi':['1223624a-5345-411f-b1ff-d909f79a4d6c','Bilvask'],
 'sykkel-valg-og-storrelse':['e8dea36d-eb2a-4c1e-9afd-5330ae504f86','Sykkel'],
 'takstativ-og-taklast':['8bb9115d-115c-473c-8aab-e20f06fc36e0','Takstativ'],
 'takboks-og-sykkeltransport':['4f748672-b23a-4ab7-81d0-a86432ca7ae7','Takbokser'],
 'vindusviskere':['3baa6b85-5108-4d37-bcf7-fde3d1a89178','Vindusviskere'],
 'mc-og-scooter':['254fa263-a940-4b17-8737-a1caf48f0021','MC'],
 'verktoy-og-forbruk':['1b2a9598-6656-47df-9518-08c24fea1ee5','Verktøy']
};
export function articleId(slug){
 if(slug==='bilpaerer')return '72450126-ade6-4c8c-8183-5858abbadaae';
 if(Object.hasOwn(seeds,slug))return seeds[slug][0];
 const namespace=Buffer.from('6ba7b8119dad11d180b400c04fd430c8','hex');
 const hash=createHash('sha1').update(namespace).update('https://tobiasmidtgard.github.io/internverktoy/wiki/'+slug).digest();
 hash[6]=(hash[6]&15)|80;hash[8]=(hash[8]&63)|128;
 const h=hash.subarray(0,16).toString('hex');return [h.slice(0,8),h.slice(8,12),h.slice(12,16),h.slice(16,20),h.slice(20)].join('-');
}
export function payloadHash(a){
 const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
 return createHash('sha256').update(JSON.stringify(canonical({title:a.title,category:a.category,tags:a.tags,body:a.body,sources:a.sources}))).digest('hex');
}
export function isUntouchedSeed(a,category){
 const expected='## Kort om\n\nSkriv en kort innledning om '+category.toLowerCase()+'.\n\n## Viktig å vite\n\n- Punkt 1\n- Punkt 2\n\n## Vanlige spørsmål\n\n**Spørsmål?**\nSvar.\n\n## Gode kilder\n\nLegg til lenker under «Kilder».';
 return a.title==='Oversikt: '+category&&a.category===category&&a.body===expected&&a.guide==null&&Array.isArray(a.sources)&&a.sources.length===0&&JSON.stringify(a.tags)===JSON.stringify([category.toLowerCase()]);
}
export function readArticles(dir=DIR){
 const names=readdirSync(dir).filter(n=>n.endsWith('.metadata.json'));
 const available=new Set(names.map(name=>name.replace('.metadata.json','')));
 return names.map(name=>{
  const slug=name.replace('.metadata.json','');
  if(!/^[a-z0-9-]+$/.test(slug))throw new Error('Invalid slug: '+slug);
  const m=JSON.parse(readFileSync(resolve(dir,name),'utf8').replace(/^\uFEFF/,''));
  const text=readFileSync(resolve(dir,slug+'.md'),'utf8').replace(/^\uFEFF/,'').replace(/\r\n/g,'\n');
  if(!m.title||!m.category||text.split('\n')[0]!=='# '+m.title)throw new Error('Title/category mismatch: '+slug);
  if(!Array.isArray(m.tags)||!m.tags.length||!m.tags.every(t=>typeof t==='string'))throw new Error('Missing tags: '+slug);
  if(!Array.isArray(m.sources)||m.sources.length<1)throw new Error('Missing sources: '+slug);
  for(const s of m.sources){const u=new URL(s.url);if(u.protocol!=='https:'||u.username||u.password||!s.label)throw new Error('Invalid source: '+slug);}
  if(slug!=='bilpaerer'&&!/^2026-\d{2}-\d{2}$/.test(m.checked_at||''))throw new Error('Missing review date: '+slug);
  let body=text.replace(/^#.*\n/,'').trim();
  if(body.split(/\s+/).length<350||/Skriv en kort innledning|TODO|\bTBD\b/.test(body))throw new Error('Incomplete content: '+slug);
  body=body.replace(/\{\{article:([a-z0-9-]+)\}\}/g,(_,target)=>{
   if(!available.has(target))throw new Error('Unknown article link: '+target);
   return 'https://tobiasmidtgard.github.io/internverktoy/wiki.html?article='+articleId(target);
  });
  if(body.includes('{{article:'))throw new Error('Malformed article link: '+slug);
  return {slug,id:articleId(slug),title:m.title,category:m.category,tags:m.tags,body,sources:m.sources};
 });
}
async function main(){
 const apply=process.argv.includes('--apply'),all=readArticles();
 const ledger=existsSync(LEDGER)?JSON.parse(readFileSync(LEDGER,'utf8')):{};
 const cfg=process.env.PGHOST?{host:process.env.PGHOST,port:+(process.env.PGPORT||5432),user:process.env.PGUSER,password:process.env.PGPASSWORD,database:process.env.PGDATABASE||'postgres',ssl:{rejectUnauthorized:false}}:{connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}};
 const db=new pg.Client(cfg),plan=[],previous=[];
 try{
  await db.connect();await db.query('begin');await db.query("set local lock_timeout='5s';set local statement_timeout='30s'");
  for(const a of all){
   const existing=(await db.query('select * from public.wiki_articles where id=$1 for update',[a.id])).rows[0];
   const hash=payloadHash(a);let operation='insert';
   if(existing){
    const current=payloadHash(existing);
    if(existing.guide!=null)throw new Error('Refusing to replace a button sequence: '+a.slug);
    if(current===hash)operation='unchanged';
    else if(ledger[a.slug]?.digest===current||Object.hasOwn(seeds,a.slug)&&isUntouchedSeed(existing,seeds[a.slug][1]))operation='update';
    else throw new Error('Unmanaged or employee-edited article needs review: '+a.slug);
   }
   plan.push({slug:a.slug,id:a.id,operation});if(existing&&operation==='update')previous.push(existing);
  }
  if(!apply){await db.query('rollback');console.log(JSON.stringify({dryRun:true,plan},null,2));return;}
  if(previous.length){mkdirSync(resolve(ROOT,'db/backups'),{recursive:true});writeFileSync(resolve(ROOT,'db/backups/wiki-content-'+Date.now()+'.json'),JSON.stringify(previous,null,2));}
  for(let i=0;i<all.length;i++){
   const a=all[i],p=plan[i];
   if(p.operation==='insert')await db.query('insert into public.wiki_articles(id,title,category,tags,body,sources) values($1,$2,$3,$4,$5,$6::jsonb)',[a.id,a.title,a.category,a.tags,a.body,JSON.stringify(a.sources)]);
   if(p.operation==='update')await db.query('update public.wiki_articles set title=$2,category=$3,tags=$4,body=$5,sources=$6::jsonb,updated_at=now() where id=$1',[a.id,a.title,a.category,a.tags,a.body,JSON.stringify(a.sources)]);
   const back=(await db.query('select * from public.wiki_articles where id=$1',[a.id])).rows[0];
   if(payloadHash(back)!==payloadHash(a))throw new Error('Readback failed: '+a.slug);
   ledger[a.slug]={id:a.id,digest:payloadHash(a)};
  }
  await db.query('commit');
  writeFileSync(LEDGER+'.tmp',JSON.stringify(ledger,null,2)+'\n');renameSync(LEDGER+'.tmp',LEDGER);
  console.log(JSON.stringify({published:true,counts:Object.fromEntries(['insert','update','unchanged'].map(k=>[k,plan.filter(p=>p.operation===k).length])),verified:all.length},null,2));
 }catch(e){await db.query('rollback').catch(()=>{});throw e;}finally{await db.end();}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error(e.message||e.code||'Database connection failed');process.exitCode=1;});
