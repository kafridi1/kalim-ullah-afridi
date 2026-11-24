
const SUPABASE_URL = "https://kvwoyeusveepyjewrzpi.supabase.co";

const SUPABASE_KEY = "sb_publishable__kSVXsmw0d-erIP9doLa3g_J29aYfiv";

// ======================================
// KALIM SOCIAL - MAIN APPLICATION
// ======================================



const db = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

const $ = (id) => document.getElementById(id);
let currentUser = null;

function showMessage(text) {
  $("message").textContent = text || "";
}

function make(tag, text, className) {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = text;
  if (className) el.className = className;
  return el;
}

function makeButton(text, action, className = "") {
  const button = make("button", text, className);
  button.type = "button";
  button.addEventListener("click", action);
  return button;
}

function avatar(url) {
  const img = document.createElement("img");
  img.className = "avatar";
  img.alt = "Profile picture";
  img.src = url || "https://placehold.co/100x100?text=User";
  return img;
}

function showView(name) {
  document.querySelectorAll(".view").forEach(v => {
    v.hidden = true;
  });

  const view = $(name + "-view");
  if (view) view.hidden = false;
}

// ======================================
// AUTHENTICATION
// ======================================

async function updateApp(session) {
  currentUser = session?.user || null;

  $("auth-section").hidden = !!currentUser;
  $("home-section").hidden = !currentUser;

  if (currentUser) {
    showView("feed");
    await loadFeed();
    await loadMyProfile();
  }
}

$("signup-form").addEventListener("submit", async (e) => {
  e.preventDefault();

  const name = $("signup-name").value.trim();
  const email = $("signup-email").value.trim();
  const password = $("signup-password").value;

  if (password.length < 6) {
    return showMessage("Password must be at least 6 characters.");
  }

  showMessage("Creating account...");

  const { error } = await db.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: name }
    }
  });

  if (error) return showMessage(error.message);

  showMessage("Account created! Check your email for verification.");
  $("signup-form").reset();
});

$("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();

  showMessage("Logging in...");

  const { data, error } = await db.auth.signInWithPassword({
    email: $("login-email").value.trim(),
    password: $("login-password").value
  });

  if (error) return showMessage(error.message);

  $("login-form").reset();
  await updateApp(data.session);
  showMessage("Welcome to Kalim Social!");
});

$("logout-button").addEventListener("click", async () => {
  const { error } = await db.auth.signOut();
  if (error) return showMessage(error.message);

  currentUser = null;
  await updateApp(null);
  showMessage("You are logged out.");
});

// ======================================
// NAVIGATION
// ======================================

document.querySelectorAll("[data-tab]").forEach(button => {
  button.addEventListener("click", async () => {
    const tab = button.dataset.tab;
    showView(tab);

    if (tab === "feed") await loadFeed();
    if (tab === "profile") await loadMyProfile();
    if (tab === "notifications") await loadNotifications();
  });
});

// ======================================
// IMAGE UPLOAD
// ======================================

