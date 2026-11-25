

/* =========================================
   KALIMSOCIAL — MAIN APP
   GitHub Pages + Supabase
========================================= */

const SUPABASE_URL = "https://kvwoyeusveepyjewrzpi.supabase.co";
const SUPABASE_KEY = "sb_publishable__kSVXsmw0d-erIP9doLa3g_J29aYfiv";
const STORAGE_BUCKET = "social-images";
const MAX_FILE_SIZE = 50 * 1024 * 1024;

let db;
let currentUser = null;
let currentProfile = null;
let posts = [];
let activeFilter = "all";
let activeConversationId = null;
let messageChannel = null;
let feedOffset = 0;
const PAGE_SIZE = 15;

const $ = (selector) => document.querySelector(selector);

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function setText(selector, value) {
  const node = $(selector);
  if (node) node.textContent = value ?? "";
}

function showMessage(selector, message) {
  setText(selector, message);
}

function safeImage(url) {
  return url || "https://placehold.co/100x100?text=User";
}

function formatDate(value) {
  return new Date(value).toLocaleString();
}

function escapeLike(value) {
  return value.replace(/[,%()]/g, "");
}

/* =========================================
   INITIALIZATION
========================================= */

document.addEventListener("DOMContentLoaded", init);

async function init() {
  if (!window.supabase) {
    alert("Supabase library load nahi hui. Internet aur script order check karo.");
    return;
  }

  if (SUPABASE_KEY.includes("PASTE_YOUR")) {
    alert("app.js mein apni Supabase publishable key paste karo.");
    return;
  }

  db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  bindEvents();

  const { data, error } = await db.auth.getSession();

  if (error) {
    console.error(error);
    return;
  }

  if (data.session) {
    await showApp(data.session.user);
  } else {
    showAuth();
  }

  db.auth.onAuthStateChange((event, session) => {
    setTimeout(async () => {
      if (session?.user) {
        await showApp(session.user);
      } else {
        showAuth();
      }
    }, 0);
  });
}

/* =========================================
   AUTHENTICATION
========================================= */

function showAuth() {
  currentUser = null;
  currentProfile = null;

  $("#auth-section")?.removeAttribute("hidden");
  $("#app")?.setAttribute("hidden", "");
  $("#header-login")?.removeAttribute("hidden");
  $("#header-user")?.replaceChildren($("#header-login"));
}

async function showApp(user) {
  currentUser = user;

  $("#auth-section")?.setAttribute("hidden", "");
  $("#app")?.removeAttribute("hidden");
  $("#header-login")?.setAttribute("hidden", "");

  await loadMyProfile();
  await loadFeed();
  await loadNotifications();
  await loadProfileStats();
  await loadConversations();

  setText("#account-email", user.email || "");
  setText("#header-user", currentProfile?.full_name || "Member");

  applyTheme();
}

async function loadMyProfile() {
  if (!currentUser) return;

  const { data, error } = await db
    .from("profiles")
    .select("*")
    .eq("id", currentUser.id)
    .maybeSingle();

  if (error) {
    console.error("Profile error:", error);
    return;
  }

  currentProfile = data;

  if (!currentProfile) {
    const username = "user" + currentUser.id.slice(0, 8);

    const { data: created, error: createError } = await db
      .from("profiles")
      .upsert({
        id: currentUser.id,
        full_name: currentUser.user_metadata?.full_name || "New Member",
        username
      })
      .select()
      .single();

    if (createError) {
      console.error(createError);
      return;
    }

    currentProfile = created;
  }

  renderMyProfile();
}

function renderMyProfile() {
  if (!currentProfile) return;

  const p = currentProfile;

  setText("#sidebar-name", p.full_name || "Member");
  setText("#sidebar-username", "@" + (p.username || "member"));
  setText("#profile-name", p.full_name || "Member");
  setText("#profile-username", "@" + (p.username || "member"));
  setText("#profile-bio", p.bio || "");

  if ($("#sidebar-avatar")) $("#sidebar-avatar").src = safeImage(p.avatar_url);
  if ($("#profile-avatar")) $("#profile-avatar").src = safeImage(p.avatar_url);

  if ($("#edit-full-name")) $("#edit-full-name").value = p.full_name || "";
  if ($("#edit-username")) $("#edit-username").value = p.username || "";
  if ($("#edit-bio")) $("#edit-bio").value = p.bio || "";
  if ($("#edit-avatar")) $("#edit-avatar").value = p.avatar_url || "";

  const completed = [
    p.full_name,
    p.username,
    p.bio,
    p.avatar_url
  ].filter(Boolean).length * 25;

  setText("#profile-progress-number", completed + "%");

  if ($("#profile-progress-bar")) {
    $("#profile-progress-bar").style.width = completed + "%";
  }
}

