"use strict";

/* ============================================================
   SCRIPT.JS — shared by BOTH pages (index.html + dashboard.html)
   Sections 1-6 are shared helpers. Sections 7-10 use "page
   guards" (if (ON_SIGNUP) / if (ON_DASHBOARD)) so the right
   code runs on the right page.
   ============================================================ */

/* ============================================================
   SECTION 1: Shortcuts & constants
   ============================================================ */
const STORAGE_KEY = "ncc_signup_users"; // the "key" our data lives under in localStorage
const $ = (id) => document.getElementById(id); // tiny helper: $("email") instead of document.getElementById("email")

// Which page are we on? !! turns "element found / null" into true / false.
const ON_SIGNUP = !!document.getElementById("signupForm");
const ON_DASHBOARD = !!document.getElementById("tableBody");

/* ============================================================
   SECTION 2: Safe localStorage access
   localStorage can be BLOCKED (private mode, sandboxed previews…),
   so we test it first and gracefully fall back to a normal
   in-memory array (data just won't survive a refresh).
   Both pages read the SAME storage because they live in the
   same folder/origin — that's how signup writes and the
   dashboard reads.
   ============================================================ */
let usingMemoryOnly = false;
let memoryUsers = [];

try {
  const test = "__ncc_test__";
  localStorage.setItem(test, "1");   // try writing
  localStorage.removeItem(test);     // clean up
} catch (err) {
  usingMemoryOnly = true;            // blocked → use memory fallback
}

/** Read the users array out of storage. Always returns an array. */
function loadUsers() {
  if (usingMemoryOnly) return memoryUsers;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);       // null if nothing saved yet
    const parsed = raw ? JSON.parse(raw) : [];           // JSON text → real array
    return Array.isArray(parsed) ? parsed : [];          // safety net if data got corrupted
  } catch (err) {
    return [];                                           // corrupted JSON → start fresh
  }
}

/** Save the users array back into storage as JSON text. */
function saveUsers(users) {
  if (usingMemoryOnly) { memoryUsers = users; return; }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(users));
  } catch (err) {
    memoryUsers = users;
    usingMemoryOnly = true;
  }
}

/* ============================================================
   SECTION 3: Validation rules (used by the signup page)
   ============================================================ */
// Classic email regex — explained fully in the guide:
// ^[a-zA-Z0-9._%+-]+  → something before the @  (letters, digits, . _ % + -)
// @                   → the literal @ symbol
// [a-zA-Z0-9.-]+      → domain name (gmail, outlook, srmist…)
// \.                  → a literal dot
// [a-zA-Z]{2,}$       → ending with 2+ letters (com, org, in, edu…)
const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

function setError(fieldId, message) {
  $(fieldId).classList.add("invalid");
  $(fieldId + "Error").textContent = message;
}
function clearError(fieldId) {
  $(fieldId).classList.remove("invalid");
  $(fieldId + "Error").textContent = "";
}
function clearAllErrors() {
  ["username", "email", "password"].forEach(clearError);
}

/* ============================================================
   SECTION 4: Password hashing (SHA-256 via the Web Crypto API)
   Hashing is ONE-WAY: you can turn "abc123" into a 64-character
   fingerprint, but nobody can turn the fingerprint back into
   "abc123". We only ever store the fingerprint.
   ============================================================ */
