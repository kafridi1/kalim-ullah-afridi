// Kalim Social — Supabase client app
const SUPABASE_URL = "https://kvwoyeusveepyjewrzpi.supabase.co";
const SUPABASE_KEY = "sb_publishable__kSVXsmw0d-erIP9doLa3g_J29aYfiv";
const STORAGE_BUCKET = "social-media";
const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
let db=null, currentUser=null, currentProfile=null, settings={autoplay:true,muted:true,compact:false,discoverable:true};

function message(text="", error=false){const el=$("#message");if(el){el.textContent=text;el.style.color=error?"#c43e4b":"";}}
function el(tag, cls="", text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=String(text??"");return n;}
function btn(text, cls, fn){const b=el("button",cls,text);b.type="button";b.addEventListener("click",fn);return b;}
function initials(name){return String(name||"K").trim().split(/\s+/).slice(0,2).map(x=>x[0]||"").join("").toUpperCase()||"K";}
function avatar(profile){if(profile?.avatar_url){const img=el("img","avatar");img.src=profile.avatar_url;img.alt="Profile photo";return img;}return el("div","avatar placeholder",initials(profile?.full_name));}
function dateText(v){if(!v)return "";const d=new Date(v);return Number.isNaN(d.getTime())?"":d.toLocaleString([], {dateStyle:"medium",timeStyle:"short"});}
function busy(b,on,text="Please wait…"){if(!b)return;if(on){b.dataset.old=b.innerHTML;b.disabled=true;b.textContent=text;}else{b.disabled=false;if(b.dataset.old)b.innerHTML=b.dataset.old;}}
function loadSettings(){try{settings={...settings,...JSON.parse(localStorage.getItem("kalim-settings")||"{}")};}catch{}}
function applySettings(){document.body.classList.toggle("compact",!!settings.compact);$$(".video-frame video").forEach(v=>{v.muted=!!settings.muted;v.autoplay=!!settings.autoplay;});}
async function getProfile(id){const {data,error}=await db.from("profiles").select("id,full_name,username,bio,avatar_url").eq("id",id).maybeSingle();if(error)throw error;return data;}
async function uploadMedia(file,folder){
  if(!file) return null;
  const isVideo=file.type.startsWith("video/");
  const isImage=file.type.startsWith("image/");
  if(!isVideo&&!isImage)throw new Error("Please choose an image or video file.");
  const limit=isVideo?50:5;
  if(file.size>limit*1024*1024)throw new Error(`${isVideo?"Video":"Image"} must be ${limit} MB or smaller.`);
  const safe=file.name.toLowerCase().replace(/[^a-z0-9._-]/g,"-");
  const path=`${currentUser.id}/${folder}-${crypto.randomUUID()}-${safe}`;
  const {error}=await db.storage.from(STORAGE_BUCKET).upload(path,file,{cacheControl:"3600",upsert:false,contentType:file.type});
  if(error)throw error;
  return {url:db.storage.from(STORAGE_BUCKET).getPublicUrl(path).data.publicUrl,type:isVideo?"video":"image"};
}
function showTab(tab){
  $$(".view").forEach(v=>v.hidden=v.id!==`${tab}-view`);
  $$(".nav-link[data-tab]").forEach(b=>b.classList.toggle("active",b.dataset.tab===tab));
  if(tab==="feed")loadFeed();
  if(tab==="videos")loadVideos();
  if(tab==="profile")loadMyProfile();
  if(tab==="notifications")loadNotifications();
  if(tab==="settings")fillSettings();
}
async function updateApp(session){
  currentUser=session?.user||null;
  $("#auth-section").hidden=!!currentUser;$("#home-section").hidden=!currentUser;
  $("#header-login").hidden=!!currentUser;$("#header-user").textContent=currentUser?"Signed in":"";
  if(!currentUser){currentProfile=null;return;}
  try{currentProfile=await getProfile(currentUser.id);const old=$("#composer-avatar");if(old){const a=avatar(currentProfile);a.id="composer-avatar";old.replaceWith(a);}showTab("feed");}
  catch(e){message(e.message,true);}
}
function postMedia(post, compact=false){
  if(!post.image_url)return null;
  if(post.media_type==="video"){
    const wrap=el("div","video-frame");const v=el("video");v.src=post.image_url;v.controls=true;v.playsInline=true;v.preload="metadata";v.muted=!!settings.muted;v.autoplay=!!settings.autoplay;wrap.append(v);return wrap;
  }
  const img=el("img","post-image");img.src=post.image_url;img.alt="Post image";img.loading="lazy";return img;
}
async function renderPosts(containerId, userId=null, videosOnly=false){
  const container=$("#"+containerId);if(!container)return;
  container.replaceChildren(el("div","empty","Loading posts…"));
  let q=db.from("posts").select("id,user_id,content,image_url,media_type,created_at").order("created_at",{ascending:false}).limit(50);
  if(userId)q=q.eq("user_id",userId);
  if(videosOnly)q=q.eq("media_type","video");
  const {data:posts,error}=await q;
  if(error){container.replaceChildren(el("div","empty",error.message));return;}
  if(!posts?.length){container.replaceChildren(el("div","empty",videosOnly?"No videos yet. Upload the first one!":"No posts yet. Be the first to share!"));return;}
  container.replaceChildren();
  for(const p of posts){
    try{
      const [profile,likesRes,demoRes,commentsRes]=await Promise.all([
        getProfile(p.user_id),
        db.from("likes").select("user_id").eq("post_id",p.id),
        db.from("demo_likes").select("likes_count").eq("post_id",p.id).maybeSingle(),
        db.from("comments").select("id,user_id,content,created_at").eq("post_id",p.id).order("created_at",{ascending:true}).limit(30)
      ]);
      if(likesRes.error)throw likesRes.error;if(commentsRes.error)throw commentsRes.error;
      const likes=likesRes.data||[],comments=commentsRes.data||[],demo=Math.max(0,Number(demoRes.data?.likes_count)||0),real=likes.length;
      const liked=likes.some(x=>x.user_id===currentUser.id);
      const card=el("article",videosOnly?"card video-card":"card post-card");
      if(videosOnly){
        const media=postMedia(p);if(media)card.append(media);
        const info=el("div","video-info");
        const head=el("div","post-head");head.append(avatar(profile),el("div","post-author",profile?.full_name||"Kalim Social member"));info.append(head);
        if(p.content)info.append(el("p","post-body",p.content));
        info.append(el("div","post-meta",`${profile?.username?"@"+profile.username+" · ":""}${dateText(p.created_at)}`));
        const stats=el("div","post-stats",`${demo+real} likes · ${comments.length} comments`);info.append(stats);
        const controls=el("div","video-controls");controls.append(btn(liked?"♥ Liked":`♡ Like (${demo+real})`,"",()=>toggleLike(p.id,liked,containerId,videosOnly)));controls.append(btn("View profile","",()=>openProfile(p.user_id)));info.append(controls);
        const commentBox=buildComments(p,comments,containerId,videosOnly);info.append(commentBox);card.append(info);
      }else{
        const head=el("div","post-head");head.append(avatar(profile));
        const who=el("div");who.append(el("div","post-author",profile?.full_name||"Kalim Social member"),el("div","post-meta",`${profile?.username?"@"+profile.username+" · ":""}${dateText(p.created_at)}`));head.append(who);card.append(head);
        if(p.content)card.append(el("p","post-body",p.content));
        const media=postMedia(p);if(media)card.append(media);
        card.append(el("div","post-stats",`${demo+real} likes (${demo} demo · ${real} real) · ${comments.length} comments`));
        const actions=el("div","post-actions");actions.append(btn(liked?`♥ Liked (${demo+real})`:`♡ Like (${demo+real})`,"",()=>toggleLike(p.id,liked,containerId,false)),btn("◯ Comment","",()=>card.querySelector(".comment-form input")?.focus()));
        if(p.user_id!==currentUser.id)actions.append(btn("View profile","",()=>openProfile(p.user_id)));card.append(actions);
        card.append(buildComments(p,comments,containerId,false));
      }
      container.append(card);
    }catch(e){console.error("Post rendering error:",e);}
  }
  applySettings();
}
function buildComments(post,comments,containerId,videosOnly){
  const area=el("div","comment-area");comments.forEach(c=>area.append(el("div","comment",c.content)));
  const form=el("form","comment-form"),input=el("input");input.placeholder="Write a comment…";input.maxLength=1000;input.required=true;
  const send=el("button","","Send");send.type="submit";form.append(input,send);
  form.addEventListener("submit",async ev=>{ev.preventDefault();const content=input.value.trim();if(!content)return;send.disabled=true;const {error}=await db.from("comments").insert({post_id:post.id,user_id:currentUser.id,content});send.disabled=false;if(error)message(error.message,true);else videosOnly?loadVideos():loadFeed(containerId==="my-posts"?currentUser.id:null,containerId);});
  area.append(form);return area;
}
async function loadFeed(userId=null,containerId="feed"){await renderPosts(containerId,userId,false);}
async function loadVideos(){await renderPosts("video-feed",null,true);}
async function toggleLike(postId,liked,containerId="feed",videosOnly=false){
  const result=liked?await db.from("likes").delete().eq("post_id",postId).eq("user_id",currentUser.id):await db.from("likes").insert({post_id:postId,user_id:currentUser.id});
  if(result.error)message(result.error.message,true);else videosOnly?loadVideos():loadFeed(containerId==="my-posts"?currentUser.id:null,containerId);
}
async function loadMyProfile(){
  try{currentProfile=await getProfile(currentUser.id);const target=$("#my-profile");target.replaceChildren();const info=el("div","profile-info");info.append(avatar(currentProfile),el("div","profile-name",currentProfile.full_name||"Your name"),el("div","profile-handle",currentProfile.username?"@"+currentProfile.username:"Choose a username"));if(currentProfile.bio)info.append(el("p","profile-bio",currentProfile.bio));target.append(el("div","profile-cover"),info);
    $("#profile-name").value=currentProfile.full_name||"";$("#profile-username").value=currentProfile.username||"";$("#profile-bio").value=currentProfile.bio||"";await loadFeed(currentUser.id,"my-posts");
  }catch(e){message(e.message,true);}
}
async function openProfile(userId){
  if(userId===currentUser.id){showTab("profile");return;}
  showTab("other-profile");const target=$("#other-profile");target.replaceChildren(el("div","empty","Loading profile…"));
  try{const p=await getProfile(userId);if(!p){target.replaceChildren(el("div","empty","Profile not found."));return;}
    const info=el("div","profile-info");info.append(avatar(p),el("div","profile-name",p.full_name||"Kalim Social member"),el("div","profile-handle",p.username?"@"+p.username:""));if(p.bio)info.append(el("p","profile-bio",p.bio));
    const {data:existing,error}=await db.from("follows").select("follower_id").eq("follower_id",currentUser.id).eq("following_id",userId).maybeSingle();if(error)throw error;
    info.append(btn(existing?"Following":"Follow","btn primary profile-actions",()=>toggleFollow(userId)));target.replaceChildren(el("div","profile-cover"),info);await loadFeed(userId,"other-posts");
  }catch(e){message(e.message,true);}
}
async function toggleFollow(userId){
  const {data:existing,error}=await db.from("follows").select("follower_id").eq("follower_id",currentUser.id).eq("following_id",userId).maybeSingle();if(error)return message(error.message,true);
  const r=existing?await db.from("follows").delete().eq("follower_id",currentUser.id).eq("following_id",userId):await db.from("follows").insert({follower_id:currentUser.id,following_id:userId});
  if(r.error)message(r.error.message,true);else openProfile(userId);
}
async function searchPeople(term){
  const target=$("#search-results");target.replaceChildren();if(!term.trim()){target.append(el("div","empty","Enter a name or username to search."));return;}
  const safe=term.trim().replace(/[,%()]/g," ");const {data,error}=await db.from("profiles").select("id,full_name,username,bio,avatar_url").or(`full_name.ilike.%${safe}%,username.ilike.%${safe}%`).limit(25);
  if(error){target.append(el("div","empty",error.message));return;}const people=(data||[]).filter(p=>p.id!==currentUser.id);
  if(!people.length){target.append(el("div","empty","No matching people found."));return;}
  people.forEach(p=>{const row=el("div","result-item");row.append(avatar(p));const copy=el("div","result-copy");copy.append(el("div","result-name",p.full_name||"Kalim Social member"),el("div","result-handle",p.username?"@"+p.username:""));row.append(copy,btn("View","btn soft",()=>openProfile(p.id)));target.append(row);});
}
async function loadNotifications(){
  const list=$("#notifications-list");list.replaceChildren(el("div","empty","Loading notifications…"));
  const {data,error}=await db.from("notifications").select("id,actor_id,type,is_read,created_at").eq("user_id",currentUser.id).order("created_at",{ascending:false}).limit(40);
  if(error){list.replaceChildren(el("div","empty",error.message));return;}if(!data?.length){list.replaceChildren(el("div","empty","You're all caught up."));return;}list.replaceChildren();
  for(const n of data){let actor=null;if(n.actor_id){try{actor=await getProfile(n.actor_id);}catch{}}
    const desc=n.type==="like"?"liked your post":n.type==="comment"?"commented on your post":n.type==="follow"?"started following you":"interacted with you";
    const row=el("div","notification-item");row.append(avatar(actor));const copy=el("div","result-copy");copy.append(el("div","result-name",`${actor?.full_name||"Someone"} ${desc}`),el("div","result-handle",dateText(n.created_at)));row.append(copy);list.append(row);
    if(!n.is_read)await db.from("notifications").update({is_read:true}).eq("id",n.id);
  }
}
function fillSettings(){$("#setting-autoplay").checked=!!settings.autoplay;$("#setting-muted").checked=!!settings.muted;$("#setting-compact").checked=!!settings.compact;$("#setting-discoverable").checked=!!settings.discoverable;}
function saveSettings(){settings={autoplay:$("#setting-autoplay").checked,muted:$("#setting-muted").checked,compact:$("#setting-compact").checked,discoverable:$("#setting-discoverable").checked};localStorage.setItem("kalim-settings",JSON.stringify(settings));applySettings();message("Settings saved on this browser.");}
function bind(){
  $$("[data-auth-tab]").forEach(b=>b.addEventListener("click",()=>{$$(".auth-tab").forEach(x=>x.classList.toggle("active",x===b));$("#login-form").hidden=b.dataset.authTab!=="login";$("#signup-form").hidden=b.dataset.authTab!=="signup";}));
  $("#header-login").addEventListener("click",()=>$("#login-email").focus());
  $$("[data-tab]").forEach(b=>b.addEventListener("click",()=>showTab(b.dataset.tab)));
  $("#logout-button").addEventListener("click",async()=>{const {error}=await db.auth.signOut();if(error)message(error.message,true);});
  $("#post-media").addEventListener("change",e=>$("#media-name").textContent=e.target.files[0]?.name||"");
  $("#signup-form").addEventListener("submit",async e=>{e.preventDefault();const b=e.submitter;busy(b,true,"Creating…");try{const {error}=await db.auth.signUp({email:$("#signup-email").value.trim(),password:$("#signup-password").value,options:{data:{full_name:$("#signup-name").value.trim()}}});if(error)throw error;message("Account created. Check your email if verification is enabled.");}catch(x){message(x.message,true);}finally{busy(b,false);}});
  $("#login-form").addEventListener("submit",async e=>{e.preventDefault();const b=e.submitter;busy(b,true,"Logging in…");try{const {error}=await db.auth.signInWithPassword({email:$("#login-email").value.trim(),password:$("#login-password").value});if(error)throw error;}catch(x){message(x.message,true);}finally{busy(b,false);}});
  $("#post-form").addEventListener("submit",async e=>{e.preventDefault();const b=e.submitter,content=$("#post-content").value.trim(),file=$("#post-media").files[0];if(!content&&!file)return message("Write something or choose a photo/video.",true);busy(b,true,"Publishing…");try{const media=file?await uploadMedia(file,"post"):null;const {error}=await db.from("posts").insert({user_id:currentUser.id,content,image_url:media?.url||null,media_type:media?.type||null});if(error)throw error;$("#post-content").value="";$("#post-media").value="";$("#media-name").textContent="";message("Your post has been published.");loadFeed();}catch(x){message(x.message,true);}finally{busy(b,false);}});
  $("#profile-form").addEventListener("submit",async e=>{e.preventDefault();const b=e.submitter;busy(b,true,"Saving…");try{let avatarUrl=currentProfile?.avatar_url||null;const file=$("#avatar-file").files[0];if(file){const media=await uploadMedia(file,"avatar");if(media.type!=="image")throw new Error("Profile photo must be an image.");avatarUrl=media.url;}const username=$("#profile-username").value.trim().toLowerCase();if(username&&!/^[a-z0-9_]{3,30}$/.test(username))throw new Error("Username must be 3–30 characters using letters, numbers or underscores.");const {error}=await db.from("profiles").update({full_name:$("#profile-name").value.trim(),username:username||null,bio:$("#profile-bio").value.trim(),avatar_url:avatarUrl}).eq("id",currentUser.id);if(error)throw error;currentProfile=await getProfile(currentUser.id);message("Profile updated.");loadMyProfile();}catch(x){message(x.message,true);}finally{busy(b,false);}});
  $("#search-form").addEventListener("submit",e=>{e.preventDefault();searchPeople($("#search-input").value);});
  $("#global-search").addEventListener("keydown",e=>{if(e.key==="Enter"){$("#search-input").value=e.currentTarget.value;showTab("search");searchPeople(e.currentTarget.value);}});
  $("#back-button").addEventListener("click",()=>showTab("feed"));
  $("#save-settings").addEventListener("click",saveSettings);
}
async function init(){
  bind();loadSettings();fillSettings();
  if(!window.supabase?.createClient){message("Supabase library did not load. Check your internet connection.",true);return;}
  if(!SUPABASE_KEY||SUPABASE_KEY.includes("PASTE_YOUR")){message("Supabase publishable key is missing in app.js.",true);return;}
  try{
    db=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
    const {data,error}=await db.auth.getSession();if(error)throw error;
    await updateApp(data.session);
    db.auth.onAuthStateChange((_event,session)=>{setTimeout(()=>updateApp(session),0);});
  }catch(e){message(e.message,true);}
}
document.addEventListener("DOMContentLoaded",init);
