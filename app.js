
const SUPABASE_URL = "PASTE_YOUR_PROJECT_URL_HERE";
const SUPABASE_KEY = "PASTE_YOUR_PUBLISHABLE_KEY_HERE";

const db = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

const $ = (id) => document.getElementById(id);

function message(text) {
  $("message").textContent = text;
}

async function showApp(session) {
  $("auth-section").hidden = !!session;
  $("home-section").hidden = !session;

  if (session) {
    await loadFeed();
  }
}

// SIGN UP
$("signup-form").addEventListener("submit", async (e) => {
  e.preventDefault();

  const name = $("signup-name").value.trim();
  const email = $("signup-email").value.trim();
  const password = $("signup-password").value;

  message("Creating account...");

  const { error } = await db.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: name }
    }
  });

  if (error) return message(error.message);

  message("Account created! Check your email for verification.");
});

// LOGIN
$("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();

  message("Logging in...");

  const { data, error } = await db.auth.signInWithPassword({
    email: $("login-email").value.trim(),
    password: $("login-password").value
  });

  if (error) return message(error.message);

  message("Welcome to Kalim Social!");
  await showApp(data.session);
});

// LOGOUT
$("logout-button").addEventListener("click", async () => {
  const { error } = await db.auth.signOut();

  if (error) return message(error.message);

  message("Logged out successfully.");
  await showApp(null);
});

// CREATE POST
$("post-form").addEventListener("submit", async (e) => {
  e.preventDefault();

  const { data: { user } } = await db.auth.getUser();

  if (!user) return message("Please login first.");

  const content = $("post-content").value.trim();
  const file = $("post-image").files[0];

  if (!content && !file) {
    return message("Write something or choose an image.");
  }

  message("Publishing post...");

  let imageUrl = null;

  if (file) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${user.id}/${crypto.randomUUID()}-${safeName}`;

    const { error: uploadError } = await db.storage
      .from("social-images")
      .upload(path, file);

    if (uploadError) return message(uploadError.message);

    const { data } = db.storage
      .from("social-images")
      .getPublicUrl(path);

    imageUrl = data.publicUrl;
  }

  const { error } = await db.from("posts").insert({
    user_id: user.id,
    content,
    image_url: imageUrl
  });

  if (error) return message(error.message);

  $("post-content").value = "";
  $("post-image").value = "";

  message("Post published!");
  await loadFeed();
});

// LOAD FEED
async function loadFeed() {
  const { data, error } = await db
    .from("posts")
    .select(`
      id,
      content,
      image_url,
      created_at,
      user_id,
      profiles(username, full_name),
      likes(id),
      comments(id, content, created_at, profiles(username))
    `)
    .order("created_at", { ascending: false });

  if (error) return message(error.message);

  const feed = $("feed");
  feed.replaceChildren();

  data.forEach((post) => {
    const card = document.createElement("article");
    card.style.cssText =
      "background:white;padding:18px;border-radius:12px;margin-bottom:15px;";

    const heading = document.createElement("h3");
    heading.textContent =
      post.profiles?.full_name ||
      post.profiles?.username ||
      "User";

    const content = document.createElement("p");
    content.textContent = post.content || "";
    content.style.margin = "12px 0";

    card.append(heading, content);

    if (post.image_url) {
      const image = document.createElement("img");
      image.src = post.image_url;
      image.alt = "Post image";
      image.style.cssText =
        "width:100%;border-radius:10px;margin:10px 0;";
      card.append(image);
    }

    const likeCount = document.createElement("p");
    likeCount.textContent = `❤️ ${post.likes?.length || 0} Likes`;
    card.append(likeCount);

    const commentList = document.createElement("div");

    (post.comments || []).forEach((comment) => {
      const item = document.createElement("p");
      item.textContent =
        `${comment.profiles?.username || "User"}: ${comment.content}`;
      commentList.append(item);
    });

    card.append(commentList);

    const commentForm = document.createElement("form");
    const commentInput = document.createElement("input");
    commentInput.placeholder = "Write a comment...";
    commentInput.required = true;

    const commentButton = document.createElement("button");
    commentButton.textContent = "Comment";

    commentForm.append(commentInput, commentButton);

    commentForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const { data: { user } } = await db.auth.getUser();
      if (!user) return message("Please login first.");

      const { error } = await db.from("comments").insert({
        post_id: post.id,
        user_id: user.id,
        content: commentInput.value.trim()
      });

      if (error) return message(error.message);

      await loadFeed();
    });

    const likeButton = document.createElement("button");
    likeButton.textContent = "Like";

    likeButton.addEventListener("click", async () => {
      const { data: { user } } = await db.auth.getUser();
      if (!user) return message("Please login first.");

      const { data: existing } = await db
        .from("likes")
        .select("id")
        .eq("post_id", post.id)
        .eq("user_id", user.id)
        .maybeSingle();

      let result;

      if (existing) {
        result = await db.from("likes").delete().eq("id", existing.id);
      } else {
        result = await db.from("likes").insert({
          post_id: post.id,
          user_id: user.id
        });
      }

      if (result.error) return message(result.error.message);

      await loadFeed();
    });

    card.append(likeButton, commentForm);
    feed.append(card);
  });
}

// RESTORE LOGIN SESSION
db.auth.onAuthStateChange((event, session) => {
  setTimeout(() => showApp(session), 0);
});
