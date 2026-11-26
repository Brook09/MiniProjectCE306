// script.js — UNI FIX (Vanilla JS) · ดึง/บันทึกข้อมูลผ่าน REST API ของ backend
// หน้าเว็บซ่อน/แสดงเมนูตามบทบาทเพื่อความสะดวกเท่านั้น — สิทธิ์จริงตรวจที่ backend ทุกคำขอ

/* ======================= ค่าคงที่ ======================= */
const API = "/api";
const TOKEN_KEY = "unifix_token";

const STATUS = {
  PENDING: { label: "รอรับเรื่อง", cls: "pending" },
  RECEIVED: { label: "รับเรื่องแล้ว", cls: "received" },
  IN_PROGRESS: { label: "กำลังดำเนินการ", cls: "progress" },
  DONE: { label: "ซ่อมเสร็จแล้ว", cls: "done" },
  CANCELLED: { label: "ยกเลิกคำร้อง", cls: "cancelled" },
};
const PRIORITY = {
  LOW: { label: "ไม่เร่งด่วน", cls: "low" },
  NORMAL: { label: "ปกติ", cls: "normal" },
  HIGH: { label: "เร่งด่วน", cls: "high" },
  URGENT: { label: "ด่วนที่สุด", cls: "urgent" },
};
const PRIORITY_ORDER = { URGENT: 0, HIGH: 1, NORMAL: 2, LOW: 3 };
const ROLE = {
  ADMIN: { label: "Administrator", short: "AD", note: "สิทธิ์ผู้ดูแล: จัดการรายการทั้งหมดและมอบหมายช่าง" },
  USER: { label: "End User", short: "US", note: "สิทธิ์ผู้ใช้: แจ้งซ่อมและติดตามสถานะของตัวเอง" },
  TECHNICIAN: { label: "Technician", short: "TC", note: "สิทธิ์ช่าง: รับงานที่ได้รับมอบหมายและอัปเดตสถานะ" },
};
// ช่างเดินสถานะได้ทีละขั้น (backend ตรวจกฎเดียวกันนี้ซ้ำ)
const TECH_NEXT = {
  RECEIVED: { status: "IN_PROGRESS", label: "▶ เริ่มซ่อม" },
  IN_PROGRESS: { status: "DONE", label: "✓ แจ้งซ่อมเสร็จ" },
};
const CLOSED = ["DONE", "CANCELLED"];

const VIEW_TITLES = {
  dashboard: "ภาพรวมระบบ",
  requests: "รายการแจ้งซ่อม",
  "new-request": "แจ้งซ่อมใหม่",
  "my-jobs": "งานของฉัน",
  technicians: "ช่างซ่อม",
};

const state = {
  user: null,
  view: "dashboard",
  meta: { categories: [], buildings: [] },
  technicians: [],
  jobs: [],
  jobsFilter: "active",
  selected: null, // รายการที่เปิดดูในหน้าต่างรายละเอียด
  pendingImage: null, // Blob ของรูปที่ย่อขนาดแล้ว รออัปโหลด
};

/* ======================= ตัวช่วย ======================= */
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function escapeHTML(value = "") {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
}

const formatDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", year: "numeric" }) : "-";
const formatDateTime = (iso) =>
  iso ? new Date(iso).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "medium", timeStyle: "short" }) : "-";

const statusBadge = (code) => `<span class="status ${STATUS[code]?.cls ?? ""}">${escapeHTML(STATUS[code]?.label ?? code)}</span>`;
const priorityBadge = (code) => `<span class="priority ${PRIORITY[code]?.cls ?? ""}">${escapeHTML(PRIORITY[code]?.label ?? code)}</span>`;
const isRole = (...roles) => roles.includes(state.user?.role);

let toastTimer;
function showToast(message, isError = false) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.toggle("error", isError);
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 3200);
}

function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

/* ======================= เรียก API ======================= */
/** ส่งคำขอไป backend: แนบ token ให้ทุกครั้ง · error → throw Error พร้อมข้อความจาก backend */
async function api(path, { method = "GET", body, form } = {}) {
  const headers = {};
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) headers.Authorization = `Bearer ${token}`;

  let payload;
  if (form) payload = form; // FormData (มีไฟล์) — browser ตั้ง Content-Type ให้เอง
  else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }

  let res;
  try {
    res = await fetch(API + path, { method, headers, body: payload });
  } catch {
    throw new Error("ติดต่อเซิร์ฟเวอร์ไม่ได้ — ตรวจว่ารัน backend อยู่หรือไม่");
  }

  if (res.status === 204) return null;
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    // token หมดอายุ/ไม่ถูกต้อง → กลับไปหน้าเข้าสู่ระบบ
    if (res.status === 401 && token && path !== "/auth/login") logout(false);
    throw new Error(json.error?.message ?? `เกิดข้อผิดพลาด (${res.status})`);
  }
  return json.data;
}

