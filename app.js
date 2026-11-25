
/* ==========================================
   KALIM SOCIAL
   Supabase Social Network Application
========================================== */

const SUPABASE_URL = "https://kvwoyeusveepyjewrzpi.supabase.co";
const SUPABASE_KEY = "sb_publishable__kSVXsmw0d-erIP9doLa3g_J29aYfiv";

const STORAGE_BUCKET = "social-images";
const MAX_UPLOAD_SIZE = 50 * 1024 * 1024;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

let db;
let currentUser = null;
let currentProfile = null;
let currentTab = "feed";
let currentFilter = "all";
let feedChannel = null;
let feedSearch = "";
let selectedFile = null;
let loadingFeed = false;

const state = {
  posts: [],
  profiles: new Map(),
  likes: new Map(),
  comments: new Map(),
  following: new Set()
};

/* ==========================================
   HELPERS
========================================== */

function message(text, error = false) {
  const el = $("#message");
  if (el) {
    el.textContent = text || "";
    el.style.color = error ? "#e64c61" : "";
  }
}

function notify(text, error = false) {
  const el = $("#upload-status");
  if (el) {
    el.textContent = text || "";
    el.style.color = error ? "#e64c61" : "";
  }
  if (text) message(text, error);
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(text, className, callback) {
  const node = element("button", className, text);
  node.type = "button";
  node.addEventListener("click", callback);
  return node;
}

function initials(name = "Kalim Social") {
  return name.trim().split(/\s+/).slice(0, 2)
    .map(word => word[0] || "")
    .join("").toUpperCase();
}

function avatar(profile) {
  if (profile?.avatar_url) {
    const img = element("img", "avatar");
    img.src = profile.avatar_url;
    img.alt = "Profile picture";
    img.loading = "lazy";
    return img;
  }

  return element(
    "div",
    "avatar avatar-placeholder",
    initials(profile?.full_name || "Kalim Social")
  );
}

function dateText(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

function setLoading(btn, loading, text = "Please wait...") {
  if (!btn) return;

  if (loading) {
    btn.dataset.originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = text;
  } else {
    btn.disabled = false;
    btn.textContent = btn.dataset.originalText || btn.textContent;
  }
}

function escapeSearch(value) {
  return value.replace(/[,%()]/g, " ").trim();
}

/* ==========================================
   AUTHENTICATION
========================================== */

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

  const sidebarAvatar = $("#sidebar-avatar");
  if (sidebarAvatar) {
    const newAvatar = avatar(currentProfile);
    newAvatar.id = "sidebar-avatar";
    sidebarAvatar.replaceWith(newAvatar);
  }

  const composerAvatar = $("#composer-avatar");
  if (composerAvatar) {
    const newAvatar = avatar(currentProfile);
    newAvatar.id = "composer-avatar";
    composerAvatar.replaceWith(newAvatar);
  }

  const accountEmail = $("#account-email");
  if (accountEmail) accountEmail.textContent = currentUser.email || "";

  updateProfileProgress();
}

async function updateApp(session) {
  currentUser = session?.user || null;

  $("#auth-section").hidden = !!currentUser;
  $("#home-section").hidden = !currentUser;
  $("#header-login").hidden = !!currentUser;

  if (!currentUser) {
    currentProfile = null;
    if (feedChannel) {
      await db.removeChannel(feedChannel);
      feedChannel = null;
    }
    return;
  }

  $("#header-user").textContent = "Signed in";

  try {
    await refreshProfile();
    await loadFollowing();
    subscribeRealtime();
    switchTab("feed");
  } catch (error) {
    message(error.message, true);
  }
}

/* ==========================================
   NAVIGATION
========================================== */

function switchTab(tab) {
  currentTab = tab;

  $$(".view").forEach(view => {
    view.hidden = view.id !== `${tab}-view`;
  });

  $$(".side-link[data-tab]").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.tab === tab);
  });

  if (tab === "feed") loadFeed();
  if (tab === "profile") loadMyProfile();
  if (tab === "notifications") loadNotifications();

  if (tab === "settings") {
    $("#account-email").textContent = currentUser?.email || "";
  }
}