async function signup(event) {
  event.preventDefault();

  const fullName = $("#signup-name").value.trim();
  const username = $("#signup-username").value.trim().toLowerCase();
  const email = $("#signup-email").value.trim();
  const password = $("#signup-password").value;

  if (!/^[a-z0-9_]{3,20}$/.test(username)) {
    return showMessage("#auth-message", "Username 3–20 characters ka ho. Letters, numbers aur _ use karo.");
  }

  const { data, error } = await db.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        username
      }
    }
  });

  if (error) {
    return showMessage("#auth-message", error.message);
  }

  if (data.user && !data.session) {
    showMessage("#auth-message", "Account create ho gaya. Email confirmation check karo.");
  } else {
    showMessage("#auth-message", "Account created!");
  }
}

async function login(event) {
  event.preventDefault();

  const email = $("#login-email").value.trim();
  const password = $("#login-password").value;

  const { error } = await db.auth.signInWithPassword({
    email,
    password
  });

  if (error) showMessage("#auth-message", error.message);
}

async function logout() {
  if (!db) return;
  await db.auth.signOut();
}

/* =========================================
   NAVIGATION
========================================= */

function switchTab(tab) {
  document.querySelectorAll(".view").forEach(view => {
    view.hidden = true;
  });

  const target = $("#" + tab + "-view");
  if (target) target.hidden = false;

  document.querySelectorAll("[data-tab]").forEach(button => {
    button.classList.toggle("active", button.dataset.tab === tab);
  });

  if (tab === "feed") loadFeed();
  if (tab === "profile") loadMyPosts();
  if (tab === "notifications") loadNotifications();
  if (tab === "messages") loadConversations();
}

/* =========================================
   IMAGE / VIDEO UPLOAD
========================================= */

async function uploadMedia(file) {
  if (!file) return null;

  if (file.size > MAX_FILE_SIZE) {
    throw new Error("File 50MB se chhoti honi chahiye. Supabase project limit bhi apply hoti hai.");
  }

  if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
    throw new Error("Sirf image ya video upload kar sakte ho.");
  }

  const extension = file.name.split(".").pop().toLowerCase();
  const path = `${currentUser.id}/${Date.now()}-${crypto.randomUUID()}.${extension}`;

  if ($("#upload-progress-wrap")) {
    $("#upload-progress-wrap").hidden = false;
  }

  setText("#upload-progress-text", "Uploading...");

  const { error } = await db.storage
    .from(STORAGE_BUCKET)
    .upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type
    });

  if (error) throw error;

  const { data } = db.storage
    .from(STORAGE_BUCKET)
    .getPublicUrl(path);

  if ($("#upload-progress")) {
    $("#upload-progress").style.width = "100%";
  }

  setText("#upload-progress-text", "Upload complete");

  return {
    url: data.publicUrl,
    type: file.type.startsWith("video/") ? "video" : "image",
    name: file.name,
    size: file.size
  };
}

/* =========================================
   CREATE POST
========================================= */

async function publishPost() {
  if (!currentUser) return;

  const content = $("#post-content").value.trim();
  const file = $("#post-media")?.files?.[0];

  if (!content && !file) {
    return showMessage("#upload-status", "Post mein text ya media add karo.");
  }

  try {
    let media = null;

    if (file) {
      media = await uploadMedia(file);
    }

    const { error } = await db.from("posts").insert({
      user_id: currentUser.id,
      content,
      image_url: media?.url || null,
      media_type: media?.type || "text",
      media_name: media?.name || null,
      media_size: media?.size || null
    });

    if (error) throw error;

    $("#post-content").value = "";
    $("#post-media").value = "";
    $("#media-preview")?.replaceChildren();

    showMessage("#upload-status", "Post published!");
    await loadFeed();
    await loadMyPosts();

  } catch (error) {
    console.error(error);
    showMessage("#upload-status", error.message || "Post publish nahi hui.");
  }
}