/* ======================= เข้าสู่ระบบ / ออกจากระบบ ======================= */
async function login(username, password) {
  const button = $("#login-submit");
  button.disabled = true;
  $("#login-error").classList.add("hidden");
  try {
    const { token, user } = await api("/auth/login", { method: "POST", body: { username, password } });
    localStorage.setItem(TOKEN_KEY, token);
    await startApp(user);
    showToast(`เข้าสู่ระบบในสิทธิ์ ${ROLE[user.role].label} สำเร็จ`);
  } catch (err) {
    $("#login-error").textContent = err.message;
    $("#login-error").classList.remove("hidden");
  } finally {
    button.disabled = false;
  }
}

/** สลับระหว่างฟอร์ม "เข้าสู่ระบบ" กับ "สมัครสมาชิก" */
function showAuthForm(name) {
  $("#login-form").classList.toggle("hidden", name !== "login");
  $("#register-form").classList.toggle("hidden", name !== "register");
  $("#login-error").classList.add("hidden");
  $("#register-error").classList.add("hidden");
  $(`#${name}-form input`)?.focus();
}

/** ตรวจที่หน้าเว็บก่อน (กฎเดียวกับ backend) ให้ผู้ใช้รู้ทันที — backend ยังตรวจซ้ำเสมอ */
function checkRegisterForm(data) {
  if (!data.fullName) return "กรุณากรอกชื่อ-นามสกุล";
  if (!/^[a-z0-9_]{3,30}$/.test(data.username)) return "ชื่อผู้ใช้ใช้ a-z, 0-9, _ ได้ 3–30 ตัว";
  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) return "รูปแบบอีเมลไม่ถูกต้อง";
  if (data.phone && !/^0\d{8,9}$/.test(data.phone)) return "เบอร์โทรต้องขึ้นต้นด้วย 0 และมี 9–10 หลัก";
  if (data.password.length < 8) return "รหัสผ่านต้องมีอย่างน้อย 8 ตัว";
  if (!/[A-Za-z]/.test(data.password) || !/\d/.test(data.password)) return "รหัสผ่านต้องมีทั้งตัวอักษรภาษาอังกฤษและตัวเลข";
  if (data.password !== data.confirmPassword) return "รหัสผ่านทั้งสองช่องไม่ตรงกัน";
  return null;
}

async function register(form) {
  const raw = Object.fromEntries(new FormData(form));
  const data = {
    fullName: raw.fullName.trim(),
    username: raw.username.trim().toLowerCase(),
    email: raw.email.trim(),
    phone: raw.phone.trim(),
    password: raw.password,
    confirmPassword: raw.confirmPassword,
  };
  const errorBox = $("#register-error");
  const problem = checkRegisterForm(data);
  if (problem) {
    errorBox.textContent = problem;
    return errorBox.classList.remove("hidden");
  }

  const button = $("#register-submit");
  button.disabled = true;
  errorBox.classList.add("hidden");
  try {
    // confirmPassword ใช้ตรวจที่หน้าเว็บเท่านั้น ไม่ส่งไป backend
    const { confirmPassword: _skip, ...body } = data;
    const { token, user } = await api("/auth/register", { method: "POST", body });
    localStorage.setItem(TOKEN_KEY, token); // สมัครเสร็จ = เข้าสู่ระบบให้ทันที
    form.reset();
    await startApp(user);
    showToast(`ยินดีต้อนรับ ${user.fullName} — สมัครสมาชิกสำเร็จ`);
  } catch (err) {
    errorBox.textContent = err.message;
    errorBox.classList.remove("hidden");
  } finally {
    button.disabled = false;
  }
}

function logout(showMessage = true) {
  localStorage.removeItem(TOKEN_KEY);
  state.user = null;
  if ($("#detail-dialog").open) $("#detail-dialog").close();
  $("#app-shell").classList.add("hidden");
  $("#login-screen").classList.remove("hidden");
  $("#login-form").reset();
  showAuthForm("login");
  if (showMessage) showToast("ออกจากระบบแล้ว");
}

async function startApp(user) {
  state.user = user;
  state.meta = await api("/meta");
  fillMetaSelects();
  applyRole();
  $("#login-screen").classList.add("hidden");
  $("#app-shell").classList.remove("hidden");
  await showView(isRole("TECHNICIAN") ? "my-jobs" : "dashboard");
}

