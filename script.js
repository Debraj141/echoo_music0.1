'use strict';
// The LLM only interprets prompts; catalogue retrieval and ranking remain local.
const API='https://itunes.apple.com/search';
const $=id=>document.getElementById(id);
const audio=$('audio');
const read=(k,d)=>{try{return JSON.parse(localStorage.getItem(k))??d}catch{return d}};
const state={
  results:[],queue:[],index:-1,current:null,collections:{},
  liked:read('echo-liked',[]),playlist:read('echo-playlist',[]),recent:read('echo-recent',[]),
  preferences:EchoRecommendation.loadPreferences(localStorage),
  mode:'familiar',recommendations:[]
};
const requests={search:{},recommend:0};
const save=(k,v)=>{
  try{
    if(k==='echo-preferences')EchoRecommendation.savePreferences(localStorage,v);
    else localStorage.setItem(k,JSON.stringify(v));
    return true;
  }catch{toast('Could not save your library. Check browser storage settings.');return false}
};
const esc=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function toast(s){$('toast').textContent=s;$('toast').classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>$('toast').classList.remove('show'),2300)}
function normalize(t){
  const title=t.trackName||t.collectionName||'Unknown track';
  const artist=t.artistName||'Unknown artist';
  const genre=t.primaryGenreName||'Music';
  const track={id:String(t.trackId||t.collectionId||''),title,
    artist,artistId:t.artistId||null,art:(t.artworkUrl100||'').replace('100x100bb','600x600bb'),
    preview:t.previewUrl||'',url:t.trackViewUrl||'',genre,collection:t.collectionName||'',
    kind:t.kind||'song',durationMs:Number.isFinite(t.trackTimeMillis)?t.trackTimeMillis:null,
    country:t.country||null,releaseDate:t.releaseDate||null,language:'unknown',tempo:null};
  track.semanticId=semanticId(track);
  return track;
}
function semanticId(t){
  return EchoRecommendation.semanticRepresentation(t).semanticId;
}
function unique(a){
  return [...new Map(a.map(track=>[
    `${track.title.trim().toLowerCase()}|${track.artist.trim().toLowerCase()}`,
    track
  ])).values()];
}
function card(t,showReason=false){
  const liked=state.liked.some(x=>x.id===t.id),added=state.playlist.some(x=>x.id===t.id);
  const reason=showReason&&t.reason?`<p class="why-match">${esc(t.reason)}</p>`:'';
  const sid=showReason?`<p class="semantic-id">SEMANTIC ID · ${esc(t.semanticId||semanticId(t))}</p>`:'';
  const actions=showReason
    ? `<button data-act="like" data-id="${esc(t.id)}">${liked?'♥ Liked':'♡ Like'}</button><button data-act="add" data-id="${esc(t.id)}">${added?'✓ Added':'+ Playlist'}</button><button data-act="skip" data-id="${esc(t.id)}">Skip</button>`
    : `<button data-act="like" data-id="${esc(t.id)}">${liked?'♥ Liked':'♡ Like'}</button><button data-act="add" data-id="${esc(t.id)}">${added?'✓ Added':'+ Playlist'}</button><button data-act="play" data-id="${esc(t.id)}">Play</button>`;
  return `<article class="track"><div class="coverbox"><img class="cover" src="${esc(t.art||'https://placehold.co/500x500/1b2922/9be7b0?text=Echo')}" alt="Album art" loading="lazy"><button class="quick" data-act="play" data-id="${esc(t.id)}">▶</button></div><h3 title="${esc(t.title)}">${esc(t.title)}</h3><p class="artist">${esc(t.artist)}</p>${reason}${sid}<div class="actions">${actions}</div></article>`;
}
function render(id,list,msg='Nothing here yet. Search for music to add tracks.',withReasons=false){
  state.collections[id]=list;
  $(id).innerHTML=list.length?list.map(t=>card(t,withReasons)).join():`<div class="empty">${esc(msg)}</div>`;
}
function counts(){$('likedCount').textContent=state.liked.length;$('playlistCount').textContent=state.playlist.length}
function libraries(){
  render('likedResults',state.liked,'No liked songs yet. Tap Like on a track to save it.');
  render('playlistResults',state.playlist);render('recentResults',state.recent,'Your listening history will appear here.');counts();
}
function view(name){
  document.querySelectorAll('.view').forEach(x=>x.classList.remove('visible'));
  $(name+'View')?.classList.add('visible');
  document.querySelectorAll('.nav').forEach(x=>x.classList.toggle('active',x.dataset.view===name));
  $('pageName').textContent=({home:'Home',search:'Search',explore:'Explore moods',liked:'Liked songs',playlist:'My playlist',recent:'Recently played'})[name]||'Home';
  $('sidebar').classList.remove('open');if(['liked','playlist','recent'].includes(name))libraries();
}
async function fetchTracks(term,limit=50,media='music'){
  const entity=media==='musicVideo'?'musicVideo':'song';
  const p=new URLSearchParams({term,entity,media,limit:String(limit),country:'US'});
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),12000);
  try{
    const r=await fetch(`${API}?${p}`,{signal:controller.signal});
    if(!r.ok)throw Error(`Catalogue request failed (${r.status})`);
    const data=await r.json();
    if(!Array.isArray(data.results))throw Error('Catalogue returned an invalid response');
    return unique(data.results.map(normalize).filter(t=>t.id&&t.title));
  }finally{clearTimeout(timeout)}
}
async function search(term,target='searchResults'){
  term=term.trim();if(!term)return toast('Enter a song, artist or album to search.');
  const requestId=(requests.search[target]||0)+1;requests.search[target]=requestId;
  view(target==='homeResults'?'home':target==='exploreResults'?'explore':'search');
  $(target).innerHTML='<div class="empty">Searching the music catalogue…</div>';
  if(target==='searchResults')$('searchStatus').textContent='Searching…';
  try{
    const media=target==='searchResults'?$('mediaFilter').value:'music';
    const tracks=await fetchTracks(term,50,media);
    if(requests.search[target]!==requestId)return;
    state.results=tracks;
    render(target,tracks,'No matches found. Try a different search.');
    if(target==='searchResults')$('searchStatus').textContent=`${tracks.length} results for “${term}”`;
    if(!tracks.length)toast('No results found.');
  }catch{
    if(requests.search[target]!==requestId)return;
    $(target).innerHTML='<div class="empty">Could not load music. Check your connection and try again.</div>';
    if(target==='searchResults')$('searchStatus').textContent='Search unavailable';toast('Music search failed.');
  }
}
function interpretIntent(prompt){return EchoRecommendation.parseIntent(prompt)}
function rankTracks(tracks,intent){return EchoRecommendation.rankTracks(tracks,intent,state.preferences,state.mode)}
async function understandIntent(prompt){
  const fallback=interpretIntent(prompt);
  if(!['http:','https:'].includes(window.location.protocol))return {intent:fallback,source:'local'};
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),12000);
  try{
    const response=await fetch('/api/intent',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({prompt}),
      signal:controller.signal
    });
    if(!response.ok)throw Error(`Intent service returned ${response.status}`);
    const result=await response.json();
    if(!result||!result.intent||result.source!=='llm')throw Error('Intent service returned an invalid response');
    return {intent:EchoRecommendation.normalizeIntent(result.intent,prompt),source:'llm'};
  }catch{
    return {intent:fallback,source:'local'};
  }finally{clearTimeout(timeout)}
}
async function recommend(prompt){
  prompt=prompt.trim();if(!prompt)return toast('Describe the moment or mood first.');
  if(/\b(different from my usual|outside my usual|unfamiliar|something new|new direction)\b/i.test(prompt))setMode('nonhabitual');
  const requestId=++requests.recommend;
  $('recommendStatus').textContent='Understanding your request…';
  $('recommendResults').innerHTML='<div class="empty">Finding tracks that fit your moment…</div>';
  try{
    const {intent,source}=await understandIntent(prompt);
    if(requests.recommend!==requestId)return;
    const queries=[intent.search];
    if(state.mode==='nonhabitual')queries.push(`${intent.search} ${intent.genres[0]||intent.tags[0]||'independent international'}`.trim());
    else {
      const familiarGenres=Object.entries(state.preferences.genres).sort((a,b)=>b[1]-a[1]).slice(0,2).map(([g])=>g);
      if(familiarGenres.length)queries.push(`${familiarGenres.join(' ')} ${intent.search}`);
      else {
        const familiarArtist=Object.entries(state.preferences.artists).sort((a,b)=>b[1]-a[1])[0]?.[0];
        if(familiarArtist)queries.push(`${familiarArtist} ${intent.search}`);
      }
    }
    const outcomes=await Promise.allSettled(queries.map(q=>fetchTracks(q,40)));
    if(requests.recommend!==requestId)return;
    const lists=outcomes.filter(x=>x.status==='fulfilled').map(x=>x.value);
    if(!lists.length)throw outcomes.find(x=>x.status==='rejected').reason;
    const tracks=unique(lists.flat());
    const chosen=rankTracks(tracks,intent);
    state.recommendations=chosen;state.results=tracks;state.queue=chosen;state.index=-1;
    render('recommendResults',chosen,'No matching tracks found. Try describing the mood another way.',true);
    $('recommendStatus').textContent=`${chosen.length} discoveries · ${state.mode==='familiar'?'Familiar':'Non-habitual'} · ${source==='llm'?'AI':'Local'} mode`;
    if(!chosen.length)toast('No discoveries found. Try another prompt.');
  }catch{
    if(requests.recommend!==requestId)return;
    $('recommendResults').innerHTML='<div class="empty">Could not reach the music catalogue. Check your connection and try again.</div>';
    $('recommendStatus').textContent='Discovery unavailable';toast('Recommendation search failed.');
  }
}
function locate(id){
  const collections=Object.values(state.collections).flat();
  return [...state.recommendations,...state.queue,...collections,...state.results,...state.liked,...state.playlist,...state.recent].find(t=>t.id===String(id));
}
function learn(t,kind){
  if(!t)return;
  state.preferences=EchoRecommendation.recordFeedback(state.preferences,t,kind);
  save('echo-preferences',state.preferences);
}
function play(t,q=state.queue){
  if(!t)return;
  if(!t.preview){toast('No preview is available for this track.');if(t.url)window.open(t.url,'_blank','noopener');return}
  state.queue=q.length?q:[t];state.index=state.queue.findIndex(x=>x.id===t.id);state.current=t;
  learn(t,'play');
  audio.src=t.preview;
  audio.play().then(()=>{
    $('playBtn').textContent='Ⅱ';$('playerTitle').textContent=t.title;$('playerArtist').textContent=t.artist;
    $('playerArt').src=t.art||'https://placehold.co/100x100/1b2922/9be7b0?text=E';
    $('playerLike').textContent=state.liked.some(x=>x.id===t.id)?'♥':'♡';
    learn(t,'replay');
    state.recent=[t,...state.recent.filter(x=>x.id!==t.id)].slice(0,50);save('echo-recent',state.recent);libraries();
  }).catch(()=>toast('Playback could not start. Press play again.'));
}
function like(t){
  if(!t)return;const has=state.liked.some(x=>x.id===t.id);
  state.liked=has?state.liked.filter(x=>x.id!==t.id):[t,...state.liked];
  if(!has)learn(t,'like');
  save('echo-liked',state.liked);libraries();refresh();
  if(state.current?.id===t.id)$('playerLike').textContent=has?'♡':'♥';
  toast(has?'Removed from liked songs':'Added to liked songs');
}
function add(t){if(!t)return;if(state.playlist.some(x=>x.id===t.id))return toast('Already in your playlist');state.playlist.unshift(t);learn(t,'save');save('echo-playlist',state.playlist);libraries();refresh();toast('Added to your playlist')}
function skip(t){
  if(!t)return;learn(t,'skip');
  state.queue=state.queue.filter(x=>x.id!==t.id);
  state.recommendations=state.recommendations.filter(x=>x.id!==t.id);
  render('recommendResults',state.recommendations,'No recommendations left. Try another prompt.',true);
  toast('Skipped. Future discoveries will avoid this track.');
}
function refresh(){
  document.querySelectorAll('.view.visible .track').forEach(el=>{
    const id=el.querySelector('[data-id]')?.dataset.id,t=locate(id);
    if(t){const n=document.createElement('div');n.innerHTML=card(t,state.recommendations.some(x=>x.id===t.id));el.replaceWith(n.firstElementChild)}
  });
}
function next(dir=1){if(!state.queue.length)return toast('Search for music to start a queue');let i=state.index+dir;if(i<0)i=state.queue.length-1;if(i>=state.queue.length)i=0;play(state.queue[i],state.queue)}
function time(s){return Number.isFinite(s)?`${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`:'0:00'}
function setMode(mode){
  state.mode=mode;
  document.querySelectorAll('.mode-btn').forEach(button=>button.classList.toggle('active',button.dataset.mode===mode));
  $('modeDescription').textContent=mode==='familiar'?'Your known genres, artists and listening patterns.':'Step outside your usual artists and genres.';
}
document.addEventListener('click',e=>{
  const v=e.target.closest('[data-view]');if(v){view(v.dataset.view);return}
  const q=e.target.closest('[data-query]');if(q){
    if(q.closest('#exploreView')){search(q.dataset.query,'exploreResults')}
    else{$('recommendInput').value=q.dataset.query;recommend(q.dataset.query)}
    return
  }
  const mode=e.target.closest('[data-mode]');if(mode){
    setMode(mode.dataset.mode);
    if($('recommendInput').value.trim())recommend($('recommendInput').value);return;
  }
  const a=e.target.closest('[data-act]');if(a){
    const container=a.closest('.tracks');
    const t=(state.collections[container?.id]||[]).find(track=>track.id===String(a.dataset.id))||locate(a.dataset.id);
    if(a.dataset.act==='play'){
      play(t,state.collections[container?.id]||[t]);
    }
    if(a.dataset.act==='like')like(t);if(a.dataset.act==='add')add(t);if(a.dataset.act==='skip')skip(t);
  }
});
$('heroForm').addEventListener('submit',e=>{e.preventDefault();$('recommendInput').value=$('heroInput').value;recommend($('heroInput').value)});
$('searchForm').addEventListener('submit',e=>{e.preventDefault();search($('searchInput').value)});
$('recommendForm').addEventListener('submit',e=>{e.preventDefault();recommend($('recommendInput').value)});
$('mediaFilter').addEventListener('change',()=>{if($('searchInput').value.trim())search($('searchInput').value)});
$('clearPlaylist').addEventListener('click',()=>{if(state.playlist.length&&confirm('Clear your playlist?')){state.playlist=[];save('echo-playlist',state.playlist);libraries();toast('Playlist cleared')}});
$('playerLike').addEventListener('click',()=>like(state.current));
$('playBtn').addEventListener('click',()=>{if(!audio.src)return toast('Choose a track first');if(audio.paused)audio.play().then(()=>$('playBtn').textContent='Ⅱ');else{audio.pause();$('playBtn').textContent='▶'}});
$('nextBtn').addEventListener('click',()=>next(1));$('prevBtn').addEventListener('click',()=>next(-1));$('queueBtn').addEventListener('click',()=>view('playlist'));
$('volumeBar').addEventListener('input',e=>audio.volume=+e.target.value);audio.volume=.8;
audio.addEventListener('timeupdate',()=>{$('currentTime').textContent=time(audio.currentTime);$('seekBar').value=audio.currentTime});
audio.addEventListener('loadedmetadata',()=>{$('seekBar').max=audio.duration||30;$('duration').textContent=time(audio.duration)});
$('seekBar').addEventListener('input',e=>{if(audio.duration)audio.currentTime=+e.target.value});audio.addEventListener('ended',()=>next(1));
$('menuBtn').addEventListener('click',()=>$('sidebar').classList.toggle('open'));
function openVoice(){$('voiceModal').classList.add('open');$('voiceTitle').textContent='Ready when you are'}
function closeVoice(){$('voiceModal').classList.remove('open');try{recognition?.stop()}catch{}}
$('voiceBtn').addEventListener('click',openVoice);$('sideMic').addEventListener('click',openVoice);$('closeModal').addEventListener('click',closeVoice);$('voiceModal').addEventListener('click',e=>{if(e.target===$('voiceModal'))closeVoice()});
let recognition=null;
$('startVoice').addEventListener('click',()=>{
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR){$('voiceTitle').textContent='Voice not supported';$('voiceHelp').textContent='Try Chrome or Edge, or type in the search box.';return}
  recognition=new SR();recognition.lang='en-IN';recognition.interimResults=false;$('voiceTitle').textContent='Listening…';$('voiceHelp').textContent='Describe a mood, ask for a track, or say pause, play or next.';
  recognition.onresult=e=>{
    const said=e.results[0][0].transcript.trim(),s=said.toLowerCase();$('voiceTitle').textContent=`“${said}”`;
    if(/\b(pause|stop music)\b/.test(s)){audio.pause();$('playBtn').textContent='▶';$('voiceHelp').textContent='Playback paused.'}
    else if(/\b(next|skip)\b/.test(s)){next(1);$('voiceHelp').textContent='Next track.'}
    else if(/\b(previous|go back)\b/.test(s)){next(-1);$('voiceHelp').textContent='Previous track.'}
    else if(/\b(play|resume|continue)\b/.test(s)&&audio.src){audio.play().then(()=>$('playBtn').textContent='Ⅱ');$('voiceHelp').textContent='Playback resumed.'}
    else{$('recommendInput').value=said;recommend(said);$('voiceHelp').textContent='Finding music for that moment.'}
  };
  recognition.onerror=e=>{$('voiceTitle').textContent='Could not hear that';$('voiceHelp').textContent=e.error==='not-allowed'?'Allow microphone access in browser settings.':'Please try again.'};
  recognition.start();
});
function init(){libraries();search('popular hits','homeResults')}
init();
