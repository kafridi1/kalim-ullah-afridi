
const SUPABASE_URL = "https://kvwoyeusveepyjewrzpi.supabase.co";
const SUPABASE_KEY = "PASTE_YOUR_SUPABASE_PUBLISHABLE_KEY_HERE";
const STORAGE_BUCKET = "social-images";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

let db = null;
let currentUser = null;
let currentProfile = null;

function showMessage(message, isError = false) {
  const el = $("#message");
  if (!el) return;
  el.textContent = message || "";
  el.style.color = isError ? "#c43e4b" : "";
}

function make(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = String(text ?? "");
  return el;
}

function makeButton(label, className, onClick) {
  const button = make("button", className, label);
  button.type = "button";
  button.addEventListener("click", onClick);
  return button;
}

function initials(name) {
  return String(name || "K").trim().split(/\s+/)
    .slice(0, 2).map(x => x[0] || "").join("").toUpperCase() || "K";
}

function avatarElement(profile) {
  if (profile?.avatar_url) {
    const img = make("img", "avatar");
    img.src = profile.avatar_url;
    img.alt = "Profile photo";
    img.loading = "lazy";
    return img;
  }
  return make("div", "avatar avatar-placeholder", initials(profile?.full_name));
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

function setButtonBusy(button, busy, busyText = "Please wait…") {
  if (!button) return;
  if (busy) {
    button.dataset.originalText = button.textContent;
    button.disabled = true;
    button.textContent = busyText;
  } else {
    button.disabled = false;
    if (button.dataset.originalText) button.textContent = button.dataset.originalText;
  }
}

async function getProfile(userId) {
  const { data, error } = await db.from("profiles")
    .select("id, full_name, username, bio, avatar_url")
    .eq("id", userId).maybeSingle();
  if (error) throw error;
  return data;
}

async function uploadImage(file, folder) {
  if (!file) return null;
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file.");
  if (file.size > 5 * 1024 * 1024) throw new Error("Image must be 5 MB or smaller.");

  const safeName = file.name.toLowerCase().replace(/[^a-z0-9._-]/g, "-");
  const path = `${currentUser.id}/${folder}-${crypto.randomUUID()}-${safeName}`;

  const { error } = await db.storage.from(STORAGE_BUCKET).upload(path, file, {
    cacheControl: "3600", upsert: false, contentType: file.type
  });
  if (error) throw error;

  return db.storage.from(STORAGE_BUCKET).getPublicUrl(path).data.publicUrl;
}

function switchTab(tab) {
  $$(".view").forEach(view => view.hidden = view.id !== `${tab}-view`);
  $$(".side-link[data-tab]").forEach(button =>
    button.classList.toggle("active", button.dataset.tab === tab)
  );

  if (tab === "feed") loadFeed();
  if (tab === "profile") loadMyProfile();
  if (tab === "notifications") loadNotifications();
}

async function updateApp(session) {
  currentUser = session?.user || null;
  $("#auth-section").hidden = !!currentUser;
  $("#home-section").hidden = !currentUser;
  $("#header-login").hidden = !!currentUser;
  $("#header-user").textContent = currentUser ? "Signed in" : "";

  if (!currentUser) {
    currentProfile = null;
    return;
  }

  try {
    currentProfile = await getProfile(currentUser.id);
    const composerAvatar = avatarElement(currentProfile);
    composerAvatar.id = "composer-avatar";
    $("#composer-avatar").replaceWith(composerAvatar);
    switchTab("feed");
  } catch (error) {
    showMessage(error.message, true);
  }
}

async function loadFeed(targetUserId = null, targetContainer = "feed") {
  const container = document.getElementById(targetContainer);
  if (!container) return;

  container.replaceChildren(make("div", "empty-state", "Loading posts…"));

  let query = db.from("posts")
    .select("id, user_id, content, image_url, created_at")
    .order("created_at", { ascending: false }).limit(40);

  if (targetUserId) query = query.eq("user_id", targetUserId);

  const { data: posts, error } = await query;

  if (error) {
    container.replaceChildren(make("div", "empty-state", error.message));
    return;
  }

  if (!posts?.length) {
    container.replaceChildren(make("div", "empty-state", "No posts yet. Be the first to share!"));
    return;
  }

  container.replaceChildren();

  for (const post of posts) {
    try {
      const [profile, likesResult, commentsResult] = await Promise.all([
        getProfile(post.user_id),
        db.from("likes").select("user_id").eq("post_id", post.id),
        db.from("comments").select("id, user_id, content, created_at")
          .eq("post_id", post.id).order("created_at", { ascending: true }).limit(30)
      ]);

      const likes = likesResult.data || [];
      const comments = commentsResult.data || [];
      const liked = likes.some(item => item.user_id === currentUser.id);

      const card = make("article", "card post-card");
      const head = make("div", "post-head");
      head.append(avatarElement(profile));

      const author = make("div");
      author.append(make("div", "post-author", profile?.full_name || "Kalim Social member"));
      author.append(make("div", "post-meta",
        `${profile?.username ? "@" + profile.username + " · " : ""}${formatDate(post.created_at)}`
      ));

      head.append(author);
      card.append(head);

      if (post.content) card.append(make("p", "post-body", post.content));

      if (post.image_url) {
        const image = make("img", "post-image");
        image.src = post.image_url;
        image.alt = "Post image";
        image.loading = "lazy";
        card.append(image);
      }

      const stats = make("div", "post-stats");
      stats.append(make("span", "", `${likes.length} likes`));
      stats.append(make("span", "", `${comments.length} comments`));
      card.append(stats);

      const actions = make("div", "post-actions");
      actions.append(makeButton(liked ? "♥ Liked" : "♡ Like", "",
        () => toggleLike(post.id, liked)
      ));
      actions.append(makeButton("◯ Comment", "", () =>
        card.querySelector(".comment-form input")?.focus()
      ));

      if (post.user_id !== currentUser.id) {
        actions.append(makeButton("View profile", "", () => openProfile(post.user_id)));
      }
      card.append(actions);

      const commentArea = make("div", "comment-area");

      comments.forEach(comment => {
        commentArea.append(make("div", "comment", comment.content));
      });

      const form = make("form", "comment-form");
      const input = make("input");
      input.type = "text";
      input.maxLength = 1000;
      input.placeholder = "Write a comment…";
      input.required = true;

      const submit = make("button", "", "Send");
      submit.type = "submit";
      form.append(input, submit);

      form.addEventListener("submit", async event => {
        event.preventDefault();
        const content = input.value.trim();
        if (!content) return;

        submit.disabled = true;
        const { error: insertError } = await db.from("comments").insert({
          post_id: post.id,
          user_id: currentUser.id,
          content
        });
        submit.disabled = false;

        if (insertError) showMessage(insertError.message, true);
        else loadFeed(targetUserId, targetContainer);
      });

      commentArea.append(form);
      card.append(commentArea);
      container.append(card);

    } catch (error) {
      console.error("Post render error:", error);
    }
  }
}

async function toggleLike(postId, alreadyLiked) {
  const result = alreadyLiked
    ? await db.from("likes").delete().eq("post_id", postId).eq("user_id", currentUser.id)
    : await db.from("likes").insert({ post_id: postId, user_id: currentUser.id });

  if (result.error) showMessage(result.error.message, true);
  else loadFeed();
}

async function loadMyProfile() {
  if (!currentUser) return;

  try {
    currentProfile = await getProfile(currentUser.id);
    const target = $("#my-profile");
    target.replaceChildren();

    const cover = make("div", "profile-cover");
    const info = make("div", "profile-info");

    info.append(avatarElement(currentProfile));
    info.append(make("div", "profile-name", currentProfile?.full_name || "Your name"));
    info.append(make("div", "profile-handle",
      currentProfile?.username ? "@" + currentProfile.username : "Choose a username"
    ));

    if (currentProfile?.bio) info.append(make("p", "profile-bio", currentProfile.bio));
    target.append(cover, info);

    $("#profile-name").value = currentProfile?.full_name || "";
    $("#profile-username").value = currentProfile?.username || "";
    $("#profile-bio").value = currentProfile?.bio || "";

    await loadFeed(currentUser.id, "my-posts");
  } catch (error) {
    showMessage(error.message, true);
  }
}

async function openProfile(userId) {
  if (userId === currentUser.id) {
    switchTab("profile");
    return;
  }

  switchTab("other-profile");
  const target = $("#other-profile");
  target.replaceChildren(make("div", "empty-state", "Loading profile…"));

  try {
    const profile = await getProfile(userId);
    if (!profile) {
      target.replaceChildren(make("div", "empty-state", "Profile not found."));
      return;
    }

    target.replaceChildren(make("div", "profile-cover"));
    const info = make("div", "profile-info");

    info.append(avatarElement(profile));
    info.append(make("div", "profile-name", profile.full_name || "Kalim Social member"));
    info.append(make("div", "profile-handle", profile.username ? "@" + profile.username : ""));

    if (profile.bio) info.append(make("p", "profile-bio", profile.bio));

    const follow = makeButton("Follow", "btn btn-primary profile-actions", () => toggleFollow(userId));
    const { data: existing } = await db.from("follows").select("follower_id")
      .eq("follower_id", currentUser.id).eq("following_id", userId).maybeSingle();

    follow.textContent = existing ? "Following" : "Follow";
    info.append(follow);
    target.append(info);

    await loadFeed(userId, "other-posts");
  } catch (error) {
    showMessage(error.message, true);
  }
}

async function toggleFollow(userId) {
  const { data: existing, error: lookupError } = await db.from("follows")
    .select("follower_id").eq("follower_id", currentUser.id)
    .eq("following_id", userId).maybeSingle();

  if (lookupError) return showMessage(lookupError.message, true);

  const result = existing
    ? await db.from("follows").delete().eq("follower_id", currentUser.id).eq("following_id", userId)
    : await db.from("follows").insert({ follower_id: currentUser.id, following_id: userId });

  if (result.error) showMessage(result.error.message, true);
  else openProfile(userId);
}

async function searchPeople(term) {
  const results = $("#search-results");
  results.replaceChildren();

  if (!term.trim()) {
    results.append(make("div", "empty-state", "Enter a name or username to search."));
    return;
  }

  const safe = term.trim().replace(/[,%()]/g, " ");
  const { data, error } = await db.from("profiles")
    .select("id, full_name, username, bio, avatar_url")
    .or(`full_name.ilike.%${safe}%,username.ilike.%${safe}%`)
    .limit(20);

  if (error) return results.append(make("div", "empty-state", error.message));
  if (!data?.length) return results.append(make("div", "empty-state", "No matching people found."));

  data.filter(person => person.id !== currentUser.id).forEach(person => {
    const row = make("div", "result-item");
    row.append(avatarElement(person));

    const copy = make("div", "result-copy");
    copy.append(make("div", "result-name", person.full_name || "Kalim Social member"));
    copy.append(make("div", "result-handle", person.username ? "@" + person.username : ""));

    row.append(copy, makeButton("View", "btn btn-soft", () => openProfile(person.id)));
    results.append(row);
  });
}

async function loadNotifications() {
  const list = $("#notifications-list");
  list.replaceChildren(make("div", "empty-state", "Loading notifications…"));

  const { data, error } = await db.from("notifications")
    .select("id, actor_id, type, post_id, is_read, created_at")
    .eq("user_id", currentUser.id)
    .order("created_at", { ascending: false }).limit(40);

  if (error) return list.replaceChildren(make("div", "empty-state", error.message));
  if (!data?.length) return list.replaceChildren(make("div", "empty-state", "You're all caught up."));

  list.replaceChildren();

  for (const item of data) {
    const row = make("div", "notification-item");
    let actor = null;

    if (item.actor_id) {
      try { actor = await getProfile(item.actor_id); } catch {}
    }

    row.append(avatarElement(actor));

    const copy = make("div", "result-copy");
    const description = item.type === "like" ? "liked your post" :
      item.type === "comment" ? "commented on your post" :
      item.type === "follow" ? "started following you" : "interacted with you";

    copy.append(make("div", "result-name",
      `${actor?.full_name || "Someone"} ${description}`
    ));
    copy.append(make("div", "result-handle", formatDate(item.created_at)));

    row.append(copy);
    list.append(row);

    if (!item.is_read) {
      await db.from("notifications").update({ is_read: true }).eq("id", item.id);
    }
  }
}

function bindEvents() {
  $$("[data-auth-tab]").forEach(button => button.addEventListener("click", () => {
    const mode = button.dataset.authTab;
    $$(".auth-tab").forEach(tab => tab.classList.toggle("active", tab === button));
    $("#login-form").hidden = mode !== "login";
    $("#signup-form").hidden = mode !== "signup";
  }));

  $("#header-login").addEventListener("click", () => {
    $("#login-email").focus();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  $$("[data-tab]").forEach(button =>
    button.addEventListener("click", () => switchTab(button.dataset.tab))
  );

  $("#logout-button").addEventListener("click", async () => {
    const { error } = await db.auth.signOut();
    if (error) showMessage(error.message, true);
  });

  $("#signup-form").addEventListener("submit", async event => {
    event.preventDefault();
    const button = event.submitter;
    setButtonBusy(button, true, "Creating…");

    const { error } = await db.auth.signUp({
      email: $("#signup-email").value.trim(),
      password: $("#signup-password").value,
      options: { data: { full_name: $("#signup-name").value.trim() } }
    });

    setButtonBusy(button, false);
    if (error) showMessage(error.message, true);
    else showMessage("Account created. Check your email if verification is enabled.");
  });

  $("#login-form").addEventListener("submit", async event => {
    event.preventDefault();
    const button = event.submitter;
    setButtonBusy(button, true, "Logging in…");

    const { error } = await db.auth.signInWithPassword({
      email: $("#login-email").value.trim(),
      password: $("#login-password").value
    });

    setButtonBusy(button, false);
    if (error) showMessage(error.message, true);
  });

  $("#post-form").addEventListener("submit", async event => {
    event.preventDefault();
    const button = event.submitter;
    const content = $("#post-content").value.trim();
    const file = $("#post-image").files[0];

    if (!content && !file) return showMessage("Write something or choose a photo.", true);

    setButtonBusy(button, true, "Publishing…");

    try {
      const imageUrl = file ? await uploadImage(file, "post") : null;
      const { error } = await db.from("posts").insert({
        user_id: currentUser.id,
        content,
        image_url: imageUrl
      });

      if (error) throw error;

      $("#post-content").value = "";
      $("#post-image").value = "";
      showMessage("Your post has been published.");
      loadFeed();
    } catch (error) {
      showMessage(error.message, true);
    } finally {
      setButtonBusy(button, false);
    }
  });

  $("#profile-form").addEventListener("submit", async event => {
    event.preventDefault();
    const button = event.submitter;
    setButtonBusy(button, true, "Saving…");

    try {
      let avatarUrl = currentProfile?.avatar_url || null;
      const file = $("#avatar-file").files[0];
      if (file) avatarUrl = await uploadImage(file, "avatar");

      const username = $("#profile-username").value.trim().toLowerCase();

      if (username && !/^[a-z0-9_]{3,30}$/.test(username)) {
        throw new Error("Username must be 3–30 characters using letters, numbers or underscores.");
      }

      const { error } = await db.from("profiles").update({
        full_name: $("#profile-name").value.trim(),
        username: username || null,
        bio: $("#profile-bio").value.trim(),
        avatar_url: avatarUrl
      }).eq("id", currentUser.id);

      if (error) throw error;

      currentProfile = await getProfile(currentUser.id);
      showMessage("Profile updated successfully.");
      loadMyProfile();
    } catch (error) {
      showMessage(error.message, true);
    } finally {
      setButtonBusy(button, false);
    }
  });

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

  $("#back-button").addEventListener("click", () => switchTab("feed"));
}

async function init() {
  bindEvents();

  if (!window.supabase?.createClient) {
    showMessage("Supabase library did not load. Check your internet connection.", true);
    return;
  }

  if (!SUPABASE_KEY || SUPABASE_KEY.includes("PASTE_YOUR")) {
    showMessage("Add your Supabase publishable key in app.js before using the website.", true);
    return;
  }

  db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  const { data: { session }, error } = await db.auth.getSession();
  if (error) showMessage(error.message, true);

  await updateApp(session);

  db.auth.onAuthStateChange((_event, newSession) => {
    setTimeout(() => updateApp(newSession), 0);
  });
}

document.addEventListener("DOMContentLoaded", init);