/** เปิดเว็บมา ถ้ามี token ค้างอยู่ ถาม backend ว่ายังใช้ได้ไหม */
async function restoreSession() {
  if (!localStorage.getItem(TOKEN_KEY)) return;
  try {
    await startApp(await api("/auth/me"));
  } catch {
    localStorage.removeItem(TOKEN_KEY);
  }
}

/* ======================= ปรับหน้าตาตามบทบาท ======================= */
function applyRole() {
  const { role, fullName } = state.user;
  const info = ROLE[role];

  // ปุ่ม/เมนูที่มี data-roles จะแสดงเฉพาะบทบาทที่ระบุ
  $$("[data-roles]").forEach((el) => el.classList.toggle("hidden", !el.dataset.roles.split(" ").includes(role)));

  $("#profile-avatar").textContent = info.short;
  $("#profile-name").textContent = fullName;
  $("#profile-role").textContent = info.label;
  $("#role-pill").textContent = role;
  $("#role-note").textContent = info.note;

  const mine = role === "USER";
  $("#nav-requests-label").textContent = mine ? "รายการของฉัน" : "รายการแจ้งซ่อม";
  $("#requests-heading").textContent = mine ? "รายการแจ้งซ่อมของฉัน" : "รายการแจ้งซ่อมทั้งหมด";
  $("#list-new-btn").classList.toggle("hidden", role === "TECHNICIAN");

  const subtitles = {
    ADMIN: "ภาพรวมรายการแจ้งซ่อมทั้งหมดในระบบ",
    USER: "สรุปรายการที่คุณแจ้งเข้ามา",
    TECHNICIAN: "สรุปงานที่คุณได้รับมอบหมาย",
  };
  $("#stats-subtitle").textContent = subtitles[role];

  if (role === "TECHNICIAN") {
    $("#welcome-tag").textContent = "สำหรับช่างซ่อม";
    $("#welcome-title").innerHTML = `สวัสดี ${escapeHTML(fullName)}<br>พร้อมลุยงานวันนี้`;
    $("#welcome-text").textContent = "ดูงานที่ได้รับมอบหมาย กดเริ่มซ่อมเมื่อเข้าหน้างาน และแจ้งซ่อมเสร็จเมื่อเรียบร้อย";
  } else {
    $("#welcome-tag").textContent = "ระบบจัดการงานซ่อมบำรุง";
    $("#welcome-title").innerHTML = "จัดการทุกปัญหา<br>ได้ในที่เดียว";
    $("#welcome-text").textContent = "แจ้งปัญหา ติดตามสถานะ และจัดการงานซ่อมภายในมหาวิทยาลัยอย่างเป็นระบบ";
  }
}

/** เติมช่องเลือก (สถานะ, ประเภท, อาคาร, ความถนัดของช่าง) จากข้อมูลใน backend */
function fillMetaSelects() {
  const { categories, buildings } = state.meta;
  const options = (items) => items.map((i) => `<option value="${i.id}">${escapeHTML(i.name)}</option>`).join("");

  $("#status-filter").innerHTML =
    `<option value="">ทุกสถานะ</option>` +
    Object.entries(STATUS).map(([code, s]) => `<option value="${code}">${s.label}</option>`).join("");
  $("#category-filter").innerHTML = `<option value="">ทุกประเภท</option>${options(categories)}`;
  $("#form-category").innerHTML = `<option value="">เลือกประเภท</option>${options(categories)}`;
  $("#form-building").innerHTML = `<option value="">เลือกอาคาร</option>${options(buildings)}`;
  $("#tech-skill-options").innerHTML = categories
    .map((c) => `<label class="check"><input type="checkbox" name="categoryIds" value="${c.id}"> ${escapeHTML(c.name)}</label>`)
    .join("");
}

/* ======================= สลับหน้า ======================= */
async function showView(viewName) {
  state.view = viewName;
  $$(".view").forEach((view) => view.classList.toggle("active", view.id === `${viewName}-view`));
  $$(".nav-link").forEach((btn) => btn.classList.toggle("active", btn.dataset.view === viewName));
  $("#page-title").textContent = VIEW_TITLES[viewName] ?? "ภาพรวมระบบ";
  window.scrollTo({ top: 0, behavior: "smooth" });

  if (viewName === "new-request") prepareRepairForm();
  await refreshCurrentView();
}

/** โหลดข้อมูลของหน้าที่เปิดอยู่ใหม่ (เรียกหลังบันทึก/แก้ไขทุกครั้ง) */
async function refreshCurrentView() {
  try {
    if (state.view === "dashboard") await renderDashboard();
    if (state.view === "requests") await renderAllRequests();
    if (state.view === "my-jobs") await renderJobs();
    if (state.view === "technicians") await renderTechnicians();
  } catch (err) {
    showToast(err.message, true);
  }
}

