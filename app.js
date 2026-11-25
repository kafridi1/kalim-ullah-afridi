
/* ======================================
   KALIM SOCIAL - READY APP.JS
====================================== */

const SUPABASE_URL = "https://kvwoyeusveepyjewrzpi.supabase.co";
const SUPABASE_KEY = "sb_publishable__kSVXsmw0d-erIP9doLa3g_J29aYfiv";
const STORAGE_BUCKET = "social-images";
const MAX_FILE_SIZE = 50 * 1024 * 1024;

let db = null;
let currentUser = null;
let currentProfile = null;
let selectedFile = null;
let currentFilter = "all";
let feedSearch = "";
let realtimeChannel = null;
let isLoadingFeed = false;

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

function showMessage(text, error = false) {
  const el = $("#message");
  if (el) {
    el.textContent = text;
    el.style.color = error ? "#e5485d" : "";
  }
  console.log(text);
}

function notify(text, error = false) {
  const el = $("#upload-status");
  if (el) {
    el.textContent = text;
    el.style.color = error ? "#e5485d" : "";
  }
  showMessage(text, error);
}

function makeElement(tag, className = "", text = "") {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text) el.textContent = text;
  return el;
}

function makeButton(text, callback, className = "") {
  const btn = makeElement("button", className, text);
  btn.type = "button";
  btn.addEventListener("click", callback);
  return btn;
}

function setButtonLoading(btn, loading, text = "Please wait...") {
  if (!btn) return;

  if (loading) {
    btn.dataset.oldText = btn.textContent;
    btn.textContent = text;
    btn.disabled = true;
  } else {
    btn.textContent = btn.dataset.oldText || btn.textContent;
    btn.disabled = false;
  }
}

function formatDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleString();
}

function getInitials(name = "Member") {
  return name.split(/\s+/).slice(0, 2)
    .map(x => x[0] || "")
    .join("").toUpperCase();
}

function makeAvatar(profile) {
  if (profile?.avatar_url) {
    const img = makeElement("img", "avatar");
    img.src = profile.avatar_url;
    img.alt = "Avatar";
    return img;
  }

  return makeElement(
    "div",
    "avatar avatar-placeholder",
    getInitials(profile?.full_name || "Member")
  );
}

/* ======================================
   AUTH AND PROFILE
====================================== */

async function getProfile(userId) {
  const { data, error } = await db
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function refreshProfile() {
  if (!currentUser) return;

  currentProfile = await getProfile(currentUser.id);
  updateProfileUI();
}

function updateProfileUI() {
  if (!currentProfile) return;

  const name = currentProfile.full_name || "Member";
  const username = currentProfile.username
    ? "@" + currentProfile.username
    : "@member";

  const sidebarName = $("#sidebar-name");
  const sidebarUsername = $("#sidebar-username");

  if (sidebarName) sidebarName.textContent = name;
  if (sidebarUsername) sidebarUsername.textContent = username;

  const oldAvatar = $("#sidebar-avatar");
  if (oldAvatar) {
    const newAvatar = makeAvatar(currentProfile);
    newAvatar.id = "sidebar-avatar";
    oldAvatar.replaceWith(newAvatar);
  }

  const email = $("#account-email");
  if (email) email.textContent = currentUser.email || "";

  updateProfileProgress();
}

async function updateApp(session) {
  currentUser = session?.user || null;

  const auth = $("#auth-section");
  const home = $("#home-section");
  const headerLogin = $("#header-login");
  const headerUser = $("#header-user");

  if (auth) auth.hidden = !!currentUser;
  if (home) home.hidden = !currentUser;
  if (headerLogin) headerLogin.hidden = !!currentUser;
  if (headerUser) headerUser.hidden = !currentUser;

  if (!currentUser) {
    currentProfile = null;

    if (realtimeChannel && db) {
      await db.removeChannel(realtimeChannel);
      realtimeChannel = null;
    }
    return;
  }

  try {
    await refreshProfile();
    await loadFollowing();
    subscribeRealtime();
    switchTab("feed");
  } catch (error) {
    console.error(error);
    showMessage(error.message, true);
  }
}

/* ======================================
   NAVIGATION
====================================== */

function switchTab(tab) {
  const viewIds = [
    "feed",
    "profile",
    "search",
    "notifications",
    "messages",
    "settings",
    "other-profile"
  ];

  viewIds.forEach(name => {
    const view = $(`#${name}-view`);
    if (view) view.hidden = name !== tab;
  });

  $$("[data-tab]").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.tab === tab);
  });

  if (tab === "feed") loadFeed();
  if (tab === "profile") loadMyProfile();
  if (tab === "notifications") loadNotifications();
}