/* =========================================
   FEED
========================================= */

async function loadFeed() {
  if (!currentUser) return;

  const feed = $("#feed");
  if (!feed) return;

  feed.replaceChildren(el("p", "", "Loading posts..."));

  let query = db
    .from("posts")
    .select("*")
    .order("created_at", { ascending: false })
    .range(feedOffset, feedOffset + PAGE_SIZE - 1);

  if (activeFilter === "media") {
    query = query.in("media_type", ["image", "video"]);
  }

  const { data, error } = await query;

  if (error) {
    console.error(error);
    feed.replaceChildren(el("p", "", "Feed load nahi hui."));
    return;
  }

  let rows = data || [];

  if (activeFilter === "following") {
    const { data: follows } = await db
      .from("follows")
      .select("following_id")
      .eq("follower_id", currentUser.id);

    const followingIds = (follows || []).map(x => x.following_id);
    rows = rows.filter(post =>
      post.user_id === currentUser.id ||
      followingIds.includes(post.user_id)
    );
  }

  posts = rows;
  await renderPosts(rows, feed);
}

async function renderPosts(rows, container) {
  container.replaceChildren();

  if (!rows.length) {
    container.append(el("p", "empty-state", "Abhi koi post nahi. Pehli post share karo!"));
    return;
  }

  const authorIds = [...new Set(rows.map(p => p.user_id))];

  const { data: profiles } = await db
    .from("profiles")
    .select("id,full_name,username,avatar_url")
    .in("id", authorIds);

  const profileMap = new Map((profiles || []).map(p => [p.id, p]));

  const postIds = rows.map(p => p.id);

  const { data: likes } = await db
    .from("likes")
    .select("post_id,user_id")
    .in("post_id", postIds);

  const { data: comments } = await db
    .from("comments")
    .select("post_id")
    .in("post_id", postIds);

  for (const post of rows) {
    const author = profileMap.get(post.user_id);
    const postLikes = (likes || []).filter(x => x.post_id === post.id);
    const commentCount = (comments || []).filter(x => x.post_id === post.id).length;
    const liked = postLikes.some(x => x.user_id === currentUser.id);

    const card = el("article", "post-card");

    const header = el("div", "post-header");
    const avatar = el("img");
    avatar.src = safeImage(author?.avatar_url);
    avatar.alt = "Profile picture";

    const authorInfo = el("div");
    authorInfo.append(
      el("strong", "", author?.full_name || "Member"),
      el("p", "", "@" + (author?.username || "member") + " · " + formatDate(post.created_at))
    );

    header.append(avatar, authorInfo);
    card.append(header);

    if (post.content) {
      card.append(el("p", "post-content", post.content));
    }

    if (post.image_url) {
      if (post.media_type === "video") {
        const video = el("video", "post-media");
        video.src = post.image_url;
        video.controls = true;
        video.playsInline = true;
        video.preload = "metadata";
        card.append(video);
      } else {
        const image = el("img", "post-media");
        image.src = post.image_url;
        image.alt = "Post image";
        image.loading = "lazy";
        card.append(image);
      }
    }

    const actions = el("div", "post-actions");

    const likeButton = el("button", "", (liked ? "❤️ " : "🤍 ") + postLikes.length);
    likeButton.addEventListener("click", () => toggleLike(post.id, liked));

    const commentButton = el("button", "", "💬 " + commentCount + " Comments");
    commentButton.addEventListener("click", () => showComments(post.id));

    actions.append(likeButton, commentButton);

    if (post.user_id === currentUser.id) {
      const deleteButton = el("button", "", "Delete");
      deleteButton.addEventListener("click", () => deletePost(post.id));
      actions.append(deleteButton);
    }

    card.append(actions);
    container.append(card);
  }
}

/* =========================================
   LIKES
========================================= */