/* ======================= ตารางรายการแจ้งซ่อม ======================= */
function rowHTML(item) {
  const technician = item.technicianName
    ? `<span class="location-main">${escapeHTML(item.technicianName)}</span><span class="location-sub">${escapeHTML(item.technicianCode)}</span>`
    : `<span class="muted">ยังไม่มอบหมาย</span>`;
  return `<tr>
    <td><span class="request-name">${escapeHTML(item.title)}</span><span class="request-id">${escapeHTML(item.code)} · ${priorityBadge(item.priority)}</span></td>
    <td><span class="location-main">${escapeHTML(item.building)}</span><span class="location-sub">${escapeHTML(item.room)}</span></td>
    <td>${escapeHTML(item.category)}</td>
    <td>${technician}</td>
    <td>${formatDate(item.createdAt)}</td>
    <td>${statusBadge(item.status)}</td>
    <td><div class="row-actions"><button class="small-btn" data-action="detail" data-id="${item.id}">ดูรายละเอียด</button></div></td>
  </tr>`;
}

async function renderDashboard() {
  const { stats, recent } = await api("/dashboard");
  $("#stat-total").textContent = stats.total;
  $("#stat-pending").textContent = stats.pending + stats.received;
  $("#stat-progress").textContent = stats.inProgress;
  $("#stat-done").textContent = stats.done;
  $("#recent-table-body").innerHTML = recent.map(rowHTML).join("");
  $("#recent-empty").classList.toggle("hidden", recent.length !== 0);
}

async function renderAllRequests() {
  const params = new URLSearchParams();
  const search = $("#search-input").value.trim();
  if (search) params.set("search", search);
  if ($("#status-filter").value) params.set("status", $("#status-filter").value);
  if ($("#category-filter").value) params.set("categoryId", $("#category-filter").value);

  const items = await api(`/requests?${params}`);
  $("#all-table-body").innerHTML = items.map(rowHTML).join("");
  $("#all-empty").classList.toggle("hidden", items.length !== 0);
}

/* ======================= งานของฉัน (ช่าง) ======================= */
async function renderJobs() {
  state.jobs = await api("/requests");
  const active = state.jobs.filter((j) => !CLOSED.includes(j.status));
  const done = state.jobs.filter((j) => CLOSED.includes(j.status));
  $("#jobs-count-active").textContent = active.length;
  $("#jobs-count-done").textContent = done.length;

  // งานที่กำลังซ่อมขึ้นก่อน → ตามด้วยความเร่งด่วน → งานเก่าก่อน
  const list =
    state.jobsFilter === "active"
      ? active.sort(
          (a, b) =>
            (b.status === "IN_PROGRESS") - (a.status === "IN_PROGRESS") ||
            PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] ||
            a.createdAt.localeCompare(b.createdAt),
        )
      : done;

  $("#job-grid").innerHTML = list.map(jobCardHTML).join("");
  $("#jobs-empty").classList.toggle("hidden", list.length !== 0);
}

function jobCardHTML(job) {
  const next = TECH_NEXT[job.status];
  const phone = job.reporterPhone ? ` · <a href="tel:${escapeHTML(job.reporterPhone)}">${escapeHTML(job.reporterPhone)}</a>` : "";
  return `<article class="job-card ${job.status === "IN_PROGRESS" ? "is-working" : ""}">
    <div class="job-top">${statusBadge(job.status)}${priorityBadge(job.priority)}<span class="request-id">${escapeHTML(job.code)}</span></div>
    <h3>${escapeHTML(job.title)}</h3>
    <p class="job-desc">${escapeHTML(job.description)}</p>
    <dl class="job-meta">
      <div><dt>📍 สถานที่</dt><dd>${escapeHTML(job.building)} · ${escapeHTML(job.room)}</dd></div>
      <div><dt>🏷️ ประเภท</dt><dd>${escapeHTML(job.category)}</dd></div>
      <div><dt>👤 ผู้แจ้ง</dt><dd>${escapeHTML(job.reporterName)}${phone}</dd></div>
      <div><dt>🗓️ แจ้งเมื่อ</dt><dd>${formatDateTime(job.createdAt)}</dd></div>
    </dl>
    <div class="job-actions">
      <button class="outline-btn" data-action="detail" data-id="${job.id}">ดูรายละเอียด</button>
      ${next ? `<button class="primary-btn" data-action="job-next" data-id="${job.id}" data-status="${next.status}">${next.label}</button>` : ""}
      ${job.status === "DONE" ? `<span class="muted">เสร็จเมื่อ ${formatDateTime(job.completedAt)}</span>` : ""}
    </div>
  </article>`;
}