/* ======================================
   FILE UPLOAD
====================================== */

function showProgress(percent) {
  const wrap = $("#upload-progress-wrap");
  const bar = $("#upload-progress");
  const text = $("#upload-progress-text");

  if (wrap) wrap.hidden = false;
  if (bar) bar.style.width = percent + "%";
  if (text) text.textContent = percent + "%";
}

function hideProgress() {
  const wrap = $("#upload-progress-wrap");
  if (wrap) wrap.hidden = true;
}

async function uploadMedia(file) {
  if (!file) return null;

  const image = file.type.startsWith("image/");
  const video = file.type.startsWith("video/");

  if (!image && !video) {
    throw new Error("Only images and videos are supported.");
  }

  if (file.size > MAX_FILE_SIZE) {
    throw new Error("File size must be 50 MB or less.");
  }

  const allowed = [
    "image/jpeg", "image/png", "image/webp", "image/gif",
    "video/mp4", "video/webm"
  ];

  if (!allowed.includes(file.type)) {
    throw new Error("Unsupported file format.");
  }

  const filename = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${currentUser.id}/${crypto.randomUUID()}-${filename}`;

  notify("Uploading...");
  showProgress(10);

  const { error } = await db.storage
    .from(STORAGE_BUCKET)
    .upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type
    });

  if (error) throw error;

  showProgress(100);

  const { data } = db.storage
    .from(STORAGE_BUCKET)
    .getPublicUrl(path);

  return {
    url: data.publicUrl,
    type: video ? "video" : "image",
    name: file.name,
    size: file.size
  };
}

function previewMedia(file) {
  const preview = $("#media-preview");
  if (!preview) return;

  preview.replaceChildren();

  if (!file) {
    preview.hidden = true;
    return;
  }

  const url = URL.createObjectURL(file);

  if (file.type.startsWith("video/")) {
    const video = makeElement("video");
    video.src = url;
    video.controls = true;
    video.playsInline = true;
    preview.append(video);
  } else {
    const img = makeElement("img");
    img.src = url;
    img.alt = "Preview";
    preview.append(img);
  }

  preview.hidden = false;
}

/* ======================================
   CREATE POST
====================================== */

async function createPost() {
  const content = $("#post-content")?.value.trim() || "";

  if (!content && !selectedFile) {
    notify("Write a post or select media.", true);
    return;
  }

  const btn = $("#publish-post");
  setButtonLoading(btn, true, "Publishing...");

  try {
    let media = null;

    if (selectedFile) {
      media = await uploadMedia(selectedFile);
    }

    const { error } = await db.from("posts").insert({
      user_id: currentUser.id,
      content: content || null,
      image_url: media?.url || null,
      media_type: media?.type || "text",
      media_name: media?.name || null,
      media_size: media?.size || null
    });

    if (error) throw error;

    $("#post-content").value = "";
    $("#post-media").value = "";
    $("#media-preview")?.replaceChildren();

    if ($("#media-preview")) $("#media-preview").hidden = true;

    selectedFile = null;
    hideProgress();
    notify("Post published!");
    await loadFeed();

  } catch (error) {
    console.error(error);
    notify(error.message, true);
  } finally {
    setButtonLoading(btn, false);
  }
}

/* ======================================
   FOLLOWING
====================================== */

let followingIds = new Set();

async function loadFollowing() {
  const { data, error } = await db
    .from("follows")
    .select("following_id")
    .eq("follower_id", currentUser.id);

  if (error) throw error;

  followingIds = new Set(
    (data || []).map(x => x.following_id)
  );
}

/* ======================================
   FEED
====================================== */

async function loadFeed(userId = null, containerId = "feed") {
  if (!currentUser || isLoadingFeed) return;

  const container = $(`#${containerId}`);
  if (!container) return;

  isLoadingFeed = true;
  container.replaceChildren(
    makeElement("p", "empty-state", "Loading posts...")
  );

  try {
    let query = db.from("posts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(40);

    if (userId) query = query.eq("user_id", userId);

    const { data: posts, error } = await query;
    if (error) throw error;

    if (!posts?.length) {
      container.replaceChildren(
        makeElement("p", "empty-state", "No posts yet.")
      );
      return;
    }

    const postIds = posts.map(p => p.id);
    const userIds = [...new Set(posts.map(p => p.user_id))];

    const [profilesRes, likesRes, commentsRes] = await Promise.all([
      db.from("profiles")
        .select("id,full_name,username,avatar_url")
        .in("id", userIds),

      db.from("likes")
        .select("post_id,user_id")
        .in("post_id", postIds),

      db.from("comments")
        .select("id,post_id,user_id,content,created_at")
        .in("post_id", postIds)
        .order("created_at", { ascending: true })
    ]);

    if (profilesRes.error) throw profilesRes.error;
    if (likesRes.error) throw likesRes.error;
    if (commentsRes.error) throw commentsRes.error;

    const profiles = new Map(
      (profilesRes.data || []).map(p => [p.id, p])
    );

    const likes = likesRes.data || [];
    const comments = commentsRes.data || [];

    let visible = posts;

    if (!userId && currentFilter === "following") {
      visible = visible.filter(p =>
        followingIds.has(p.user_id) || p.user_id === currentUser.id
      );
    }

    if (!userId && currentFilter === "media") {
      visible = visible.filter(p => p.image_url);
    }

    if (feedSearch) {
      visible = visible.filter(p =>
        (p.content || "").toLowerCase().includes(feedSearch.toLowerCase())
      );
    }

    container.replaceChildren();

    if (!visible.length) {
      container.append(
        makeElement("p", "empty-state", "No matching posts.")
      );
      return;
    }

    visible.forEach(post => {
      const profile = profiles.get(post.user_id);
      const postLikes = likes.filter(x => x.post_id === post.id);
      const postComments = comments.filter(x => x.post_id === post.id);

      const liked = postLikes.some(
        x => x.user_id === currentUser.id
      );

      const card = makeElement("article", "card post-card");

      const header = makeElement("div", "post-head");
      header.append(makeAvatar(profile));

      const author = makeElement("div", "post-author");
      author.append(makeElement(
        "strong", "", profile?.full_name || "Member"
      ));
      author.append(makeElement(
        "small", "", `${profile?.username ? "@" + profile.username + " · " : ""}${formatDate(post.created_at)}`
      ));

      header.append(author);

      if (post.user_id !== currentUser.id) {
        header.append(makeButton("Profile", () => openProfile(post.user_id)));
      }

      card.append(header);

      if (post.content) {
        card.append(makeElement("p", "post-body", post.content));
      }

      if (post.image_url) {
        const type = post.media_type ||
          (/\.(mp4|webm|mov)(\?|$)/i.test(post.image_url)
            ? "video" : "image");

        if (type === "video") {
          const video = makeElement("video", "post-image");
          video.src = post.image_url;
          video.controls = true;
          video.playsInline = true;
          video.preload = "metadata";
          card.append(video);
        } else {
          const img = makeElement("img", "post-image");
          img.src = post.image_url;
          img.alt = "Post media";
          img.loading = "lazy";
          card.append(img);
        }
      }

      card.append(makeElement(
        "div",
        "post-stats",
        `${postLikes.length} likes · ${postComments.length} comments`
      ));

      const actions = makeElement("div", "post-actions");

      actions.append(makeButton(
        liked ? "♥ Liked" : "♡ Like",
        () => toggleLike(post.id, liked)
      ));

      if (post.user_id === currentUser.id) {
        actions.append(makeButton(
          "Delete",
          () => deletePost(post.id)
        ));
      }

      card.append(actions);

      const commentArea = makeElement("div", "comment-area");

      postComments.forEach(comment => {
        const commentProfile = profiles.get(comment.user_id);
        commentArea.append(makeElement(
          "p",
          "comment",
          `${commentProfile?.full_name || "Member"}: ${comment.content}`
        ));
      });

      const form = makeElement("form", "comment-form");
      const input = makeElement("input");
      input.placeholder = "Write a comment...";
      input.maxLength = 1000;
      input.required = true;

      const send = makeElement("button", "", "Send");
      send.type = "submit";

      form.append(input, send);

      form.addEventListener("submit", async event => {
        event.preventDefault();

        const value = input.value.trim();
        if (!value) return;

        send.disabled = true;

        try {
          const { error } = await db.from("comments").insert({
            post_id: post.id,
            user_id: currentUser.id,
            content: value
          });

          if (error) throw error;
          await loadFeed(userId, containerId);
        } catch (error) {
          showMessage(error.message, true);
        } finally {
          send.disabled = false;
        }
      });

      commentArea.append(form);
      card.append(commentArea);
      container.append(card);
    });

  } catch (error) {
    console.error(error);
    container.replaceChildren(
      makeElement("p", "empty-state", error.message)
    );
  } finally {
    isLoadingFeed = false;
  }
}

/* ======================================
   LIKES
====================================== */

async function toggleLike(postId, liked) {
  try {
    const result = liked
      ? await db.from("likes").delete()
          .eq("post_id", postId)
          .eq("user_id", currentUser.id)
      : await db.from("likes").insert({
          post_id: postId,
          user_id: currentUser.id
        });

    if (result.error) throw result.error;
    await loadFeed();
  } catch (error) {
    showMessage(error.message, true);
  }
}

/* ======================================
   DELETE POST
====================================== */

async function deletePost(postId) {
  if (!confirm("Delete this post?")) return;

  try {
    const { error } = await db.from("posts")
      .delete()
      .eq("id", postId)
      .eq("user_id", currentUser.id);

    if (error) throw error;
    await loadFeed();
  } catch (error) {
    showMessage(error.message, true);
  }
}

/* ======================================
   PROFILE
====================================== */

async function loadMyProfile() {
  try {
    await refreshProfile();

    const target = $("#my-profile");
    if (target) {
      target.replaceChildren();

      const info = makeElement("div", "profile-info");
      info.append(makeAvatar(currentProfile));

      info.append(makeElement(
        "h2", "profile-name",
        currentProfile?.full_name || "Your name"
      ));

      info.append(makeElement(
        "p", "profile-handle",
        currentProfile?.username
          ? "@" + currentProfile.username : ""
      ));

      info.append(makeElement(
        "p", "profile-bio",
        currentProfile?.bio || ""
      ));

      target.append(info);
    }

    if ($("#profile-name")) {
      $("#profile-name").value = currentProfile?.full_name || "";
    }

    if ($("#profile-username")) {
      $("#profile-username").value = currentProfile?.username || "";
    }

    if ($("#profile-bio")) {
      $("#profile-bio").value = currentProfile?.bio || "";
    }

    await loadFeed(currentUser.id, "my-posts");

  } catch (error) {
    showMessage(error.message, true);
  }
}

async function saveProfile(event) {
  event.preventDefault();

  const btn = event.submitter;
  setButtonLoading(btn, true, "Saving...");

  try {
    const username = $("#profile-username").value.trim().toLowerCase();

    if (username && !/^[a-z0-9_]{3,30}$/.test(username)) {
      throw new Error("Username must be 3-30 characters.");
    }

    let avatarUrl = currentProfile?.avatar_url || null;
    const file = $("#avatar-file")?.files[0];

    if (file) {
      const media = await uploadMedia(file);
      avatarUrl = media.url;
    }

    const { error } = await db.from("profiles")
      .update({
        full_name: $("#profile-name").value.trim(),
        username: username || null,
        bio: $("#profile-bio").value.trim(),
        avatar_url: avatarUrl
      })
      .eq("id", currentUser.id);

    if (error) throw error;

    await loadMyProfile();
    showMessage("Profile updated!");

  } catch (error) {
    showMessage(error.message, true);
  } finally {
    setButtonLoading(btn, false);
    hideProgress();
  }
}

/* ======================================
   OTHER PROFILES AND FOLLOW
====================================== */

async function openProfile(userId) {
  if (userId === currentUser.id) {
    switchTab("profile");
    return;
  }

  switchTab("other-profile");

  const target = $("#other-profile");
  if (!target) return;

  target.replaceChildren(
    makeElement("p", "empty-state", "Loading profile...")
  );

  try {
    const profile = await getProfile(userId);
    if (!profile) throw new Error("Profile not found.");

    target.replaceChildren();

    const info = makeElement("div", "profile-info");
    info.append(makeAvatar(profile));
    info.append(makeElement("h2", "", profile.full_name || "Member"));
    info.append(makeElement(
      "p", "",
      profile.username ? "@" + profile.username : ""
    ));
    info.append(makeElement("p", "", profile.bio || ""));

    const { data: following, error } = await db.from("follows")
      .select("follower_id")
      .eq("follower_id", currentUser.id)
      .eq("following_id", userId)
      .maybeSingle();

    if (error) throw error;

    info.append(makeButton(
      following ? "Following" : "Follow",
      () => toggleFollow(userId),
      "primary-btn"
    ));

    target.append(info);
    await loadFeed(userId, "other-posts");

  } catch (error) {
    target.replaceChildren(
      makeElement("p", "empty-state", error.message)
    );
  }
}

async function toggleFollow(userId) {
  try {
    const { data: existing, error } = await db.from("follows")
      .select("follower_id")
      .eq("follower_id", currentUser.id)
      .eq("following_id", userId)
      .maybeSingle();

    if (error) throw error;

    const result = existing
      ? await db.from("follows").delete()
          .eq("follower_id", currentUser.id)
          .eq("following_id", userId)
      : await db.from("follows").insert({
          follower_id: currentUser.id,
          following_id: userId
        });

    if (result.error) throw result.error;

    await loadFollowing();
    await openProfile(userId);

  } catch (error) {
    showMessage(error.message, true);
  }
}

/* ======================================
   SEARCH
====================================== */

async function searchPeople(term) {
  const results = $("#search-results");
  if (!results) return;

  results.replaceChildren();

  const value = term.trim().replace(/[,%()]/g, " ");

  if (!value) {
    results.append(makeElement("p", "", "Enter a name or username."));
    return;
  }

  try {
    const { data, error } = await db.from("profiles")
      .select("id,full_name,username,avatar_url")
      .or(`full_name.ilike.%${value}%,username.ilike.%${value}%`)
      .limit(25);

    if (error) throw error;

    const people = (data || []).filter(p => p.id !== currentUser.id);

    if (!people.length) {
      results.append(makeElement("p", "", "No members found."));
      return;
    }

    people.forEach(person => {
      const row = makeElement("div", "result-item");
      row.append(makeAvatar(person));

      const details = makeElement("div", "");
      details.append(makeElement("strong", "", person.full_name || "Member"));
      details.append(makeElement(
        "small", "",
        person.username ? "@" + person.username : ""
      ));

      row.append(details);
      row.append(makeButton("View", () => openProfile(person.id)));
      results.append(row);
    });

  } catch (error) {
    results.append(makeElement("p", "", error.message));
  }
}

/* ======================================
   NOTIFICATIONS
====================================== */

async function loadNotifications() {
  const list = $("#notifications-list");
  if (!list) return;

  list.replaceChildren(
    makeElement("p", "", "Loading notifications...")
  );

  try {
    const { data, error } = await db.from("notifications")
      .select("*")
      .eq("user_id", currentUser.id)
      .order("created_at", { ascending: false })
      .limit(40);

    if (error) throw error;

    list.replaceChildren();

    if (!data?.length) {
      list.append(makeElement("p", "", "No notifications yet."));
      return;
    }

    for (const item of data) {
      const row = makeElement("div", "notification-item");

      const profile = item.actor_id
        ? await getProfile(item.actor_id).catch(() => null)
        : null;

      const action = {
        like: "liked your post",
        comment: "commented on your post",
        follow: "followed you"
      }[item.type] || "interacted with you";

      row.append(makeAvatar(profile));
      row.append(makeElement(
        "p", "",
        `${profile?.full_name || "Someone"} ${action}`
      ));

      row.append(makeElement(
        "small", "", formatDate(item.created_at)
      ));

      list.append(row);
    }

    const unread = data.filter(x => !x.is_read).map(x => x.id);

    if (unread.length) {
      await db.from("notifications")
        .update({ is_read: true })
        .in("id", unread);
    }

  } catch (error) {
    list.replaceChildren(makeElement("p", "", error.message));
  }
}

/* ======================================
   PROFILE PROGRESS
====================================== */

function updateProfileProgress() {
  if (!currentProfile) return;

  const checks = [
    !!currentProfile.full_name,
    !!currentProfile.avatar_url,
    !!currentProfile.bio
  ];

  const percent = Math.round(
    checks.filter(Boolean).length / checks.length * 100
  );

  const number = $("#profile-progress-number");
  const bar = $("#profile-progress-bar");
  const items = $("#profile-progress-items");

  if (number) number.textContent = percent + "%";
  if (bar) bar.style.width = percent + "%";

  if (items) {
    items.replaceChildren();

    ["Your name", "Profile photo", "Bio"].forEach((label, i) => {
      items.append(makeElement(
        "p", "",
        `${checks[i] ? "✓" : "○"} ${label}`
      ));
    });
  }
}

/* ======================================
   REALTIME
====================================== */

function subscribeRealtime() {
  if (!db || !currentUser) return;

  if (realtimeChannel) {
    db.removeChannel(realtimeChannel);
  }

  realtimeChannel = db.channel("kalim-social-updates");

  realtimeChannel
    .on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "posts"
    }, () => {
      if (currentTab === "feed") loadFeed();
    })
    .on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "likes"
    }, () => {
      if (currentTab === "feed") loadFeed();
    })
    .on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "comments"
    }, () => {
      if (currentTab === "feed") loadFeed();
    })
    .subscribe();
}