async function toggleLike(postId, liked) {
  if (liked) {
    const { error } = await db
      .from("likes")
      .delete()
      .eq("post_id", postId)
      .eq("user_id", currentUser.id);

    if (error) return alert(error.message);
  } else {
    const { error } = await db.from("likes").insert({
      post_id: postId,
      user_id: currentUser.id
    });

    if (error && error.code !== "23505") {
      return alert(error.message);
    }
  }

  await loadFeed();
  await loadMyPosts();
}

/* =========================================
   COMMENTS
========================================= */

async function showComments(postId) {
  const { data, error } = await db
    .from("comments")
    .select("*")
    .eq("post_id", postId)
    .order("created_at", { ascending: true });

  if (error) return alert(error.message);

  const container = el("div");
  container.append(el("h3", "", "Comments"));

  for (const comment of (data || [])) {
    const { data: profile } = await db
      .from("profiles")
      .select("username")
      .eq("id", comment.user_id)
      .maybeSingle();

    container.append(
      el("p", "", "@" + (profile?.username || "member") + ": " + comment.content)
    );
  }

  const form = el("form");
  const input = el("input");
  input.placeholder = "Write a comment...";
  input.maxLength = 1000;
  input.required = true;

  const button = el("button", "primary-btn", "Comment");
  button.type = "submit";

  form.append(input, button);

  form.addEventListener("submit", async event => {
    event.preventDefault();

    const content = input.value.trim();
    if (!content) return;

    const { error } = await db.from("comments").insert({
      post_id: postId,
      user_id: currentUser.id,
      content
    });

    if (error) return alert(error.message);

    modalClose();
    await showComments(postId);
    await loadFeed();
  });

  container.append(form);

  const old = $("#comment-modal");
  if (old) old.remove();

  const modal = el("div");
  modal.id = "comment-modal";
  modal.className = "card";
  modal.style.position = "fixed";
  modal.style.zIndex = "200";
  modal.style.top = "10%";
  modal.style.left = "50%";
  modal.style.transform = "translateX(-50%)";
  modal.style.width = "min(90%,500px)";
  modal.style.maxHeight = "75vh";
  modal.style.overflowY = "auto";

  const close = el("button", "secondary-btn", "Close");
  close.addEventListener("click", modalClose);

  modal.append(container, close);
  document.body.append(modal);
}

function modalClose() {
  $("#comment-modal")?.remove();
}

/* =========================================
   DELETE POST
========================================= */

async function deletePost(postId) {
  if (!confirm("Kya tum yeh post delete karna chahte ho?")) return;

  const { error } = await db
    .from("posts")
    .delete()
    .eq("id", postId)
    .eq("user_id", currentUser.id);

  if (error) return alert(error.message);

  await loadFeed();
  await loadMyPosts();
}

/* =========================================
   PROFILE
========================================= */

async function saveProfile(event) {
  event.preventDefault();

  const updates = {
    id: currentUser.id,
    full_name: $("#edit-full-name").value.trim(),
    username: $("#edit-username").value.trim().toLowerCase(),
    bio: $("#edit-bio").value.trim(),
    avatar_url: $("#edit-avatar").value.trim()
  };

  if (!/^[a-z0-9_]{3,20}$/.test(updates.username)) {
    return alert("Username 3–20 characters ka hona chahiye.");
  }

  const { data, error } = await db
    .from("profiles")
    .upsert(updates)
    .select()
    .single();

  if (error) return alert(error.message);

  currentProfile = data;
  renderMyProfile();
  alert("Profile updated!");
}

async function loadMyPosts() {
  if (!currentUser) return;

  const { data, error } = await db
    .from("posts")
    .select("*")
    .eq("user_id", currentUser.id)
    .order("created_at", { ascending: false });

  if (error) return console.error(error);

  const container = $("#profile-posts");
  if (container) await renderPosts(data || [], container);
}

/* =========================================
   FOLLOW / UNFOLLOW
========================================= */

async function toggleFollow(targetId, isFollowing) {
  if (targetId === currentUser.id) return;

  if (isFollowing) {
    const { error } = await db
      .from("follows")
      .delete()
      .eq("follower_id", currentUser.id)
      .eq("following_id", targetId);

    if (error) return alert(error.message);
  } else {
    const { error } = await db.from("follows").insert({
      follower_id: currentUser.id,
      following_id: targetId
    });

    if (error && error.code !== "23505") return alert(error.message);
  }

  await loadProfileStats();
  await openOtherProfile(targetId);
}

