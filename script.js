
const STORAGE_KEY = "kalimullah_portfolio_data";

function getData() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {
      projects: [],
      posts: []
    };
  } catch {
    return { projects: [], posts: [] };
  }
}

function renderItems() {
  const data = getData();

  const projects = data.projects.filter(item => item.status === "published");
  const posts = data.posts.filter(item => item.status === "published");

  document.getElementById("projectList").innerHTML =
    projects.map(item => `
      <article class="card">
        ${item.image ? `<img src="${item.image}" alt="">` : ""}
        <div class="card-content">
          <h3>${escapeHTML(item.title)}</h3>
          <p>${escapeHTML(item.description)}</p>
        </div>
      </article>
    `).join("") || "<p>No projects published yet.</p>";

  document.getElementById("postList").innerHTML =
    posts.map(item => `
      <article class="card">
        ${item.image ? `<img src="${item.image}" alt="">` : ""}
        <div class="card-content">
          <div class="date">${escapeHTML(item.date || "")}</div>
          <h3>${escapeHTML(item.title)}</h3>
          <p>${escapeHTML(item.description)}</p>
        </div>
      </article>
    `).join("") || "<p>No blog posts published yet.</p>";
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

document.getElementById("year").textContent = new Date().getFullYear();

document.getElementById("contactForm").addEventListener("submit", event => {
  event.preventDefault();

  const name = document.getElementById("contactName").value.trim();
  const email = document.getElementById("contactEmail").value.trim();
  const message = document.getElementById("contactMessage").value.trim();

  const subject = encodeURIComponent("Portfolio contact from " + name);
  const body = encodeURIComponent(
    `Name: ${name}\nEmail: ${email}\n\n${message}`
  );

  window.location.href =
    `mailto:YOUR_EMAIL@example.com?subject=${subject}&body=${body}`;
});

renderItems();