/* ==========================================
   STORAGE UPLOAD
========================================== */

function showProgress(percent) {
  const wrap = $("#upload-progress-wrap");
  const fill = $("#upload-progress");
  const text = $("#upload-progress-text");

  if (wrap) wrap.hidden = false;
  if (fill) fill.style.width = `${percent}%`;
  if (text) text.textContent = `${percent}%`;
}

function hideProgress() {
  const wrap = $("#upload-progress-wrap");
  if (wrap) wrap.hidden = true;
}

async function uploadMedia(file) {
  if (!file) return null;

  const isImage = file.type.startsWith("image/");
  const isVideo = file.type.startsWith("video/");

  if (!isImage && !isVideo) {
    throw new Error("Please select a valid image or video.");
  }

  if (file.size > MAX_UPLOAD_SIZE) {
    throw new Error(
      "This file exceeds the 50 MB Free-plan upload limit."
    );
  }

  const allowedTypes = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "video/mp4",
    "video/webm"
  ];

  if (!allowedTypes.includes(file.type)) {
    throw new Error("This image or video format is not supported.");
  }

  const safeName = file.name
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "-");

  const path =
    `${currentUser.id}/${crypto.randomUUID()}-${safeName}`;

  notify("Uploading media...");
  showProgress(10);

  // Supabase standard upload.
  // Actual file-size and storage quotas are controlled by Supabase.

  const { error } = await db.storage
    .from(STORAGE_BUCKET)
    .upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type
    });

  if (error) {
    hideProgress();
    throw error;
  }

  showProgress(100);

  const { data } = db.storage
    .from(STORAGE_BUCKET)
    .getPublicUrl(path);

  return {
    url: data.publicUrl,
    type: isVideo ? "video" : "image",
    name: file.name,
    size: file.size
  };
}

/* ==========================================
   MEDIA PREVIEW
========================================== */

function previewFile(file) {
  const preview = $("#media-preview");
  if (!preview) return;

  preview.replaceChildren();

  if (!file) {
    preview.hidden = true;
    return;
  }

  const url = URL.createObjectURL(file);

  if (file.type.startsWith("video/")) {
    const video = element("video");
    video.src = url;
    video.controls = true;
    video.muted = true;
    video.playsInline = true;
    preview.append(video);
  } else {
    const image = element("img");
    image.src = url;
    image.alt = "Selected media preview";
    preview.append(image);
  }

  preview.hidden = false;
}

/* ==========================================
   CREATE POST
========================================== */

async function createPost() {
  const content = $("#post-content").value.trim();

  if (!content && !selectedFile) {
    notify("Write something or choose a photo/video.", true);
    return;
  }

  const publishButton = $("#publish-post");
  setLoading(publishButton, true, "Publishing...");

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
    $("#media-preview").replaceChildren();
    $("#media-preview").hidden = true;

    selectedFile = null;
    hideProgress();
    notify("Your post was published!");

    await loadFeed();
  } catch (error) {
    notify(error.message, true);
  } finally {
    setLoading(publishButton, false);
  }
}

/* ==========================================
   FOLLOWING
========================================== */

async function loadFollowing() {
  const { data, error } = await db
    .from("follows")
    .select("following_id")
    .eq("follower_id", currentUser.id);

  if (error) throw error;

  state.following = new Set(
    (data || []).map(row => row.following_id)
  );
}

/* ==========================================
   LOAD FEED
========================================== */