async function loadProfileStats() {
  if (!currentUser) return;

  const { count: postsCount } = await db
    .from("posts")
    .select("*", { count: "exact", head: true })
    .eq("user_id", currentUser.id);

  const { count: followersCount } = await db
    .from("follows")
    .select("*", { count: "exact", head: true })
    .eq("following_id", currentUser.id);

  const { count: followingCount } = await db
    .from("follows")
    .select("*", { count: "exact", head: true })
    .eq("follower_id", currentUser.id);

  setText("#profile-post-count", (postsCount || 0) + " Posts");
  setText("#profile-followers", (followersCount || 0) + " Followers");
  setText("#profile-following", (followingCount || 0) + " Following");
}

/* =========================================
   SEARCH PEOPLE
========================================= */

async function searchPeople() {
  const term = escapeLike($("#feed-search").value.trim());

  if (term.length < 2) {
    return showMessage("#search-results", "Kam az kam 2 characters likho.");
  }

  const { data, error } = await db
    .from("profiles")
    .select("id,full_name,username,avatar_url")
    .or(`username.ilike.%${term}%,full_name.ilike.%${term}%`)
    .limit(20);

  if (error) return showMessage("#search-results", error.message);

  const container = $("#search-results");
  container.replaceChildren();

  for (const person of (data || [])) {
    const row = el("div", "new-message-person");
    const img = el("img");
    img.src = safeImage(person.avatar_url);
    img.width = 42;
    img.height = 42;

    const info = el("span", "", `${person.full_name || "Member"} (@${person.username || "member"})`);

    const view = el("button", "secondary-btn", "View profile");
    view.addEventListener("click", () => openOtherProfile(person.id));

    row.append(img, info, view);
    container.append(row);
  }
}

async function openOtherProfile(userId) {
  const { data: person, error } = await db
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();

  if (error) return alert(error.message);

  const { data: follow } = await db
    .from("follows")
    .select("follower_id")
    .eq("follower_id", currentUser.id)
    .eq("following_id", userId)
    .maybeSingle();

  const container = $("#other-profile-content");
  container.replaceChildren();

  const card = el("div", "card");
  const img = el("img");
  img.src = safeImage(person.avatar_url);
  img.width = 90;
  img.height = 90;

  card.append(
    img,
    el("h2", "", person.full_name || "Member"),
    el("p", "", "@" + (person.username || "member")),
    el("p", "", person.bio || "")
  );

  if (userId !== currentUser.id) {
    const followButton = el("button", "primary-btn", follow ? "Following" : "Follow");
    followButton.addEventListener("click", () => toggleFollow(userId, !!follow));
    card.append(followButton);

    const messageButton = el("button", "secondary-btn", "Message");
    messageButton.addEventListener("click", async () => {
      switchTab("messages");
      await startConversation(userId);
    });
    card.append(messageButton);
  }

  container.append(card);

  const { data: personPosts } = await db
    .from("posts")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  const postContainer = el("div");
  container.append(postContainer);
  await renderPosts(personPosts || [], postContainer);

  switchTab("other-profile");
}

/* =========================================
   NOTIFICATIONS
========================================= */

async function loadNotifications() {
  if (!currentUser) return;

  const { data, error } = await db
    .from("notifications")
    .select("*")
    .eq("user_id", currentUser.id)
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) {
    console.error(error);
    return;
  }

  const container = $("#notifications-list");
  if (!container) return;

  container.replaceChildren();

  for (const item of (data || [])) {
    const row = el("div");
    row.append(
      el("p", "", item.type || "New notification"),
      el("small", "", formatDate(item.created_at))
    );
    container.append(row);
  }

  if (!data?.length) {
    container.append(el("p", "empty-state", "No notifications yet."));
  }
}

/* =========================================
   MESSAGING
========================================= */