/* ======================= ช่างซ่อม (แอดมิน) ======================= */
async function renderTechnicians() {
  state.technicians = await api("/technicians");
  $("#tech-table-body").innerHTML = state.technicians
    .map(
      (t) => `<tr>
      <td><span class="request-name">${escapeHTML(t.fullName)}</span><span class="request-id">${escapeHTML(t.employeeCode)} · @${escapeHTML(t.username)}${t.phone ? ` · ${escapeHTML(t.phone)}` : ""}</span></td>
      <td>${escapeHTML(t.department)}</td>
      <td>${escapeHTML(t.skills)}</td>
      <td><strong>${t.activeJobs}</strong></td>
      <td>${t.completedJobs}</td>
      <td>${t.isAvailable ? `<span class="status done">ว่างรับงาน</span>` : `<span class="status cancelled">ไม่ว่าง</span>`}</td>
      <td><button class="small-btn" data-action="toggle-tech" data-id="${t.id}">${t.isAvailable ? "ตั้งเป็นไม่ว่าง" : "ตั้งเป็นว่าง"}</button></td>
    </tr>`,
    )
    .join("");
  $("#tech-empty").classList.toggle("hidden", state.technicians.length !== 0);
}

async function toggleTechnician(id) {
  const technician = state.technicians.find((t) => t.id === id);
  try {
    await api(`/technicians/${id}`, { method: "PATCH", body: { isAvailable: !technician.isAvailable } });
    showToast(`อัปเดตสถานะของ ${technician.fullName} แล้ว`);
    await renderTechnicians();
  } catch (err) {
    showToast(err.message, true);
  }
}

async function submitTechnicianForm(form) {
  const data = new FormData(form);
  const body = {
    fullName: data.get("fullName"),
    employeeCode: data.get("employeeCode"),
    username: data.get("username"),
    password: data.get("password"),
    phone: data.get("phone"),
    department: data.get("department"),
    categoryIds: data.getAll("categoryIds").map(Number),
  };
  const errorBox = $("#tech-form-error");
  errorBox.classList.add("hidden");
  if (body.categoryIds.length === 0) {
    errorBox.textContent = "กรุณาเลือกความถนัดอย่างน้อย 1 ประเภท";
    return errorBox.classList.remove("hidden");
  }
  try {
    const created = await api("/technicians", { method: "POST", body });
    form.reset();
    form.classList.add("hidden");
    showToast(`เพิ่มช่าง ${created.fullName} แล้ว — เข้าสู่ระบบด้วย ${created.username}`);
    await renderTechnicians();
  } catch (err) {
    errorBox.textContent = err.message;
    errorBox.classList.remove("hidden");
  }
}

/* ======================= หน้าต่างรายละเอียด ======================= */
async function openDetails(id) {
  try {
    const [item] = await Promise.all([
      api(`/requests/${id}`),
      // แอดมินต้องใช้รายชื่อช่างในช่องมอบหมาย
      isRole("ADMIN") ? api("/technicians").then((list) => (state.technicians = list)) : null,
    ]);
    state.selected = item;
    renderDetails(item);
    if (!$("#detail-dialog").open) $("#detail-dialog").showModal();
  } catch (err) {
    showToast(err.message, true);
  }
}

function renderDetails(item) {
  const field = (label, value, wide = false) =>
    `<div class="detail-field ${wide ? "wide" : ""}"><small>${label}</small><strong>${value}</strong></div>`;

  const technician = item.technicianName
    ? `${escapeHTML(item.technicianName)} (${escapeHTML(item.technicianCode)})${item.technicianPhone ? ` · ${escapeHTML(item.technicianPhone)}` : ""}`
    : `<span class="muted">ยังไม่มอบหมาย</span>`;

  const images = item.images.length
    ? `<div class="detail-field wide"><small>รูปภาพปัญหา</small>${item.images
        .map((img) => `<a href="${escapeHTML(img.imageUrl)}" target="_blank" rel="noopener"><img class="detail-image" src="${escapeHTML(img.imageUrl)}" alt="รูปภาพปัญหา"></a>`)
        .join("")}</div>`
    : "";

  const history = item.history
    .map(
      (h) => `<div class="history-item">
        <div><strong>${escapeHTML(STATUS[h.status]?.label ?? h.status)}</strong>
        ${h.note ? `<p class="history-note">${escapeHTML(h.note)}</p>` : ""}</div>
        <span>${escapeHTML(h.changedByName ?? "-")}<br>${formatDateTime(h.changedAt)}</span>
      </div>`,
    )
    .join("");

  $("#detail-content").innerHTML = `
    <div class="detail-grid">
      ${field("รหัสรายการ", escapeHTML(item.code))}
      ${field("วันที่แจ้ง", formatDateTime(item.createdAt))}
      ${field("หัวข้อปัญหา", escapeHTML(item.title), true)}
      ${field("ประเภทงาน", escapeHTML(item.category))}
      <div class="detail-field"><small>สถานะ / ความเร่งด่วน</small><div class="detail-status">${statusBadge(item.status)} ${priorityBadge(item.priority)}</div></div>
      ${field("อาคาร", escapeHTML(item.building))}
      ${field("ห้อง / ตำแหน่ง", escapeHTML(item.room))}
      ${field("ชื่อผู้แจ้ง", escapeHTML(item.reporterName))}
      ${field("เบอร์ติดต่อ", escapeHTML(item.reporterPhone || "-"))}
      ${field("ช่างผู้รับผิดชอบ", technician, true)}
      ${field("รายละเอียด", escapeHTML(item.description), true)}
      ${images}
      <div class="detail-field wide"><small>ประวัติสถานะ</small><div class="history-list">${history}</div></div>
    </div>`;

  $("#detail-actions").innerHTML = actionPanelHTML(item);
  $("#delete-detail-btn").classList.toggle("hidden", !isRole("ADMIN"));
}