async function loadFeed(targetUserId = null, containerId = "feed") {
  if (loadingFeed || !currentUser) return;

  const container = document.getElementById(containerId);
  if (!container) return;

  loadingFeed = true;
  container.replaceChildren(
    element("div", "empty-state", "Loading activity...")
  );

  try {
    let query = db.from("posts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(40);

    if (targetUserId) {
      query = query.eq("user_id", targetUserId);
    }

    const { data: posts, error } = await query;
    if (error) throw error;

    state.posts = posts || [];

    if (!posts?.length) {
      container.replaceChildren(
        element("div", "empty-state", "No posts yet. Share something!")
      );
      return;
    }

    const userIds = [...new Set(posts.map(p => p.user_id))];

    const [profilesResult, likesResult, commentsResult] =
      await Promise.all([
        db.from("profiles")
          .select("id,full_name,username,avatar_url,bio")
          .in("id", userIds),

        db.from("likes")
          .select("post_id,user_id")
          .in("post_id", posts.map(p => p.id)),

        db.from("comments")
          .select("id,post_id,user_id,content,created_at")
          .in("post_id", posts.map(p => p.id))
          .order("created_at", { ascending: true })
      ]);

    if (profilesResult.error) throw profilesResult.error;
    if (likesResult.error) throw likesResult.error;
    if (commentsResult.error) throw commentsResult.error;

    state.profiles = new Map(
      (profilesResult.data || []).map(p => [p.id, p])
    );

    state.likes.clear();
    state.comments.clear();

    (likesResult.data || []).forEach(like => {
      if (!state.likes.has(like.post_id)) {
        state.likes.set(like.post_id, []);
      }
      state.likes.get(like.post_id).push(like);
    });

    (commentsResult.data || []).forEach(comment => {
      if (!state.comments.has(comment.post_id)) {
        state.comments.set(comment.post_id, []);
      }
      state.comments.get(comment.post_id).push(comment);
    });

    renderFeed(posts, container, targetUserId);
  } catch (error) {
    console.error(error);
    container.replaceChildren(
      element("div", "empty-state", error.message)
    );
  } finally {
    loadingFeed = false;
  }
}

/* ==========================================
   RENDER FEED
========================================== */

function renderFeed(posts, container, targetUserId) {
  container.replaceChildren();

  let visiblePosts = [...posts];

  if (!targetUserId && currentFilter === "following") {
    visiblePosts = visiblePosts.filter(post =>
      state.following.has(post.user_id) ||
      post.user_id === currentUser.id
    );
  }

  if (!targetUserId && currentFilter === "media") {
    visiblePosts = visiblePosts.filter(post => !!post.image_url);
  }

  if (feedSearch) {
    visiblePosts = visiblePosts.filter(post =>
      (post.content || "")
        .toLowerCase()
        .includes(feedSearch.toLowerCase())
    );
  }

  if (!visiblePosts.length) {
    container.append(
      element("div", "empty-state", "No matching posts found.")
    );
    return;
  }

  visiblePosts.forEach(post => {
    const profile = state.profiles.get(post.user_id);
    const likes = state.likes.get(post.id) || [];
    const comments = state.comments.get(post.id) || [];

    const liked = likes.some(
      item => item.user_id === currentUser.id
    );

    const card = element("article", "card post-card");

    // Post header
    const header = element("div", "post-head");
    header.append(avatar(profile));

    const author = element("div");
    author.append(element(
      "div",
      "post-author",
      profile?.full_name || "Kalim Social Member"
    ));

    author.append(element(
      "div",
      "post-meta",
      `${profile?.username ? "@" + profile.username + " · " : ""}${dateText(post.created_at)}`
    ));

    header.append(author);

    if (post.user_id !== currentUser.id) {
      header.append(button("Profile", "secondary-btn", () =>
        openProfile(post.user_id)
      ));
    }

    card.append(header);

    // Text
    if (post.content) {
      card.append(element("p", "post-body", post.content));
    }

    // Image / video
    if (post.image_url) {
      const mediaType = post.media_type ||
        (/\.(mp4|webm|mov)(\?|$)/i.test(post.image_url)
          ? "video" : "image");

      if (mediaType === "video") {
        const video = element("video", "post-image");
        video.src = post.image_url;
        video.controls = true;
        video.playsInline = true;
        video.preload = "metadata";
        card.append(video);
      } else {
        const image = element("img", "post-image");
        image.src = post.image_url;
        image.alt = "Community post";
        image.loading = "lazy";
        card.append(image);
      }
    }

    // Stats
    const stats = element("div", "post-stats");
    stats.append(
      element("span", "", `${likes.length} likes`),
      element("span", "", `${comments.length} comments`)
    );
    card.append(stats);

    // Actions
    const actions = element("div", "post-actions");

    actions.append(button(
      liked ? "♥ Liked" : "♡ Like",
      "",
      () => toggleLike(post.id, liked)
    ));

    actions.append(button("Comment", "", () => {
      card.querySelector(".comment-form input")?.focus();
    }));

    if (post.user_id === currentUser.id) {
      actions.append(button("Delete", "", () =>
        deletePost(post.id)
      ));
    }

    card.append(actions);

    // Comments
    const commentArea = element("div", "comment-area");

    comments.forEach(comment => {
      const commentProfile = state.profiles.get(comment.user_id);
      const row = element("div", "comment");

      const name = commentProfile?.full_name || "Member";
      row.textContent = `${name}: ${comment.content}`;

      commentArea.append(row);
    });

    const form = element("form", "comment-form");
    const input = element("input");

    input.type = "text";
    input.maxLength = 1000;
    input.required = true;
    input.placeholder = "Write a comment...";

    const send = element("button", "", "Send");
    send.type = "submit";

    form.append(input, send);

    form.addEventListener("submit", async event => {
      event.preventDefault();

      const content = input.value.trim();
      if (!content) return;

      send.disabled = true;

      try {
        const { error } = await db.from("comments").insert({
          post_id: post.id,
          user_id: currentUser.id,
          content
        });

        if (error) throw error;

        await loadFeed(targetUserId, container.id);
      } catch (error) {
        message(error.message, true);
      } finally {
        send.disabled = false;
      }
    });

    commentArea.append(form);
    card.append(commentArea);
    container.append(card);
  });
}

/* ==========================================
   LIKE / UNLIKE
========================================== */

async function toggleLike(postId, alreadyLiked) {
  try {
    const result = alreadyLiked
      ? await db.from("likes")
          .delete()
          .eq("post_id", postId)
          .eq("user_id", currentUser.id)
      : await db.from("likes").insert({
          post_id: postId,
          user_id: currentUser.id
        });

    if (result.error) throw result.error;

    await loadFeed();
  } catch (error) {
    message(error.message, true);
  }
}

/* ==========================================
   DELETE POST
========================================== */

async function deletePost(postId) {
  if (!confirm("Are you sure you want to delete this post?")) return;

  try {
    const { error } = await db.from("posts")
      .delete()
      .eq("id", postId)
      .eq("user_id", currentUser.id);

    if (error) throw error;

    await loadFeed();
  } catch (error) {
    message(error.message, true);
  }
}

/* ==========================================
   PROFILE
========================================== */

async function loadMyProfile() {
  try {
    await refreshProfile();

    const target = $("#my-profile");
    target.replaceChildren();

    const cover = element("div", "profile-cover");
    const info = element("div", "profile-info");

    info.append(avatar(currentProfile));

    info.append(element(
      "div", "profile-name",
      currentProfile?.full_name || "Your name"
    ));

    info.append(element(
      "div", "profile-handle",
      currentProfile?.username
        ? "@" + currentProfile.username
        : "Choose your username"
    ));

    if (currentProfile?.bio) {
      info.append(element("p", "profile-bio", currentProfile.bio));
    }

    target.append(cover, info);

    $("#profile-name").value = currentProfile?.full_name || "";
    $("#profile-username").value = currentProfile?.username || "";
    $("#profile-bio").value = currentProfile?.bio || "";

    await loadFeed(currentUser.id, "my-posts");
  } catch (error) {
    message(error.message, true);
  }
}

async function saveProfile(event) {
  event.preventDefault();

  const btn = event.submitter;
  setLoading(btn, true, "Saving...");

  try {
    let avatarUrl = currentProfile?.avatar_url || null;
    const file = $("#avatar-file").files[0];

    if (file) {
      if (!file.type.startsWith("image/")) {
        throw new Error("Please choose an image for your profile.");
      }

      if (file.size > MAX_UPLOAD_SIZE) {
        throw new Error("Profile image exceeds the upload limit.");
      }

      const result = await uploadMedia(file);
      avatarUrl = result.url;
    }

    const username = $("#profile-username").value
      .trim().toLowerCase();

    if (username && !/^[a-z0-9_]{3,30}$/.test(username)) {
      throw new Error(
        "Username must be 3-30 characters: letters, numbers and underscore."
      );
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

    await refreshProfile();
    await loadMyProfile();

    message("Profile updated successfully!");
  } catch (error) {
    message(error.message, true);
  } finally {
    setLoading(btn, false);
    hideProgress();
  }
}

/* ==========================================
   OTHER USER PROFILE
========================================== */

async function openProfile(userId) {
  if (userId === currentUser.id) {
    switchTab("profile");
    return;
  }

  switchTab("other-profile");

  const target = $("#other-profile");
  target.replaceChildren(
    element("div", "empty-state", "Loading profile...")
  );

  try {
    const profile = await getProfile(userId);
    if (!profile) throw new Error("Profile not found.");

    target.replaceChildren(element("div", "profile-cover"));

    const info = element("div", "profile-info");
    info.append(avatar(profile));

    info.append(element(
      "div", "profile-name",
      profile.full_name || "Member"
    ));

    info.append(element(
      "div", "profile-handle",
      profile.username ? "@" + profile.username : ""
    ));

    if (profile.bio) {
      info.append(element("p", "profile-bio", profile.bio));
    }

    const { data: existing, error } = await db.from("follows")
      .select("follower_id")
      .eq("follower_id", currentUser.id)
      .eq("following_id", userId)
      .maybeSingle();

    if (error) throw error;

    info.append(button(
      existing ? "Following" : "Follow",
      "primary-btn profile-actions",
      () => toggleFollow(userId)
    ));

    target.append(info);

    await loadFeed(userId, "other-posts");
  } catch (error) {
    target.replaceChildren(
      element("div", "empty-state", error.message)
    );
  }
}

/* ==========================================
   FOLLOW / UNFOLLOW
========================================== */

async function toggleFollow(userId) {
  try {
    const { data: existing, error } = await db.from("follows")
      .select("follower_id")
      .eq("follower_id", currentUser.id)
      .eq("following_id", userId)
      .maybeSingle();

    if (error) throw error;

    const result = existing
      ? await db.from("follows")
          .delete()
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
    message(error.message, true);
  }
}

/* ==========================================
   SEARCH PEOPLE
========================================== */

async function searchPeople(term) {
  const results = $("#search-results");
  results.replaceChildren();

  const value = escapeSearch(term);

  if (!value) {
    results.append(
      element("div", "empty-state", "Enter a name or username.")
    );
    return;
  }

  try {
    const { data, error } = await db.from("profiles")
      .select("id,full_name,username,avatar_url,bio")
      .or(`full_name.ilike.%${value}%,username.ilike.%${value}%`)
      .limit(25);

    if (error) throw error;

    const people = (data || []).filter(
      person => person.id !== currentUser.id
    );

    if (!people.length) {
      results.append(
        element("div", "empty-state", "No members found.")
      );
      return;
    }

    people.forEach(person => {
      const row = element("div", "result-item");
      row.append(avatar(person));

      const copy = element("div", "result-copy");
      copy.append(element(
        "div", "result-name",
        person.full_name || "Member"
      ));

      copy.append(element(
        "div", "result-handle",
        person.username ? "@" + person.username : ""
      ));

      row.append(copy);

      row.append(button("View", "secondary-btn", () =>
        openProfile(person.id)
      ));

      results.append(row);
    });
  } catch (error) {
    results.append(element("div", "empty-state", error.message));
  }
}

/* ==========================================
   NOTIFICATIONS
========================================== */

async function loadNotifications() {
  const list = $("#notifications-list");

  list.replaceChildren(
    element("div", "empty-state", "Loading notifications...")
  );

  try {
    const { data, error } = await db.from("notifications")
      .select("*")
      .eq("user_id", currentUser.id)
      .order("created_at", { ascending: false })
      .limit(40);

    if (error) throw error;

    if (!data?.length) {
      list.replaceChildren(
        element("div", "empty-state", "No notifications yet.")
      );
      return;
    }

    list.replaceChildren();

    for (const item of data) {
      let profile = null;

      if (item.actor_id) {
        try {
          profile = await getProfile(item.actor_id);
        } catch (error) {
          console.warn(error);
        }
      }

      const row = element("div", "notification-item");
      row.append(avatar(profile));

      const copy = element("div", "result-copy");

      const description = {
        like: "liked your post",
        comment: "commented on your post",
        follow: "started following you"
      }[item.type] || "interacted with you";

      copy.append(element(
        "div", "result-name",
        `${profile?.full_name || "Someone"} ${description}`
      ));

      copy.append(element(
        "div", "result-handle",
        dateText(item.created_at)
      ));

      row.append(copy);
      list.append(row);
    }

    const unreadIds = data
      .filter(item => !item.is_read)
      .map(item => item.id);

    if (unreadIds.length) {
      await db.from("notifications")
        .update({ is_read: true })
        .in("id", unreadIds);
    }
  } catch (error) {
    list.replaceChildren(element("div", "empty-state", error.message));
  }
}

/* ==========================================
   PROFILE COMPLETION
========================================== */

function updateProfileProgress() {
  if (!currentProfile) return;

  const checks = [
    !!currentProfile.full_name,
    !!currentProfile.avatar_url,
    !!currentProfile.bio
  ];

  const completed = checks.filter(Boolean).length;
  const percentage = Math.round(completed / checks.length * 100);

  $("#profile-progress-number").textContent = `${percentage}%`;
  $("#profile-progress-bar").style.width = `${percentage}%`;

  const items = $("#profile-progress-items");
  items.replaceChildren();

  const labels = [
    "Profile information",
    "Profile photo",
    "About you"
  ];

  labels.forEach((label, index) => {
    const item = element(
      "span",
      "",
      `${checks[index] ? "✓" : "○"} ${label}`
    );
    items.append(item);
  });
}

/* ==========================================
   REALTIME SUBSCRIPTIONS
========================================== */

function subscribeRealtime() {
  if (feedChannel) {
    db.removeChannel(feedChannel);
  }

  feedChannel = db.channel("kalim-social-live-feed");

  feedChannel
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "posts"
      },
      () => {
        if (currentTab === "feed") loadFeed();
      }
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "likes"
      },
      () => {
        if (currentTab === "feed") loadFeed();
      }
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "comments"
      },
      () => {
        if (currentTab === "feed") loadFeed();
      }
    )
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${currentUser.id}`
      },
      () => {
        if (currentTab === "notifications") loadNotifications();
      }
    )
    .subscribe(status => {
      console.log("Kalim Social Realtime:", status);
    });
}

/* ==========================================
   THEME SETTINGS
========================================== */

function applyTheme(theme) {
  const dark = theme === "dark";

  document.body.classList.toggle("dark-theme", dark);

  const select = $("#theme-select");
  if (select) select.value = dark ? "dark" : "light";
}

function saveTheme(theme) {
  localStorage.setItem("kalim-theme", theme);
  applyTheme(theme);
}

/* ==========================================
   EVENT LISTENERS
========================================== */

function bindEvents() {

  // Authentication tabs
  $$("[data-auth-tab]").forEach(btn => {
    btn.addEventListener("click", () => {
      const mode = btn.dataset.authTab;

      $$(".auth-tab").forEach(tab => {
        tab.classList.toggle("active", tab === btn);
      });

      $("#login-form").hidden = mode !== "login";
      $("#signup-form").hidden = mode !== "signup";
      message("");
    });
  });

  // Navigation
  $$("[data-tab]").forEach(btn => {
    btn.addEventListener("click", () => {
      switchTab(btn.dataset.tab);
    });
  });

  // Login
  $("#login-form").addEventListener("submit", async event => {
    event.preventDefault();

    const btn = event.submitter;
    setLoading(btn, true, "Logging in...");

    try {
      const { error } = await db.auth.signInWithPassword({
        email: $("#login-email").value.trim(),
        password: $("#login-password").value
      });

      if (error) throw error;

      message("Login successful!");
    } catch (error) {
      message(error.message, true);
    } finally {
      setLoading(btn, false);
    }
  });

  // Signup
  $("#signup-form").addEventListener("submit", async event => {
    event.preventDefault();

    const btn = event.submitter;
    setLoading(btn, true, "Creating account...");

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

      message("Account created! Check your email for verification.");
    } catch (error) {
      message(error.message, true);
    } finally {
      setLoading(btn, false);
    }
  });

  // Login shortcut
  $("#header-login").addEventListener("click", () => {
    $("#login-email").focus();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  // Logout
  async function logout() {
    const { error } = await db.auth.signOut();
    if (error) message(error.message, true);
  }

  $("#logout-button").addEventListener("click", logout);
  $("#settings-logout").addEventListener("click", logout);

  // Media select
  $("#post-media").addEventListener("change", event => {
    selectedFile = event.target.files[0] || null;

    if (selectedFile && selectedFile.size > MAX_UPLOAD_SIZE) {
      selectedFile = null;
      event.target.value = "";
      previewFile(null);
      notify("Maximum file size on this Free-plan setup is 50 MB.", true);
      return;
    }

    previewFile(selectedFile);

    if (selectedFile) {
      notify(`${selectedFile.name} selected.`);
    }
  });

  // Publish post
  $("#publish-post").addEventListener("click", createPost);

  // Save profile
  $("#profile-form").addEventListener("submit", saveProfile);

  // Search
  $("#search-form").addEventListener("submit", event => {
    event.preventDefault();
    searchPeople($("#search-input").value);
  });

  $("#global-search").addEventListener("keydown", event => {
    if (event.key === "Enter") {
      $("#search-input").value = event.currentTarget.value;
      switchTab("search");
      searchPeople(event.currentTarget.value);
    }
  });

  // Feed filters
  $$(".feed-filter").forEach(btn => {
    btn.addEventListener("click", () => {
      currentFilter = btn.dataset.feedFilter;

      $$(".feed-filter").forEach(filter => {
        filter.classList.toggle("active", filter === btn);
      });

      loadFeed();
    });
  });

  // Feed search
  $("#feed-search").addEventListener("input", event => {
    feedSearch = event.target.value.trim();
    loadFeed();
  });

  // Refresh
  $("#refresh-feed").addEventListener("click", () => loadFeed());

  // Back button
  $("#back-button").addEventListener("click", () => switchTab("feed"));

  // Theme
  $("#theme-select").addEventListener("change", event => {
    saveTheme(event.target.value);
  });
}

/* ==========================================
   START APPLICATION
========================================== */

async function init() {
  $("#current-year").textContent = new Date().getFullYear();

  applyTheme(localStorage.getItem("kalim-theme") || "light");

  bindEvents();

  if (!window.supabase?.createClient) {
    message("Supabase library failed to load.", true);
    return;
  }

  db = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
  );

  try {
    const { data, error } = await db.auth.getSession();

    if (error) throw error;

    await updateApp(data.session);

    db.auth.onAuthStateChange((_event, session) => {
      setTimeout(() => updateApp(session), 0);
    });

  } catch (error) {
    message(error.message, true);
    console.error("Kalim Social startup error:", error);
  }
}

document.addEventListener("DOMContentLoaded", init);
