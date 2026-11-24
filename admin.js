
const KEY = "kalimullah_portfolio_data";
const DEMO_PASSWORD = "admin123";

let editing = null;

function getData() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {
      projects: [],
      posts: []
    };
  } catch {
    return { projects: [], posts: [] };
  }
}

function saveData(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch (error) {
    alert("Storage limit reached. Try a smaller image.");
    return false;
  }
}

function safe(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;",
    '"': "&quot;", "'": "&#39;"
  })[c]);
}

document.getElementById("loginForm").addEventListener("submit", event => {
  event.preventDefault();

  if (document.getElementById("password").value === DEMO_PASSWORD) {
    document.getElementById("loginPanel").classList.add("hidden");
    document.getElementById("dashboardContent").classList.remove("hidden");
    renderList();
  } else {
    alert("Incorrect password.");
  }
});

document.getElementById("itemForm").addEventListener("submit", async event => {
  event.preventDefault();

  const title = document.getElementById("itemTitle").value.trim();
  const description = document.getElementById("itemDescription").value.trim();
  const type = document.getElementById("itemType").value;
  const status = document.getElementById("itemStatus").value;
  const file = document.getElementById("itemImage").files[0];

  let image = "";

  if (file) {
    if (!file.type.startsWith("image/")) {
      alert("Please select an image file.");
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      alert("Please choose an image smaller than 2 MB.");
      return;
    }

    try {
      image = await readImage(file);
    } catch {
      alert("Could not read this image.");
      return;
    }
  }

  const data = getData();
  const oldType = editing?.type;

  let existing = null;

  if (editing) {
    existing = data[oldType].find(item => item.id === editing.id);
  }

  const item = {
    id: editing ? editing.id : Date.now().toString(),
    title,
    description,
    status,
    image: image || existing?.image || "",
    date: existing?.date || new Date().toLocaleDateString()
  };

  if (editing) {
    data[oldType] = data[oldType].filter(x => x.id !== editing.id);
  }

  data[type].push(item);

  if (saveData(data)) {
    resetForm();
    renderList();
    alert("Content saved successfully!");
  }
});

function readImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function renderList() {
  const data = getData();
  const all = [
    ...data.posts.map(item => ({ ...item, type: "posts" })),
    ...data.projects.map(item => ({ ...item, type: "projects" }))
  ];

  document.getElementById("manageList").innerHTML = all.map(item => `
    <div class="item-row">
      <div>
        <strong>${safe(item.title)}</strong>
        <p>${item.type === "posts" ? "Blog" : "Project"} · ${safe(item.status)}</p>
      </div>
      <div class="actions">
        <button class="small-btn" onclick="editItem('${item.id}','${item.type}')">Edit</button>
        <button class="small-btn" onclick="toggleStatus('${item.id}','${item.type}')">
          ${item.status === "published" ? "Unpublish" : "Publish"}
        </button>
        <button class="small-btn danger" onclick="deleteItem('${item.id}','${item.type}')">Delete</button>
      </div>
    </div>
  `).join("") || "<p>No content added yet.</p>";
}

function editItem(id, type) {
  const item = getData()[type].find(x => x.id === id);
  if (!item) return;

  editing = { id, type };

  document.getElementById("itemTitle").value = item.title;
  document.getElementById("itemDescription").value = item.description;
  document.getElementById("itemType").value = type;
  document.getElementById("itemStatus").value = item.status;
  document.getElementById("formHeading").textContent = "Edit Content";
  document.getElementById("cancelEdit").classList.remove("hidden");

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function toggleStatus(id, type) {
  const data = getData();
  const item = data[type].find(x => x.id === id);
  if (!item) return;

  item.status = item.status === "published" ? "draft" : "published";

  if (saveData(data)) renderList();
}

function deleteItem(id, type) {
  if (!confirm("Are you sure you want to delete this item?")) return;

  const data = getData();
  data[type] = data[type].filter(x => x.id !== id);

  if (saveData(data)) renderList();
}

function resetForm() {
  editing = null;
  document.getElementById("itemForm").reset();
  document.getElementById("formHeading").textContent = "Add New Post or Project";
  document.getElementById("cancelEdit").classList.add("hidden");
}

document.getElementById("cancelEdit").addEventListener("click", resetForm);

document.getElementById("logoutBtn").addEventListener("click", () => {
  document.getElementById("dashboardContent").classList.add("hidden");
  document.getElementById("loginPanel").classList.remove("hidden");
  document.getElementById("password").value = "";
  resetForm();
});