/* ======================================
   THEME
====================================== */

function applyTheme(theme) {
  document.body.classList.toggle("dark-theme", theme === "dark");

  const select = $("#theme-select");
  if (select) select.value = theme;
}

function saveTheme(theme) {
  localStorage.setItem("kalim-theme", theme);
  applyTheme(theme);
}

/* ======================================
   EVENT LISTENERS
====================================== */

function on(selector, event, callback) {
  const el = $(selector);
  if (el) el.addEventListener(event, callback);
}

function bindEvents() {

  $$("[data-auth-tab]").forEach(btn => {
    btn.addEventListener("click", () => {
      const mode = btn.dataset.authTab;

      $$(".auth-tab").forEach(tab =>
        tab.classList.toggle("active", tab === btn)
      );

      if ($("#login-form")) $("#login-form").hidden = mode !== "login";
      if ($("#signup-form")) $("#signup-form").hidden = mode !== "signup";

      showMessage("");
    });
  });

  $$("[data-tab]").forEach(btn => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  on("#login-form", "submit", async event => {
    event.preventDefault();

    const btn = event.submitter;
    setButtonLoading(btn, true, "Logging in...");

    try {
      const { error } = await db.auth.signInWithPassword({
        email: $("#login-email").value.trim(),
        password: $("#login-password").value
      });

      if (error) throw error;
      showMessage("Login successful!");

    } catch (error) {
      showMessage(error.message, true);
    } finally {
      setButtonLoading(btn, false);
    }
  });

  on("#signup-form", "submit", async event => {
    event.preventDefault();

    const btn = event.submitter;
    setButtonLoading(btn, true, "Creating account...");

    try {
      const { error } = await db.auth.signUp({
        email: $("#signup-email").value.trim(),
        password: $("#signup-password").value,
        options: {
          data: {
            full_name: $("#signup-name").value.trim()
          }
        }
      });

      if (error) throw error;
      showMessage("Account created! Check your email for verification.");

    } catch (error) {
      showMessage(error.message, true);
    } finally {
      setButtonLoading(btn, false);
    }
  });

  async function logout() {
    if (!db) return;
    const { error } = await db.auth.signOut();
    if (error) showMessage(error.message, true);
  }

  on("#logout-button", "click", logout);
  on("#settings-logout", "click", logout);

  on("#header-login", "click", () => {
    $("#login-email")?.focus();
  });

  on("#publish-post", "click", createPost);

  on("#post-media", "change", event => {
    selectedFile = event.target.files[0] || null;

    if (selectedFile && selectedFile.size > MAX_FILE_SIZE) {
      selectedFile = null;
      event.target.value = "";
      previewMedia(null);
      notify("File must be 50 MB or less.", true);
      return;
    }

    previewMedia(selectedFile);
  });

  on("#profile-form", "submit", saveProfile);

  on("#search-form", "submit", event => {
    event.preventDefault();
    searchPeople($("#search-input").value);
  });

  on("#global-search", "keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      const value = event.target.value;
      switchTab("search");
      if ($("#search-input")) $("#search-input").value = value;
      searchPeople(value);
    }
  });

  $$(".feed-filter").forEach(btn => {
    btn.addEventListener("click", () => {
      currentFilter = btn.dataset.feedFilter;

      $$(".feed-filter").forEach(x =>
        x.classList.toggle("active", x === btn)
      );

      loadFeed();
    });
  });

  on("#feed-search", "input", event => {
    feedSearch = event.target.value.trim();
    loadFeed();
  });

  on("#refresh-feed", "click", () => loadFeed());

  on("#back-button", "click", () => switchTab("feed"));

  on("#theme-select", "change", event => {
    saveTheme(event.target.value);
  });
}

/* ======================================
   INITIALIZATION
====================================== */

async function init() {
  const year = $("#current-year");
  if (year) year.textContent = new Date().getFullYear();

  applyTheme(localStorage.getItem("kalim-theme") || "light");

  // Check Supabase library before using it.
  if (!window.supabase || typeof window.supabase.createClient !== "function") {
    showMessage(
      "Supabase library missing. Check the script in index.html.",
      true
    );
    console.error("Supabase JS library did not load.");
    return;
  }

  // Initialize database BEFORE binding authentication events.
  db = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
  );

  if (!db || !db.auth) {
    showMessage("Could not initialize Supabase.", true);
    return;
  }

  bindEvents();

  try {
    const { data, error } = await db.auth.getSession();
    if (error) throw error;

    await updateApp(data.session);

    db.auth.onAuthStateChange((_event, session) => {
      setTimeout(() => updateApp(session), 0);
    });

  } catch (error) {
    console.error("Initialization error:", error);
    showMessage(error.message, true);
  }
}

document.addEventListener("DOMContentLoaded", init);