async function uploadImage(file, folder) {
  if (!file) return null;

  if (!file.type.startsWith("image/")) {
    throw new Error("Please choose an image file.");
  }

  if (file.size > 5 * 1024 * 1024) {
    throw new Error("Image must be smaller than 5 MB.");
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${currentUser.id}/${folder}-${crypto.randomUUID()}-${safeName}`;

  const { error } = await db.storage
    .from("social-images")
    .upload(path, file);

  if (error) throw error;

  const { data } = db.storage
    .from("social-images")
    .getPublicUrl(path);

  return data.publicUrl;
}

// ======================================
// CREATE POST
// ======================================

$("post-form").addEventListener("submit", async (e) => {
  e.preventDefault();

  const content = $("post-content").value.trim();
  const file = $("post-image").files[0];

  if (!content && !file) {
    return showMessage("Write something or choose an image.");
  }

  try {
    showMessage("Publishing post...");

    const imageUrl = file
      ? await uploadImage(file, "post")
      : null;

    const { error } = await db.from("posts").insert({
      user_id: currentUser.id,
      content,
      image_url: imageUrl
    });

    if (error) throw error;

    $("post-form").reset();
    showMessage("Post published!");
    await loadFeed();
  } catch (error) {
    showMessage(error.message);
  }
});

// ======================================
// LOAD POSTS
// ======================================

async function getProfile(userId) {
  const { data } = await db
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  return data;
}

async function loadFeed(targetUserId = null, targetContainer = "feed") {
  const container = $(targetContainer);
  container.replaceChildren();

  let query = db
    .from("posts")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  if (targetUserId) {
    query = query.eq("user_id", targetUserId);
  }

  const { data: posts, error } = await query;

  if (error) return showMessage(error.message);

  if (!posts?.length) {
    container.append(make("p", "No posts yet."));
    return;
  }

  for (const post of posts) {
    const profile = await getProfile(post.user_id);

    const card = make("article", undefined, "post-card");

    const heading = make("div", undefined, "profile-row");
    heading.append(avatar(profile?.avatar_url));

    const identity = make("div");
    identity.append(
      make("h3", profile?.full_name || profile?.username || "User"),
      make("p", "@" + (profile?.username || "user"), "muted")
    );

    heading.append(identity);
    card.append(heading);

    if (post.content) {
      card.append(make("p", post.content));
    }

    if (post.image_url) {
      const img = document.createElement("img");
      img.src = post.image_url;
      img.alt = "Post image";
      img.className = "post-image";
      card.append(img);
    }

    card.append(make("p", new Date(post.created_at).toLocaleString(), "muted"));

    const { data: likes } = await db
      .from("likes")
      .select("user_id")
      .eq("post_id", post.id);

    const liked = likes?.some(like => like.user_id === currentUser.id);
    const likeButton = makeButton(
      `${liked ? "❤️ Unlike" : "🤍 Like"} (${likes?.length || 0})`,
      async () => toggleLike(post.id, liked)
    );

    card.append(likeButton);

    const { data: comments } = await db
      .from("comments")
      .select("*")
      .eq("post_id", post.id)
      .order("created_at", { ascending: true });

    const commentArea = make("div");

    for (const comment of comments || []) {
      const commentProfile = await getProfile(comment.user_id);
      const item = make(
        "p",
        `${commentProfile?.username || "User"}: ${comment.content}`,
        "comment"
      );
      commentArea.append(item);
    }

    const commentForm = make("form", undefined, "comment-form");
    const commentInput = document.createElement("input");
    commentInput.placeholder = "Write a comment...";
    commentInput.maxLength = 1000;
    commentInput.required = true;

    const commentSubmit = make("button", "Comment");
    commentSubmit.type = "submit";

    commentForm.append(commentInput, commentSubmit);

    commentForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const { error } = await db.from("comments").insert({
        post_id: post.id,
        user_id: currentUser.id,
        content: commentInput.value.trim()
      });

      if (error) return showMessage(error.message);

      showMessage("Comment added!");
      await loadFeed(targetUserId, targetContainer);
    });

    card.append(commentArea, commentForm);

    if (post.user_id !== currentUser.id) {
      const followButton = makeButton(
        "View Profile",
        () => openProfile(post.user_id),
        "secondary"
      );
      card.append(followButton);
    }

    container.append(card);
  }
}

// ======================================
// LIKE / UNLIKE
// ======================================

async function toggleLike(postId, alreadyLiked) {
  let result;

  if (alreadyLiked) {
    result = await db.from("likes")
      .delete()
      .eq("post_id", postId)
      .eq("user_id", currentUser.id);
  } else {
    result = await db.from("likes").insert({
      post_id: postId,
      user_id: currentUser.id
    });
  }

  if (result.error) return showMessage(result.error.message);

  await loadFeed();
}

// ======================================
// MY PROFILE
// ======================================

async function loadMyProfile() {
  const profile = await getProfile(currentUser.id);
  if (!profile) return;

  $("my-profile").replaceChildren();

  const row = make("div", undefined, "profile-row");
  row.append(avatar(profile.avatar_url));
  row.append(make("div",
    `${profile.full_name || ""} @${profile.username || ""}\n${profile.bio || ""}`
  ));

  $("my-profile").append(row);

  $("profile-name").value = profile.full_name || "";
  $("profile-username").value = profile.username || "";
  $("profile-bio").value = profile.bio || "";
}

$("profile-form").addEventListener("submit", async (e) => {
  e.preventDefault();

  try {
    const name = $("profile-name").value.trim();
    const username = $("profile-username").value.trim().toLowerCase();
    const bio = $("profile-bio").value.trim();
    const file = $("avatar-file").files[0];

    if (!/^[a-z0-9_]{3,30}$/.test(username)) {
      return showMessage("Username: 3-30 letters, numbers or underscores.");
    }

    let avatarUrl;

    if (file) {
      avatarUrl = await uploadImage(file, "avatar");
    }

    const changes = {
      full_name: name,
      username,
      bio
    };

    if (avatarUrl) changes.avatar_url = avatarUrl;

    const { error } = await db
      .from("profiles")
      .update(changes)
      .eq("id", currentUser.id);

    if (error) throw error;

    showMessage("Profile updated!");
    $("avatar-file").value = "";
    await loadMyProfile();
  } catch (error) {
    showMessage(error.message);
  }
});

// ======================================
// SEARCH USERS
// ======================================

$("search-button").addEventListener("click", searchUsers);

$("search-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") searchUsers();
});

async function searchUsers() {
  const term = $("search-input").value.trim();
  const results = $("search-results");
  results.replaceChildren();

  if (term.length < 2) {
    return showMessage("Enter at least 2 characters.");
  }

  const safeTerm = term.replace(/[,%()]/g, "");

  const { data, error } = await db
    .from("profiles")
    .select("id, username, full_name, avatar_url, bio")
    .or(`username.ilike.%${safeTerm}%,full_name.ilike.%${safeTerm}%`)
    .limit(20);

  if (error) return showMessage(error.message);

  if (!data?.length) {
    results.append(make("p", "No users found."));
    return;
  }

  for (const profile of data) {
    if (profile.id === currentUser.id) continue;

    const row = make("div", undefined, "result-item");
    row.append(avatar(profile.avatar_url));
    row.append(make("span",
      `${profile.full_name || "User"} (@${profile.username})`
    ));

    row.append(makeButton("View", () => openProfile(profile.id)));
    results.append(row);
  }
}

// ======================================
// OTHER USER PROFILE + FOLLOW
// ======================================

async function openProfile(userId) {
  showView("other-profile");

  const profile = await getProfile(userId);
  if (!profile) return showMessage("Profile not found.");

  const area = $("other-profile");
  area.replaceChildren();

  const row = make("div", undefined, "profile-row");
  row.append(avatar(profile.avatar_url));
  row.append(make("div",
    `${profile.full_name || "User"}\n@${profile.username}\n${profile.bio || ""}`
  ));
  area.append(row);

  const { data: existing } = await db
    .from("follows")
    .select("id")
    .eq("follower_id", currentUser.id)
    .eq("following_id", userId)
    .maybeSingle();

  const followButton = makeButton(
    existing ? "Unfollow" : "Follow",
    async () => {
      let result;

      if (existing) {
        result = await db.from("follows")
          .delete()
          .eq("follower_id", currentUser.id)
          .eq("following_id", userId);
      } else {
        result = await db.from("follows").insert({
          follower_id: currentUser.id,
          following_id: userId
        });
      }

      if (result.error) return showMessage(result.error.message);

      await openProfile(userId);
    }
  );

  if (userId !== currentUser.id) area.append(followButton);

  const { count: followers } = await db
    .from("follows")
    .select("*", { count: "exact", head: true })
    .eq("following_id", userId);

  const { count: following } = await db
    .from("follows")
    .select("*", { count: "exact", head: true })
    .eq("follower_id", userId);

  area.append(make("p", `Followers: ${followers || 0} | Following: ${following || 0}`));

  await loadFeed(userId, "other-posts");
}

$("back-button").addEventListener("click", () => showView("search"));

// ======================================
// NOTIFICATIONS
// ======================================

async function loadNotifications() {
  const list = $("notifications-list");
  list.replaceChildren();

  const { data, error } = await db
    .from("notifications")
    .select("*")
    .eq("user_id", currentUser.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return showMessage(error.message);

  if (!data?.length) {
    list.append(make("p", "No notifications yet."));
    return;
  }

  for (const notification of data) {
    const actor = await getProfile(notification.actor_id);

    const words = {
      like: "liked your post",
      comment: "commented on your post",
      follow: "started following you"
    };

    const row = make(
      "div",
      `${actor?.username || "Someone"} ${words[notification.type] || "interacted with you"} · ${new Date(notification.created_at).toLocaleString()}`,
      "notification-item"
    );

    if (!notification.is_read) {
      row.style.fontWeight = "bold";
    }

    if (notification.actor_id) {
      row.append(makeButton("View Profile", () => openProfile(notification.actor_id)));
    }

    list.append(row);

    if (!notification.is_read) {
      const { error: updateError } = await db
        .from("notifications")
        .update({ is_read: true })
        .eq("id", notification.id);

      if (updateError) showMessage(updateError.message);
    }
  }
}

// ======================================
// RESTORE LOGIN SESSION
// ======================================

db.auth.onAuthStateChange((event, session) => {
  setTimeout(() => updateApp(session), 0);
});

(async () => {
  const { data, error } = await db.auth.getSession();

  if (error) {
    showMessage(error.message);
    return;
  }

  await updateApp(data.session);
})();