async function loadConversations() {
  if (!currentUser || !$("#conversation-items")) return;

  const container = $("#conversation-items");
  container.replaceChildren(el("p", "", "Loading chats..."));

  const { data: memberships, error } = await db
    .from("conversation_members")
    .select("conversation_id,last_read_at")
    .eq("user_id", currentUser.id);

  if (error) {
    console.error(error);
    container.replaceChildren(el("p", "", "Chats load nahi huay."));
    return;
  }

  container.replaceChildren();

  for (const membership of (memberships || [])) {
    const { data: members } = await db
      .from("conversation_members")
      .select("user_id")
      .eq("conversation_id", membership.conversation_id);

    const other = (members || []).find(m => m.user_id !== currentUser.id);
    if (!other) continue;

    const { data: profile } = await db
      .from("profiles")
      .select("id,full_name,username,avatar_url")
      .eq("id", other.user_id)
      .maybeSingle();

    if (!profile) continue;

    const { data: lastMessage } = await db
      .from("messages")
      .select("content,created_at")
      .eq("conversation_id", membership.conversation_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const row = el("div", "conversation-item");
    row.append(
      el("strong", "", profile.full_name || profile.username || "Member"),
      el("small", "", lastMessage?.content || "Start a conversation")
    );

    row.addEventListener("click", () => {
      openConversation(membership.conversation_id, profile);
    });

    container.append(row);
  }

  if (!memberships?.length) {
    container.append(el("p", "empty-state", "No conversations yet. New Message par click karo."));
  }
}

async function startConversation(otherUserId) {
  if (!currentUser || otherUserId === currentUser.id) return;

  const { data: mine } = await db
    .from("conversation_members")
    .select("conversation_id")
    .eq("user_id", currentUser.id);

  for (const item of (mine || [])) {
    const { data: other } = await db
      .from("conversation_members")
      .select("user_id")
      .eq("conversation_id", item.conversation_id)
      .eq("user_id", otherUserId)
      .maybeSingle();

    if (other) {
      const { data: profile } = await db
        .from("profiles")
        .select("id,full_name,username,avatar_url")
        .eq("id", otherUserId)
        .single();

      return openConversation(item.conversation_id, profile);
    }
  }

  const { data: conversation, error } = await db
    .from("conversations")
    .insert({})
    .select()
    .single();

  if (error) return alert("Conversation create error: " + error.message);

  const { error: firstMemberError } = await db
    .from("conversation_members")
    .insert({
      conversation_id: conversation.id,
      user_id: currentUser.id
    });

  if (firstMemberError) return alert(firstMemberError.message);

  const { error: secondMemberError } = await db
    .from("conversation_members")
    .insert({
      conversation_id: conversation.id,
      user_id: otherUserId
    });

  if (secondMemberError) {
    return alert("Doosra member add nahi hua: " + secondMemberError.message);
  }

  const { data: profile } = await db
    .from("profiles")
    .select("id,full_name,username,avatar_url")
    .eq("id", otherUserId)
    .single();

  await loadConversations();
  await openConversation(conversation.id, profile);
}

async function openConversation(conversationId, profile) {
  activeConversationId = conversationId;

  $("#chat-empty").hidden = true;
  $("#active-chat").hidden = false;

  const header = $("#chat-header");
  header.replaceChildren(
    el("strong", "", profile?.full_name || profile?.username || "Member")
  );

  await loadMessages();

  await db
    .from("conversation_members")
    .update({ last_read_at: new Date().toISOString() })
    .eq("conversation_id", conversationId)
    .eq("user_id", currentUser.id);

  if (messageChannel) {
    await db.removeChannel(messageChannel);
    messageChannel = null;
  }

  messageChannel = db
    .channel("messages-" + conversationId)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: "conversation_id=eq." + conversationId
      },
      () => loadMessages()
    )
    .subscribe();

  await loadConversations();
}

async function loadMessages() {
  if (!activeConversationId) return;

  const { data, error } = await db
    .from("messages")
    .select("*")
    .eq("conversation_id", activeConversationId)
    .order("created_at", { ascending: true })
    .limit(100);

  if (error) {
    console.error(error);
    return;
  }

  const container = $("#chat-messages");
  container.replaceChildren();

  for (const message of (data || [])) {
    if (message.is_deleted) continue;

    const bubble = el(
      "div",
      "message-bubble" + (message.sender_id === currentUser.id ? " mine" : ""),
      message.content
    );

    bubble.append(
      el("small", "message-time", formatDate(message.created_at))
    );

    container.append(bubble);
  }

  container.scrollTop = container.scrollHeight;
}