/** ส่วนควบคุมด้านล่างของหน้าต่าง — แต่ละบทบาททำได้ไม่เหมือนกัน */
function actionPanelHTML(item) {
  const closed = CLOSED.includes(item.status);

  if (isRole("ADMIN")) {
    // ช่างที่ถนัดงานประเภทนี้ขึ้นก่อน แล้วเรียงตามงานค้างน้อยสุด
    const technicians = [...state.technicians].sort(
      (a, b) =>
        b.categoryIds.includes(item.categoryId) - a.categoryIds.includes(item.categoryId) || a.activeJobs - b.activeJobs,
    );
    const techOptions = technicians
      .map((t) => {
        const match = t.categoryIds.includes(item.categoryId) ? "★ " : "";
        const busy = t.isAvailable ? `งานค้าง ${t.activeJobs}` : "ไม่ว่าง";
        const selected = t.id === item.technicianId ? "selected" : "";
        const disabled = !t.isAvailable && t.id !== item.technicianId ? "disabled" : "";
        return `<option value="${t.id}" ${selected} ${disabled}>${match}${escapeHTML(t.fullName)} — ${escapeHTML(t.skills)} (${busy})</option>`;
      })
      .join("");
    const statusOptions = Object.entries(STATUS)
      .map(([code, s]) => `<option value="${code}" ${code === item.status ? "selected" : ""}>${s.label}</option>`)
      .join("");

    return `<div class="action-panel">
      <h3>มอบหมายช่าง</h3>
      <div class="action-row">
        <select id="assign-select" ${closed ? "disabled" : ""}><option value="">— ยังไม่มอบหมาย —</option>${techOptions}</select>
        <button class="primary-btn" id="assign-btn" ${closed ? "disabled" : ""}>บันทึกช่าง</button>
      </div>
      <small class="field-help">★ = ถนัดงาน "${escapeHTML(item.category)}" · มอบหมายแล้วสถานะจะเปลี่ยนเป็น "รับเรื่องแล้ว" ให้อัตโนมัติ</small>
      <h3>เปลี่ยนสถานะ</h3>
      <div class="action-row">
        <select id="status-select">${statusOptions}</select>
        <input id="status-note" maxlength="500" placeholder="หมายเหตุ (ถ้ามี)">
        <button class="primary-btn" id="status-btn">บันทึกสถานะ</button>
      </div>
    </div>`;
  }

  if (isRole("TECHNICIAN")) {
    const next = TECH_NEXT[item.status];
    if (!next) return `<div class="action-panel"><p class="muted">งานนี้ปิดแล้ว ไม่ต้องดำเนินการเพิ่ม</p></div>`;
    return `<div class="action-panel">
      <h3>อัปเดตงานซ่อม</h3>
      <textarea id="status-note" rows="2" maxlength="500" placeholder="${next.status === "DONE" ? "สรุปสิ่งที่ซ่อม เช่น เปลี่ยนหลอดไฟใหม่ 2 หลอด" : "หมายเหตุ เช่น เข้าตรวจสอบหน้างานแล้ว"}"></textarea>
      <div class="action-row end"><button class="primary-btn" id="tech-next-btn" data-status="${next.status}">${next.label}</button></div>
    </div>`;
  }

  // USER
  if (item.status === "PENDING") {
    return `<div class="action-panel">
      <p class="muted">ยังไม่มีเจ้าหน้าที่รับเรื่อง — ถ้าแจ้งผิดหรือปัญหาหายแล้ว ยกเลิกคำร้องได้</p>
      <div class="action-row end"><button class="outline-btn danger-btn" id="user-cancel-btn">ยกเลิกคำร้อง</button></div>
    </div>`;
  }
  return "";
}

