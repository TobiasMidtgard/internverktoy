/* Structured, private walkthroughs. No user-authored HTML is interpreted. */
(function(root){
  'use strict';
  const MAX_IMAGE=600*1024, MAX_GUIDE=6*1024*1024, MAX_STEPS=20;
  const kinds={keys:'Tastetrykk',click:'Klikk / trykk',doubleclick:'Dobbeltklikk',rightclick:'Høyreklikk',type:'Skriv tekst'};
  const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clone=value=>JSON.parse(JSON.stringify(value));
  const imageOK=value=>typeof value==='string' && value.length<=MAX_IMAGE && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value);
  const blankStep=()=>({title:'',kind:'keys',keys:'',label:'',description:'',result:'',image:null,marker:null});
  const blank=()=>({version:1,start:{description:'',image:null},steps:[blankStep()]});
  function validate(g){
    const fail=message=>{throw new Error(message);};
    if(!g || g.version!==1 || !g.start || !Array.isArray(g.steps) || g.steps.length<1 || g.steps.length>MAX_STEPS) fail('Sekvensen må ha et startpunkt og 1–20 steg.');
    if(new TextEncoder().encode(JSON.stringify(g)).length>MAX_GUIDE) fail('Sekvensen er for stor. Fjern noen bilder eller bruk mindre utsnitt.');
    const text=(v,max,label,required=false)=>{if(typeof v!=='string' || v.length>max || (required&&!v.trim())) fail(label);};
    const img=v=>{if(v!=null&&!imageOK(v)) fail('Et bilde er ugyldig eller for stort. Last det opp på nytt.');};
    text(g.start.description,2000,'Beskriv hvor man skal starte.',true); img(g.start.image);
    g.steps.forEach((s,i)=>{
      if(!s||!Object.hasOwn(kinds,s.kind)) fail('Velg en handling for steg '+(i+1)+'.');
      text(s.title,120,'Skriv en tittel på steg '+(i+1)+'.',true);
      text(s.keys,200,'Tastetrykket er for langt.',s.kind==='keys');
      text(s.label,200,'Skriv knappen eller teksten for steg '+(i+1)+'.',s.kind!=='keys');
      text(s.description,2000,'Forklaringen i steg '+(i+1)+' er for lang.');
      text(s.result,2000,'Resultatet i steg '+(i+1)+' er for langt.'); img(s.image);
      if(s.marker!=null && (!s.image || !Number.isFinite(s.marker.x) || !Number.isFinite(s.marker.y) || s.marker.x<0 || s.marker.x>100 || s.marker.y<0 || s.marker.y>100)) fail('Bildemarkeringen er ugyldig.');
      if(s.kind==='keys' && (s.keys.split('+').length>8 || s.keys.split('+').some(k=>!k.trim()))) fail('Skriv én tast eller en kombinasjon, for eksempel Ctrl+F7. Bruk «Pluss» for plusstasten.');
    });
    return g;
  }
  const keyNames={enter:['↵','Enter'],return:['↵','Enter'],tab:['⇥','Tab'],shift:['⇧','Shift'],esc:['','Esc'],escape:['','Esc'],backspace:['⌫','Backspace'],delete:['','Delete'],del:['','Delete'],space:['␣','Mellomrom'],mellomrom:['␣','Mellomrom'],up:['↑','Pil opp'],arrowup:['↑','Pil opp'],'pil opp':['↑','Pil opp'],down:['↓','Pil ned'],arrowdown:['↓','Pil ned'],'pil ned':['↓','Pil ned'],left:['←','Pil venstre'],arrowleft:['←','Pil venstre'],'pil venstre':['←','Pil venstre'],right:['→','Pil høyre'],arrowright:['→','Pil høyre'],'pil høyre':['→','Pil høyre'],ctrl:['','Ctrl'],alt:['','Alt'],pluss:['+','Pluss']};
  function keycaps(value){
    return '<span class="guide-keys">'+String(value).split('+').map(k=>{
      const raw=k.trim(), pair=keyNames[raw.toLowerCase()]||['',raw];
      return '<kbd class="guide-key">'+(pair[0]?'<span class="guide-key-symbol" aria-hidden="true">'+pair[0]+'</span>':'')+esc(pair[1])+'</kbd>';
    }).join('<span class="guide-plus" aria-label="og samtidig">+</span>')+'</span>';
  }
  function mouse(kind){
    return '<svg viewBox="0 0 24 28" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="4" y="2" width="16" height="24" rx="8"/><path d="M12 2v10M4 12h16"/><path d="'+(kind==='rightclick'?'M13 4q5 0 5 6h-5z':'M11 4q-5 0-5 6h5z')+'" fill="currentColor" stroke="none"/></svg>';
  }
  function action(s){
    if(s.kind==='keys') return '<div class="guide-action"><span>Trykk</span>'+keycaps(s.keys)+'</div>';
    if(s.kind==='type') return '<div class="guide-action"><span>Skriv</span><span class="guide-typed">'+esc(s.label)+'</span></div>';
    return '<div class="guide-action">'+mouse(s.kind)+'<span>'+({click:'Klikk / trykk',doubleclick:'Dobbeltklikk',rightclick:'Høyreklikk'}[s.kind])+'</span><span class="guide-button-symbol">'+esc(s.label)+'</span></div>';
  }
  function markerHTML(marker,n){
    return marker && Number.isFinite(marker.x) && Number.isFinite(marker.y) && marker.x>=0 && marker.x<=100 && marker.y>=0 && marker.y<=100?'<span class="guide-marker" style="left:'+marker.x+'%;top:'+marker.y+'%" aria-hidden="true">'+n+'</span>':'';
  }
  function figure(src,caption,marker,n){
    if(!imageOK(src)) return '';
    return '<figure class="guide-figure"><button type="button" class="guide-picture" data-guide-zoom aria-label="Forstørr: '+esc(caption)+'"><img src="'+src+'" alt="'+esc(caption)+'" loading="lazy" decoding="async">'+markerHTML(marker,n)+'</button><figcaption>'+esc(caption)+(marker?' · Gult merke viser et viktig punkt.':'')+' · Trykk på bildet for større visning.</figcaption></figure>';
  }
  function render(g){
    if(g==null) return '';
    try{validate(g);}catch{return '<p class="note">Denne knappesekvensen kan ikke vises. Åpne den i editoren for å kontrollere innholdet.</p>';}
    return '<section class="guide" aria-label="Knappesekvens"><div class="guide-kicker">Knappesekvens · '+g.steps.length+' steg</div><section class="guide-start"><div class="guide-kicker">Start her</div><h3>Før du begynner</h3><p>'+esc(g.start.description)+'</p>'+figure(g.start.image,'Startbildet',null,0)+'</section>'+g.steps.map((s,i)=>'<section class="guide-step"><div class="guide-step-head"><span class="guide-number" aria-label="Steg '+(i+1)+'">'+(i+1)+'</span><h3>'+esc(s.title)+'</h3></div>'+action(s)+(s.description?'<p>'+esc(s.description)+'</p>':'')+(s.result?'<div class="guide-result"><strong>Etter dette steget</strong><p>'+esc(s.result)+'</p></div>':'')+figure(s.image,'Etter steg '+(i+1)+': '+s.title,s.marker,i+1)+'</section>').join('')+'<p class="guide-finish">✓ Du har nå fulgt alle '+g.steps.length+' stegene.</p></section>';
  }
  function zoom(button){
    const doc=button.ownerDocument, previous=doc.activeElement;
    const d=doc.createElement('dialog'); d.className='guide-zoom fit'; d.setAttribute('aria-label','Forstørret skjermbilde');
    d.innerHTML='<div class="guide-zoom-head"><strong>Skjermbilde</strong><button type="button" class="btn ghost" data-size>Vis originalstørrelse</button><button type="button" class="btn" data-close>Lukk bilde</button></div><div class="guide-zoom-scroll"></div>';
    const picture=button.cloneNode(true); picture.removeAttribute('data-guide-zoom'); picture.removeAttribute('data-marking');
    const frame=doc.createElement('div'); frame.className='guide-picture'; frame.innerHTML=picture.innerHTML;
    d.querySelector('.guide-zoom-scroll').append(frame); doc.body.append(d);
    d.querySelector('[data-close]').onclick=()=>d.close();
    d.querySelector('[data-size]').onclick=e=>{d.classList.toggle('fit');e.target.textContent=d.classList.contains('fit')?'Vis originalstørrelse':'Tilpass bredden';};
    d.addEventListener('keydown',e=>{if(e.key==='Escape')e.stopPropagation();});
    d.addEventListener('close',()=>{d.remove();if(previous&&previous.isConnected)previous.focus();},{once:true}); d.showModal();
  }
  function mountReader(host){
    if(host.dataset.guideReader) return;
    host.dataset.guideReader='true';
    host.addEventListener('click',e=>{const b=e.target.closest('[data-guide-zoom]');if(b&&!b.hasAttribute('data-marking'))zoom(b);});
  }
  async function compress(file){
    if(!file || !['image/png','image/jpeg','image/webp'].includes(file.type)) throw new Error('Velg et PNG-, JPEG- eller WebP-bilde.');
    if(file.size>20*1024*1024) throw new Error('Bildet er større enn 20 MB. Bruk et mindre utsnitt.');
    const url=URL.createObjectURL(file), img=new Image();
    try{
      await new Promise((ok,no)=>{img.onload=ok;img.onerror=()=>no(new Error('Bildet kunne ikke leses. Prøv en annen fil.'));img.src=url;});
      if(!img.naturalWidth || img.naturalWidth*img.naturalHeight>40000000) throw new Error('Bildet har for høy oppløsning. Bruk et mindre utsnitt.');
      let size=Math.min(1,1800/Math.max(img.naturalWidth,img.naturalHeight));
      const canvas=document.createElement('canvas');
      for(let attempt=0;attempt<6;attempt++){
        canvas.width=Math.max(1,Math.round(img.naturalWidth*size));canvas.height=Math.max(1,Math.round(img.naturalHeight*size));
        const ctx=canvas.getContext('2d');ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
        const result=canvas.toDataURL('image/webp',.9);
        if(imageOK(result)) return result;
        size*=.8;
      }
      throw new Error('Bildet er for stort etter tilpasning. Bruk et mindre utsnitt.');
    }finally{URL.revokeObjectURL(url);}
  }
  class Editor{
    constructor(host,onChange=()=>{}){
      this.host=host;this.onChange=onChange;this.value=blank();this.pending=0;this.generation=0;this.preview=false;this.marking=null;
      host.classList.add('guide-editor');mountReader(host);
      host.addEventListener('input',e=>this.input(e));
      host.addEventListener('change',e=>this.change(e));
      host.addEventListener('click',e=>this.click(e));
      host.addEventListener('keydown',e=>{
        const picture=e.target.closest('[data-marking]');if(!picture||!this.marking)return;
        const moves={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
        if(e.key==='Escape'){e.preventDefault();e.stopPropagation();this.marking=null;this.draw();this.status('Markeringen ble avbrutt.');}
        else if(moves[e.key]){
          e.preventDefault();e.stopPropagation();const [x,y]=moves[e.key],amount=e.shiftKey?10:1,p=this.marking.point;
          p.x=Math.max(0,Math.min(100,p.x+x*amount));p.y=Math.max(0,Math.min(100,p.y+y*amount));
          picture.querySelector('.guide-marker')?.remove();picture.insertAdjacentHTML('beforeend',markerHTML(p,Number(picture.closest('[data-guide-index]').dataset.guideIndex)+1));
          this.status('Markør: '+p.x+' % fra venstre, '+p.y+' % fra toppen. Enter bekrefter.');
        }
      });
      host.addEventListener('paste',e=>{
        const item=Array.from(e.clipboardData?.items||[]).find(x=>x.type.startsWith('image/'));
        const card=e.target.closest('[data-guide-index]');
        if(item&&card){e.preventDefault();this.upload(item.getAsFile(),card.dataset.guideIndex);}
      });
    }
    setValue(value){const next=value?clone(validate(value)):blank();this.generation++;this.value=next;this.preview=false;this.marking=null;this.draw();}
    getValue(){if(this.pending)throw new Error('Vent til bildet er ferdig behandlet.');return clone(validate(this.value));}
    record(index){return index==='start'?this.value.start:this.value.steps[Number(index)];}
    status(message,error=false){const s=this.host.querySelector('[data-status]');s.textContent=message;s.classList.toggle('error',error);}
    dirty(){this.onChange();this.host.querySelector('[data-preview]').innerHTML='';this.preview=false;}
    field(index,name,label,value,area=false,max=2000){
      const id='guide-'+index+'-'+name;
      return '<div class="row"><label for="'+id+'">'+label+'</label>'+(area?'<textarea rows="2"':'<input type="text"')+' id="'+id+'" data-field="'+name+'" maxlength="'+max+'"'+(area?'>'+esc(value)+'</textarea>':' value="'+esc(value)+'">')+'</div>';
    }
    uploadBox(index,record){
      const start=index==='start';
      return '<div class="guide-upload"><label for="guide-file-'+index+'">'+(start?'Startbilde':'Bilde etter dette steget')+' <span class="guide-help">(valgfritt)</span></label><input class="guide-file" type="file" id="guide-file-'+index+'" accept="image/png,image/jpeg,image/webp" data-file><div class="guide-tools"><button type="button" class="btn ghost" data-op="paste">Lim inn bilde</button>'+(record.image?'<button type="button" class="btn ghost" data-op="remove-image">Fjern bilde</button>'+(!start?'<button type="button" class="btn ghost" data-op="mark">Marker viktig punkt</button>'+(record.marker?'<button type="button" class="btn ghost" data-op="unmark">Fjern markering</button>':''):''):'')+'</div><div data-image>'+figure(record.image,start?'Startbildet':'Etter steg '+(Number(index)+1),record.marker,Number(index)+1)+'</div></div>';
    }
    draw(focusIndex){
      const v=this.value;
      this.host.innerHTML='<div class="guide-edit-intro"><h3>Bygg knappesekvensen</h3><p>Vis hvor man starter, hva man skal trykke og hvordan skjermen ser ut etter hvert steg. Tastene i «Ctrl+F7» trykkes samtidig; separate trykk får hvert sitt steg.</p><p>Bilder kan velges fra en fil eller limes inn med Ctrl+V mens du står i et steg. De tilpasses og lagres sammen med den interne veiledningen.</p></div><section class="guide-edit-step" data-guide-index="start"><div class="guide-edit-head"><span class="guide-number">0</span><h3>Start her</h3></div>'+this.field('start','description','Hvor skal man starte?',v.start.description,true)+this.uploadBox('start',v.start)+'</section>'+v.steps.map((s,i)=>'<section class="guide-edit-step" data-guide-index="'+i+'"><div class="guide-edit-head"><span class="guide-number">'+(i+1)+'</span><h3>Steg '+(i+1)+'</h3><div class="guide-tools"><button type="button" class="btn ghost" data-op="up" aria-label="Flytt steg '+(i+1)+' opp" '+(i===0?'disabled':'')+'>↑</button><button type="button" class="btn ghost" data-op="down" aria-label="Flytt steg '+(i+1)+' ned" '+(i===v.steps.length-1?'disabled':'')+'>↓</button><button type="button" class="btn ghost" data-op="remove" aria-label="Slett steg '+(i+1)+'" '+(v.steps.length===1?'disabled':'')+'>Slett</button></div></div>'+this.field(i,'title','Hva skal gjøres?',s.title,false,120)+'<div class="guide-columns"><div class="row"><label for="guide-kind-'+i+'">Handling</label><select id="guide-kind-'+i+'" data-field="kind">'+Object.entries(kinds).map(([k,l])=>'<option value="'+k+'" '+(s.kind===k?'selected':'')+'>'+l+'</option>').join('')+'</select></div>'+this.field(i,s.kind==='keys'?'keys':'label',s.kind==='keys'?'Tast / kombinasjon':s.kind==='type'?'Teksten som skal skrives':'Tekst på knappen / menyvalget',s.kind==='keys'?s.keys:s.label,false,200)+'</div>'+(s.kind==='keys'?'<div class="guide-tools guide-presets">'+['Enter','Tab','Esc','F1','F7','Ctrl+F7','Pil ned'].map(k=>'<button type="button" class="btn ghost" data-op="key" data-key="'+k+'">'+esc(k)+'</button>').join('')+'</div>':'')+'<div data-action-preview>'+action(s)+'</div>'+this.field(i,'description','Forklaring (valgfritt)',s.description,true)+this.field(i,'result','Hva skal man se etter steget? (valgfritt)',s.result,true)+this.uploadBox(String(i),s)+'</section>').join('')+'<div class="guide-footer"><button type="button" class="btn" data-op="add" '+(v.steps.length>=MAX_STEPS?'disabled':'')+'>+ Legg til steg</button><button type="button" class="btn ghost" data-op="preview">Forhåndsvis sekvens</button><span class="guide-help">'+v.steps.length+' av '+MAX_STEPS+' steg</span></div><div class="guide-status" data-status role="status" aria-live="polite"></div><div class="guide-edit-preview" data-preview></div>';
      if(focusIndex!=null)this.host.querySelector('#guide-'+focusIndex+'-title')?.focus();
    }
    input(e){
      const name=e.target.dataset.field,index=e.target.closest('[data-guide-index]')?.dataset.guideIndex;
      if(!name || index==null || name==='kind')return;
      this.record(index)[name]=e.target.value;this.dirty();
      if(name==='keys'||name==='label')e.target.closest('[data-guide-index]').querySelector('[data-action-preview]').innerHTML=action(this.record(index));
    }
    change(e){
      const index=e.target.closest('[data-guide-index]')?.dataset.guideIndex;
      if(index==null)return;
      if(e.target.matches('[data-file]')){if(e.target.files[0])this.upload(e.target.files[0],index);e.target.value='';}
      if(e.target.dataset.field==='kind'){this.record(index).kind=e.target.value;this.dirty();this.draw();this.host.querySelector('#guide-kind-'+index)?.focus();}
    }
    async upload(file,index){
      const record=this.record(index),generation=this.generation;
      if(this.pending){this.status('Vent til det første bildet er ferdig.',true);return;}
      this.pending++;this.status('Tilpasser bildet …');
      try{
        const image=await compress(file);
        if(generation!==this.generation || (index==='start'?this.value.start!==record:!this.value.steps.includes(record)))return;
        const candidate=clone(this.value),target=index==='start'?candidate.start:candidate.steps[this.value.steps.indexOf(record)];target.image=image;target.marker=null;
        if(new TextEncoder().encode(JSON.stringify(candidate)).length>MAX_GUIDE)throw new Error('Sekvensen har for mange store bilder. Fjern et bilde eller bruk et mindre utsnitt.');
        record.image=image;if(index!=='start')record.marker=null;this.dirty();this.draw();this.status('Bildet er lagt til. Husk å lagre sekvensen.');
      }catch(e){if(generation===this.generation)this.status(e.message,true);}finally{this.pending--;}
    }
    async click(e){
      const b=e.target.closest('button'),card=e.target.closest('[data-guide-index]'),index=card?.dataset.guideIndex;
      if(!b)return;
      if(b.hasAttribute('data-marking')){
        if(e.detail===0){this.record(index).marker=clone(this.marking?.point||{x:50,y:50});}
        else{const r=b.getBoundingClientRect();this.record(index).marker={x:Math.round(Math.max(0,Math.min(100,(e.clientX-r.left)/r.width*100))*100)/100,y:Math.round(Math.max(0,Math.min(100,(e.clientY-r.top)/r.height*100))*100)/100};}
        this.marking=null;this.dirty();this.draw();this.status('Punktet er markert.');return;
      }
      const op=b.dataset.op;if(!op)return;
      if(this.pending){this.status('Vent til bildet er ferdig behandlet.',true);return;}
      if(op==='preview'){
        try{this.host.querySelector('[data-preview]').innerHTML=render(this.getValue());this.status('Forhåndsvisningen vises nedenfor.');this.host.querySelector('[data-preview]').scrollIntoView({behavior:'instant',block:'start'});}catch(err){this.status(err.message,true);}return;
      }
      if(op==='paste'){
        const target=this.record(index),generation=this.generation;
        let reading=true;this.pending++;this.status('Henter bildet fra utklippstavlen …');
        try{
          if(!navigator.clipboard?.read)throw new Error('Trykk Ctrl+V i et felt i dette steget, eller velg en bildefil.');
          const entries=await navigator.clipboard.read();let file;
          for(const entry of entries){const type=entry.types.find(t=>['image/png','image/jpeg','image/webp'].includes(t));if(type){file=await entry.getType(type);break;}}
          if(!file)throw new Error('Utklippstavlen inneholder ikke et bilde. Kopier et skjermbilde først.');
          if(generation!==this.generation)return;
          const current=index==='start'?(this.value.start===target?'start':null):this.value.steps.indexOf(target);
          if(current===null || current===-1)return;
          this.pending--;reading=false;
          await this.upload(file,String(current));
        }catch(err){if(generation===this.generation)this.status(err.name==='NotAllowedError'?'Nettleseren ga ikke tilgang. Trykk Ctrl+V i et felt i steget, eller velg en fil.':err.message,true);}
        finally{if(reading)this.pending--;}
        return;
      }
      if(op==='mark'){
        this.draw();
        const picture=this.host.querySelector('[data-guide-index="'+index+'"]').querySelector('[data-guide-zoom]');
        this.marking={point:clone(this.record(index).marker||{x:50,y:50})};
        picture.setAttribute('data-marking','true');picture.setAttribute('aria-label','Velg et viktig punkt i bildet. Piltaster flytter markøren, Enter bekrefter, Escape avbryter.');
        picture.querySelector('.guide-marker')?.remove();picture.insertAdjacentHTML('beforeend',markerHTML(this.marking.point,Number(index)+1));
        picture.focus();this.status('Klikk på et punkt, eller flytt med piltastene og bekreft med Enter. Shift flytter raskere; Escape avbryter.');return;
      }
      let focusIndex;
      if(op==='add'){if(this.value.steps.length>=MAX_STEPS)return;this.value.steps.push(blankStep());focusIndex=this.value.steps.length-1;}
      else if(op==='up'||op==='down'){
        const i=Number(index),j=i+(op==='up'?-1:1);if(j<0||j>=this.value.steps.length)return;
        [this.value.steps[i],this.value.steps[j]]=[this.value.steps[j],this.value.steps[i]];focusIndex=j;
      }else if(op==='remove'){
        if(this.value.steps.length===1)return;
        const s=this.record(index);if((s.title||s.image||s.keys||s.label||s.description||s.result)&&!root.confirm('Slette steg '+(Number(index)+1)+' fra sekvensen?'))return;
        this.value.steps.splice(Number(index),1);focusIndex=Math.min(Number(index),this.value.steps.length-1);
      }else if(op==='remove-image'){this.record(index).image=null;if(index!=='start')this.record(index).marker=null;}
      else if(op==='unmark')this.record(index).marker=null;
      else if(op==='key')this.record(index).keys=b.dataset.key;
      else return;
      this.dirty();this.draw(focusIndex);
    }
  }
  const api={blank,blankStep,validate,render,keycaps,imageOK,Editor,mountReader,MAX_IMAGE,MAX_GUIDE};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.WikiGuides=api;
})(typeof window!=='undefined'?window:globalThis);