async function sendMessage(event) {
  event.preventDefault();

  if (!activeConversationId) return;

  const input = $("#message-input");
  const content = input.value.trim();

  if (!content) return;

  const { error } = await db.from("messages").insert({
    conversation_id: activeConversationId,
    sender_id: currentUser.id,
    content
  });

  if (error) return alert("Message send error: " + error.message);

  input.value = "";

  await db
    .from("conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", activeConversationId);

  await loadMessages();
  await loadConversations();
}

async function searchMessagePeople() {
  const term = escapeLike($("#new-message-search").value.trim());

  if (term.length < 2) return;

  const { data, error } = await db
    .from("profiles")
    .select("id,full_name,username,avatar_url")
    .or(`username.ilike.%${term}%,full_name.ilike.%${term}%`)
    .neq("id", currentUser.id)
    .limit(15);

  if (error) return console.error(error);

  const container = $("#new-message-results");
  container.replaceChildren();

  for (const person of (data || [])) {
    const button = el(
      "button",
      "new-message-person",
      `${person.full_name || "Member"} (@${person.username || "member"})`
    );

    button.type = "button";
    button.addEventListener("click", async () => {
      $("#new-message-modal").hidden = true;
      await startConversation(person.id);
    });

    container.append(button);
  }
}

/* =========================================
   THEME
========================================= */

function applyTheme() {
  const theme = localStorage.getItem("kalim-theme") || "light";

  document.body.classList.toggle("dark-theme", theme === "dark");

  if ($("#theme-select")) {
    $("#theme-select").value = theme;
  }
}

function changeTheme(value) {
  localStorage.setItem("kalim-theme", value);
  applyTheme();
}

/* =========================================
   EVENT LISTENERS
========================================= */

function bindEvents() {
  $("#login-form")?.addEventListener("submit", login);
  $("#signup-form")?.addEventListener("submit", signup);

  $("#header-login")?.addEventListener("click", () => {
    $("#auth-section")?.removeAttribute("hidden");
  });

  $("#publish-post")?.addEventListener("click", publishPost);
  $("#profile-form")?.addEventListener("submit", saveProfile);
  $("#search-form")?.addEventListener("submit", event => {
    event.preventDefault();
    searchPeople();
  });

  $("#logout-button")?.addEventListener("click", logout);
  $("#settings-logout")?.addEventListener("click", logout);

  document.querySelectorAll("[data-tab]").forEach(button => {
    button.addEventListener("click", () => switchTab(button.dataset.tab));
  });

  document.querySelectorAll("[data-feed-filter]").forEach(button => {
    button.addEventListener("click", () => {
      activeFilter = button.dataset.feedFilter;
      feedOffset = 0;

      document.querySelectorAll("[data-feed-filter]").forEach(item => {
        item.classList.toggle("active", item === button);
      });

      loadFeed();
    });
  });

  $("#load-more-posts")?.addEventListener("click", () => {
    feedOffset += PAGE_SIZE;
    loadFeed();
  });

  $("#post-media")?.addEventListener("change", event => {
    const file = event.target.files?.[0];
    const preview = $("#media-preview");

    preview.replaceChildren();
    if (!file) return;

    const url = URL.createObjectURL(file);
    const media = file.type.startsWith("video/")
      ? el("video")
      : el("img");

    media.src = url;

    if (media.tagName === "VIDEO") {
      media.controls = true;
    }

    preview.append(media);
  });

  $("#theme-select")?.addEventListener("change", event => {
    changeTheme(event.target.value);
  });

  $("#new-message-button")?.addEventListener("click", () => {
    $("#new-message-modal").hidden = false;
  });

  $("#close-message-modal")?.addEventListener("click", () => {
    $("#new-message-modal").hidden = true;
  });

  $("#new-message-search")?.addEventListener("input", searchMessagePeople);
  $("#message-form")?.addEventListener("submit", sendMessage);

  $("#conversation-search")?.addEventListener("input", event => {
    const term = event.target.value.toLowerCase();

    document.querySelectorAll(".conversation-item").forEach(item => {
      item.hidden = !item.textContent.toLowerCase().includes(term);
    });
  });

  $("#global-search")?.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      $("#feed-search").value = event.target.value;
      switchTab("search");
      searchPeople();
    }
  });
}