/** หลังเปลี่ยนแปลงอะไร: แสดงรายละเอียดใหม่ + โหลดหน้าที่เปิดอยู่ใหม่ */
async function afterChange(updated, message) {
  state.selected = updated;
  if (isRole("ADMIN")) state.technicians = await api("/technicians");
  renderDetails(updated);
  showToast(message);
  await refreshCurrentView();
}

async function changeStatus(id, status, note) {
  const updated = await api(`/requests/${id}/status`, { method: "PATCH", body: { status, note } });
  return updated;
}

async function handleDetailAction(target) {
  const item = state.selected;
  if (!item) return;
  try {
    if (target.id === "assign-btn") {
      const value = $("#assign-select").value;
      const updated = await api(`/requests/${item.id}/assign`, {
        method: "PATCH",
        body: { technicianId: value ? Number(value) : null },
      });
      await afterChange(updated, value ? `มอบหมายงานให้ ${updated.technicianName} แล้ว` : "ถอนช่างออกจากงานแล้ว");
    }
    if (target.id === "status-btn") {
      const updated = await changeStatus(item.id, $("#status-select").value, $("#status-note").value);
      await afterChange(updated, "อัปเดตสถานะเรียบร้อยแล้ว");
    }
    if (target.id === "tech-next-btn") {
      const updated = await changeStatus(item.id, target.dataset.status, $("#status-note").value);
      await afterChange(updated, `อัปเดตเป็น "${STATUS[updated.status].label}" แล้ว`);
    }
    if (target.id === "user-cancel-btn") {
      if (!confirm(`ต้องการยกเลิกคำร้อง ${item.code} ใช่หรือไม่?`)) return;
      const updated = await changeStatus(item.id, "CANCELLED", "ผู้แจ้งยกเลิกคำร้อง");
      await afterChange(updated, "ยกเลิกคำร้องแล้ว");
    }
  } catch (err) {
    showToast(err.message, true);
  }
}

async function deleteSelected() {
  const item = state.selected;
  if (!item || !confirm(`ต้องการลบรายการ ${item.code} ใช่หรือไม่? (ลบแล้วกู้คืนไม่ได้)`)) return;
  try {
    await api(`/requests/${item.id}`, { method: "DELETE" });
    $("#detail-dialog").close();
    showToast("ลบรายการแจ้งซ่อมแล้ว");
    await refreshCurrentView();
  } catch (err) {
    showToast(err.message, true);
  }
}

/** ปุ่ม "เริ่มซ่อม / แจ้งซ่อมเสร็จ" บนการ์ดงาน */
async function quickJobAction(id, status) {
  const job = state.jobs.find((j) => j.id === id);
  const label = STATUS[status].label;
  if (!confirm(`เปลี่ยน ${job.code} เป็น "${label}" ใช่หรือไม่?`)) return;
  try {
    await changeStatus(id, status);
    showToast(`อัปเดต ${job.code} เป็น "${label}" แล้ว`);
    await renderJobs();
  } catch (err) {
    showToast(err.message, true);
  }
}

/* ======================= ฟอร์มแจ้งซ่อม ======================= */
function prepareRepairForm() {
  const reporter = $("#form-reporter");
  const phone = $("#form-phone");
  // ผู้ใช้ทั่วไปแจ้งในนามตัวเองเท่านั้น (backend ใช้ชื่อจากบัญชีเสมอ)
  if (isRole("USER")) {
    reporter.value = state.user.fullName;
    reporter.readOnly = true;
    if (!phone.value) phone.value = state.user.phone ?? "";
  } else {
    reporter.readOnly = false;
  }
  $("#form-error").classList.add("hidden");
}

function clearImage() {
  state.pendingImage = null;
  $("#repair-image").value = "";
  $("#image-preview").classList.add("hidden");
  $("#image-preview").removeAttribute("src");
}

async function submitRepairForm(form) {
  const data = new FormData(form);
  if (state.pendingImage) data.append("image", state.pendingImage, "photo.jpg");

  const button = $("#repair-submit");
  button.disabled = true;
  $("#form-error").classList.add("hidden");
  try {
    const created = await api("/requests", { method: "POST", form: data });
    form.reset();
    clearImage();
    showToast(`ส่งรายการ ${created.code} เรียบร้อยแล้ว`);
    await showView("requests");
  } catch (err) {
    $("#form-error").textContent = err.message;
    $("#form-error").classList.remove("hidden");
  } finally {
    button.disabled = false;
  }
}