async function hashPassword(plain) {
  if (window.crypto && window.crypto.subtle) {
    const bytes = new TextEncoder().encode(plain);                      // text → bytes
    const digest = await window.crypto.subtle.digest("SHA-256", bytes); // the actual hash
    return Array.from(new Uint8Array(digest))                           // bytes → hex text
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  // Very rare fallback (only if SubtleCrypto is unavailable).
  // NOT secure — just keeps the demo from breaking. Real apps hash on a server anyway.
  let h = 5381;
  for (let i = 0; i < plain.length; i++) {
    h = ((h << 5) + h + plain.charCodeAt(i)) >>> 0;
  }
  return "fb" + h.toString(16);
}

/* ============================================================
   SECTION 5: Rendering the dashboard table
   We build rows with createElement + textContent (NOT innerHTML)
   so user input can never inject HTML/JS into the page (XSS).
   ============================================================ */
function shortHash(hash) {
  // 64 hex chars is too wide for a table — show first 10 + last 6
  return hash.slice(0, 10) + "…" + hash.slice(-6);
}

function makeCell(text, className) {
  const td = document.createElement("td");
  if (className) td.className = className;
  td.textContent = text; // safe: renders as dumb text, never as HTML
  return td;
}

function renderUsers() {
  const users = loadUsers();
  const tbody = $("tableBody");
  tbody.innerHTML = ""; // clear old rows, redraw from scratch (simple & reliable)

  $("userCount").textContent = users.length + (users.length === 1 ? " user" : " users");

  if (users.length === 0) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 5;
    td.className = "empty";
    td.textContent = "No users yet — go back and sign up!";
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  users.forEach((user, index) => {
    const tr = document.createElement("tr");

    const numCell = makeCell(String(index + 1));
    numCell.title = "Joined: " + new Date(user.joined).toLocaleString(); // hover tooltip

    const hashCell = makeCell(shortHash(user.password), "hash-cell");
    hashCell.title = user.password; // full hash on hover

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "btn-danger";
    deleteBtn.textContent = "Delete";
    deleteBtn.dataset.index = String(index); // remembers WHICH row this button belongs to

    const actionCell = document.createElement("td");
    actionCell.appendChild(deleteBtn);

    tr.appendChild(numCell);
    tr.appendChild(makeCell(user.username));
    tr.appendChild(makeCell(user.email));
    tr.appendChild(hashCell);
    tr.appendChild(actionCell);

    tbody.appendChild(tr);
  });
}

/* ============================================================
   SECTION 6: Toast (the little pop-up message)
   ============================================================ */
let toastTimer = null;
function showToast(message, type) {
  const toast = $("toast");
  toast.textContent = message;
  toast.className = "toast show" + (type === "bad" ? " toast-bad" : "");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
}

/* ============================================================
   SECTION 7: The signup flow — SIGNUP PAGE ONLY
   ============================================================ */
if (ON_SIGNUP) {
  $("signupForm").addEventListener("submit", async (event) => {
    event.preventDefault(); // stop the browser reloading the page on submit

    const username = $("username").value.trim();  // trim removes accidental spaces
    const email = $("email").value.trim();
    const password = $("password").value;         // no trim: spaces are allowed in passwords

    clearAllErrors();
    let valid = true;

    // Rule 1: username cannot be empty
    if (username === "") {
      setError("username", "Username cannot be empty.");
      valid = false;
    }
    // Rule 2: email must match the regex
    if (!EMAIL_REGEX.test(email)) {
      setError("email", "Please enter a valid email like name@domain.com");
      valid = false;
    }
    // Rule 3: password must be at least 6 characters
    if (password.length < 6) {
      setError("password", "Password must be at least 6 characters.");
      valid = false;
    }
    if (!valid) return; // stop here — nothing gets saved

    // Bonus check: block duplicate email signups (case-insensitive)
    const users = loadUsers();
    const isDuplicate = users.some((u) => u.email.toLowerCase() === email.toLowerCase());
    if (isDuplicate) {
      setError("email", "This email is already registered.");
      return;
    }

    // All good → hash the password, NEVER store the plain one
    const hashed = await hashPassword(password);

    users.push({
      username: username,
      email: email,
      password: hashed, // stored as a SHA-256 fingerprint
      joined: new Date().toISOString(),
    });
    saveUsers(users);   // persist to localStorage
    showToast("Signed up! Welcome aboard, " + username + " 🎉", "good");

    $("signupForm").reset(); // clear the form
    resetPasswordToggle();
    $("username").focus();   // nice UX: cursor back at the top
  });
}

/* ============================================================
   SECTION 8: Delete button (the brownie subtask) — DASHBOARD ONLY
   Event delegation: ONE listener on <tbody> handles clicks on
   every delete button — even buttons created in the future.
   ============================================================ */
if (ON_DASHBOARD) {
  $("tableBody").addEventListener("click", (event) => {
    const button = event.target.closest("button.btn-danger");
    if (!button) return; // the click wasn't on a delete button

    const index = Number(button.dataset.index); // which row?
    const users = loadUsers();
    const [removed] = users.splice(index, 1);   // remove exactly 1 user at that position
    saveUsers(users);
    renderUsers();
    if (removed) showToast("Deleted " + removed.username + ".", "bad");
  });
}

/* ============================================================
   SECTION 9: Small extras (clear errors while typing, show/hide
   password) — SIGNUP PAGE ONLY
   ============================================================ */
function resetPasswordToggle() {
  $("password").type = "password";
  $("togglePw").textContent = "👁";
}

if (ON_SIGNUP) {
  ["username", "email", "password"].forEach((id) => {
    $(id).addEventListener("input", () => clearError(id));
  });

  $("togglePw").addEventListener("click", () => {
    const pw = $("password");
    const showing = pw.type === "text";
    pw.type = showing ? "password" : "text";
    $("togglePw").textContent = showing ? "👁" : "🙈";
  });
}

/* ============================================================
   SECTION 10: Boot up — runs once when whichever page loads
   ============================================================ */
if (usingMemoryOnly) {
  const banner = $("storageBanner");
  if (banner) banner.hidden = false;
}
if (ON_DASHBOARD) renderUsers(); // draw the users table on the dashboard page