/** ย่อรูปให้ด้านยาวสุดไม่เกิน 1200px แล้วบีบอัดเป็น JPEG ก่อนอัปโหลด */
function handleImageSelected(input) {
  const file = input.files?.[0];
  state.pendingImage = null;
  if (!file) return clearImage();
  if (!file.type.startsWith("image/")) {
    showToast("กรุณาเลือกไฟล์รูปภาพ", true);
    return clearImage();
  }
  if (file.size > 12 * 1024 * 1024) {
    showToast("รูปภาพมีขนาดใหญ่เกิน 12 MB", true);
    return clearImage();
  }

  const url = URL.createObjectURL(file);
  const source = new Image();
  source.onload = () => {
    const scale = Math.min(1, 1200 / Math.max(source.width, source.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(source.width * scale));
    canvas.height = Math.max(1, Math.round(source.height * scale));
    canvas.getContext("2d").drawImage(source, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url);
    canvas.toBlob(
      (blob) => {
        state.pendingImage = blob;
        $("#image-preview").src = URL.createObjectURL(blob);
        $("#image-preview").classList.remove("hidden");
      },
      "image/jpeg",
      0.8,
    );
  };
  source.onerror = () => {
    URL.revokeObjectURL(url);
    showToast("ไม่สามารถอ่านรูปภาพนี้ได้", true);
    clearImage();
  };
  source.src = url;
}

/* ======================= ผูก event ======================= */
$("#login-form").addEventListener("submit", (event) => {
  event.preventDefault();
  login($("#login-username").value.trim(), $("#login-password").value);
});
$("#register-form").addEventListener("submit", (event) => {
  event.preventDefault();
  register(event.currentTarget);
});
$$("[data-auth-switch]").forEach((button) => button.addEventListener("click", () => showAuthForm(button.dataset.authSwitch)));
$("#logout-btn").addEventListener("click", () => logout());

$$(".nav-link").forEach((button) => button.addEventListener("click", () => showView(button.dataset.view)));
["#top-new-btn", "#welcome-new-btn", "#list-new-btn"].forEach((s) => $(s).addEventListener("click", () => showView("new-request")));
$("#welcome-jobs-btn").addEventListener("click", () => showView("my-jobs"));
["#view-all-btn", "#recent-view-btn"].forEach((s) =>
  $(s).addEventListener("click", () => showView(isRole("TECHNICIAN") ? "my-jobs" : "requests")),
);

$("#search-input").addEventListener("input", debounce(refreshCurrentView, 300));
$("#status-filter").addEventListener("change", refreshCurrentView);
$("#category-filter").addEventListener("change", refreshCurrentView);

$("#jobs-tabs").addEventListener("click", (event) => {
  const tab = event.target.closest("[data-jobs-filter]");
  if (!tab) return;
  state.jobsFilter = tab.dataset.jobsFilter;
  $$("#jobs-tabs button").forEach((b) => b.classList.toggle("active", b === tab));
  renderJobs().catch((err) => showToast(err.message, true));
});

// ปุ่มที่สร้างจาก JavaScript (ในตาราง/การ์ด) ใช้ event delegation
document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const id = Number(button.dataset.id);
  if (button.dataset.action === "detail") openDetails(id);
  if (button.dataset.action === "job-next") quickJobAction(id, button.dataset.status);
  if (button.dataset.action === "toggle-tech") toggleTechnician(id);
});

$("#detail-actions").addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (button) handleDetailAction(button);
});
$("#close-dialog").addEventListener("click", () => $("#detail-dialog").close());
$("#close-detail-btn").addEventListener("click", () => $("#detail-dialog").close());
$("#delete-detail-btn").addEventListener("click", deleteSelected);

$("#repair-form").addEventListener("submit", (event) => {
  event.preventDefault();
  submitRepairForm(event.currentTarget);
});
$("#repair-form").addEventListener("reset", () => {
  clearImage();
  setTimeout(prepareRepairForm); // reset ล้างชื่อผู้แจ้งทิ้ง → เติมกลับสำหรับผู้ใช้ทั่วไป
});
$("#repair-image").addEventListener("change", (event) => handleImageSelected(event.target));

$("#add-tech-btn").addEventListener("click", () => {
  $("#tech-form").classList.remove("hidden");
  $("#tech-form [name='fullName']").focus();
});
$("#tech-cancel-btn").addEventListener("click", () => {
  $("#tech-form").reset();
  $("#tech-form").classList.add("hidden");
});
$("#tech-form").addEventListener("submit", (event) => {
  event.preventDefault();
  submitTechnicianForm(event.currentTarget);
});

/* ======================= เริ่มทำงาน ======================= */
$("#today-label").textContent = new Date().toLocaleDateString("th-TH", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
restoreSession();
