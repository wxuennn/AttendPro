const STORAGE_KEY = "attendpro-state-v2";
const COMPANY_KEY_STORAGE = "attendpro-company-key";
const DATASET_PASSWORD_STORAGE = "attendpro-dataset-password";
const TAB_ID = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const channel = "BroadcastChannel" in window ? new BroadcastChannel("attendpro-sync") : null;
let companyKey = cleanDatasetKey(new URLSearchParams(location.search).get("company") || localStorage.getItem(COMPANY_KEY_STORAGE) || "default");
let datasetPassword = localStorage.getItem(`${DATASET_PASSWORD_STORAGE}-${companyKey}`) || "";

const seedState = {
  company: {
    name: "AttendPro",
    officeName: "Company Office",
    lateAfter: "09:00",
    codeSecret: "OFFICE",
    codeInterval: 30,
    officeLatitude: 3.139,
    officeLongitude: 101.6869,
    officeRadius: 300,
    workingDays: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
  },
  datasetPassword: "",
  admins: [],
  employees: [],
  attendance: [],
  leaves: [],
  auditLogs: [],
  deletedAttendanceIds: [],
  deletedAdminIds: []
};

let state = loadLocalState();
let session = null;
let loginRole = "employee";
let view = "dashboard";
let serverReady = false;
let lastStateText = JSON.stringify(state);
let pendingQr = new URLSearchParams(location.search).get("qrCheckIn");
let selectedCalendarEmployee = "";
let attendanceBusy = false;
const searchTerms = {};

const app = document.querySelector("#app");

function firebaseConfig() {
  return window.ATTENDPRO_FIREBASE || null;
}

function usingFirebase() {
  const config = firebaseConfig();
  return Boolean(config && config.databaseURL && config.enabled !== false);
}

function firebaseStateUrl() {
  const base = firebaseConfig().databaseURL.replace(/\/$/, "");
  return `${base}/datasets/${encodeURIComponent(companyKey)}.json`;
}

function apiUrl() {
  return `./api/state?company=${encodeURIComponent(companyKey)}`;
}

function apiHeaders(extra = {}) {
  return {
    "X-Dataset-Password": datasetPassword,
    ...extra
  };
}

function setCompanyKey(value) {
  companyKey = cleanDatasetKey(value);
  localStorage.setItem(COMPANY_KEY_STORAGE, companyKey);
  datasetPassword = localStorage.getItem(`${DATASET_PASSWORD_STORAGE}-${companyKey}`) || "";
}

function cleanDatasetKey(value) {
  return (value || "default").trim().replace(/[^A-Za-z0-9_-]/g, "") || "default";
}

function setDatasetPassword(value) {
  datasetPassword = value;
  localStorage.setItem(`${DATASET_PASSWORD_STORAGE}-${companyKey}`, value);
}

function loadLocalState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  try {
    return normalize(raw ? JSON.parse(raw) : seedState);
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return normalize(seedState);
  }
}

function normalize(input) {
  input = input || {};
  const legacyPolicy = input.attendancePolicy || {};
  return {
    ...structuredClone(seedState),
    ...input,
    company: {
      ...seedState.company,
      ...(input.company || {}),
      officeName: (input.company || {}).officeName || legacyPolicy.officeName || seedState.company.officeName,
      officeLatitude: Number((input.company || {}).officeLatitude ?? legacyPolicy.latitude ?? seedState.company.officeLatitude),
      officeLongitude: Number((input.company || {}).officeLongitude ?? legacyPolicy.longitude ?? seedState.company.officeLongitude),
      officeRadius: Number((input.company || {}).officeRadius ?? legacyPolicy.radiusMeters ?? seedState.company.officeRadius),
      lateAfter: (input.company || {}).lateAfter || legacyPolicy.lateAfter || seedState.company.lateAfter,
      codeSecret: (input.company || {}).codeSecret || legacyPolicy.onsiteSecret || seedState.company.codeSecret,
      codeInterval: Number((input.company || {}).codeInterval ?? legacyPolicy.codeIntervalSeconds ?? seedState.company.codeInterval)
    },
    datasetPassword: input.datasetPassword || seedState.datasetPassword,
    admins: input.admins || seedState.admins,
    employees: (input.employees || seedState.employees).map((emp) => ({ ...emp, employmentDate: emp.employmentDate || "" })),
    attendance: input.attendance || [],
    leaves: input.leaves || [],
    auditLogs: input.auditLogs || [],
    deletedAttendanceIds: input.deletedAttendanceIds || [],
    deletedAdminIds: input.deletedAdminIds || []
  };
}

function setState(next) {
  state = normalize(next);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  lastStateText = JSON.stringify(state);
}

async function loadServerState() {
  if (!datasetPassword) return { ok: false, status: 0 };
  if (usingFirebase()) return loadFirebaseState();
  if (location.protocol === "file:") return { ok: false, status: 0 };
  try {
    const response = await fetch(apiUrl(), { cache: "no-store", headers: apiHeaders() });
    if (response.ok) {
      setState(await response.json());
      serverReady = true;
      render();
      return { ok: true, status: response.status };
    }
    serverReady = false;
    return { ok: false, status: response.status };
  } catch {
    serverReady = false;
    return { ok: false, status: 0 };
  }
}

async function pushServerState(previousState = null) {
  if (usingFirebase()) return pushFirebaseState(previousState);
  if (location.protocol === "file:") return;
  await fetch(apiUrl(), {
    method: "POST",
    headers: apiHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(state)
  });
  lastStateText = JSON.stringify(state);
}

async function loadFirebaseState() {
  try {
    const response = await fetch(firebaseStateUrl(), { cache: "no-store" });
    if (!response.ok) {
      serverReady = false;
      return { ok: false, status: response.status };
    }
    const next = await response.json();
    if (!next) {
      serverReady = false;
      return { ok: false, status: 404 };
    }
    if (!next.datasetPassword || next.datasetPassword !== datasetPassword) {
      serverReady = false;
      return { ok: false, status: 403 };
    }
    setState(next);
    serverReady = true;
    render();
    return { ok: true, status: 200 };
  } catch {
    serverReady = false;
    return { ok: false, status: 0 };
  }
}

async function pushFirebaseState(previousState = null) {
  const merged = await mergeWithRemoteState(state, previousState);
  if (merged) {
    state = merged;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }
  const response = await fetch(firebaseStateUrl(), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(state)
  });
  if (!response.ok) throw new Error("Firebase sync failed.");
  lastStateText = JSON.stringify(state);
}

async function mergeWithRemoteState(local, previousState = null) {
  try {
    const response = await fetch(firebaseStateUrl(), { cache: "no-store" });
    if (!response.ok) return null;
    const remoteRaw = await response.json();
    if (!remoteRaw || remoteRaw.datasetPassword !== datasetPassword) return null;
    const remote = normalize(remoteRaw);
    const previous = previousState ? normalize(previousState) : normalize(seedState);
    const deletedAttendanceIds = uniqueValues([...remote.deletedAttendanceIds, ...local.deletedAttendanceIds]);
    const deletedAdminIds = uniqueValues([...remote.deletedAdminIds, ...local.deletedAdminIds]);
    return normalize({
      ...remote,
      company: objectChanged(local.company, previous.company) ? local.company : remote.company,
      datasetPassword: local.datasetPassword,
      admins: mergeChangedById(remote.admins, local.admins, previous.admins).filter((admin) => !deletedAdminIds.includes(admin.id)),
      employees: mergeChangedById(remote.employees, local.employees, previous.employees),
      attendance: mergeChangedById(remote.attendance, local.attendance, previous.attendance).filter((record) => !deletedAttendanceIds.includes(record.id)),
      leaves: mergeChangedById(remote.leaves, local.leaves, previous.leaves),
      auditLogs: sortAuditLogs(mergeChangedById(remote.auditLogs, local.auditLogs, previous.auditLogs)).slice(0, 80),
      deletedAttendanceIds,
      deletedAdminIds
    });
  } catch {
    return null;
  }
}

function mergeChangedById(remoteItems = [], localItems = [], previousItems = []) {
  const map = new Map(remoteItems.filter((item) => item && item.id).map((item) => [item.id, item]));
  const previousMap = new Map(previousItems.filter((item) => item && item.id).map((item) => [item.id, item]));
  localItems.forEach((item) => {
    if (!item || !item.id) return;
    const previous = previousMap.get(item.id);
    if (!previous || objectChanged(item, previous)) map.set(item.id, item);
  });
  return Array.from(map.values());
}

function objectChanged(a, b) {
  return JSON.stringify(a || null) !== JSON.stringify(b || null);
}

function uniqueValues(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function sortAuditLogs(logs) {
  return logs.slice().sort((a, b) => String(b.id || "").localeCompare(String(a.id || "")));
}

function saveState(message) {
  const previousState = parseStateText(lastStateText);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  if (channel) channel.postMessage({ source: TAB_ID, state, message });
  pushServerState(previousState).catch(() => {});
  lastStateText = JSON.stringify(state);
}

function parseStateText(text) {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

function startSync() {
  if (channel) {
    channel.addEventListener("message", (event) => {
      if (!event.data || event.data.source === TAB_ID) return;
      setState(event.data.state);
      if (session) {
        render();
        toast(event.data.message || "Live data updated.");
      }
    });
  }

  setInterval(async () => {
    const qrDisplay = isQrDisplayMode();
    if ((!usingFirebase() && location.protocol === "file:") || document.hidden || (!session && !qrDisplay) || !datasetPassword) return;
    try {
      let next;
      if (usingFirebase()) {
        const response = await fetch(firebaseStateUrl(), { cache: "no-store" });
        if (!response.ok) return;
        next = normalize(await response.json());
        if (!next.datasetPassword || next.datasetPassword !== datasetPassword) return;
      } else {
        const response = await fetch(apiUrl(), { cache: "no-store", headers: apiHeaders() });
        if (!response.ok) return;
        next = normalize(await response.json());
      }
      const text = JSON.stringify(next);
      if (text !== lastStateText) {
        setState(next);
        if (session || qrDisplay) render();
      }
    } catch {}
  }, 2000);
}

function isQrDisplayMode() {
  return new URLSearchParams(location.search).get("display") === "qr";
}

function today() {
  return localDateKey(new Date());
}

function localDateKey(value) {
  const date = value instanceof Date ? value : new Date(`${value}T00:00:00`);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function nowTime() {
  return new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function formatDate(value) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function minutes(value) {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
}

function duration(start, end) {
  const total = Math.max(0, minutes(end) - minutes(start));
  return `${Math.floor(total / 60)}h ${total % 60}m`;
}

function parseDurationMinutes(value) {
  const match = String(value || "").match(/(\d+)h\s+(\d+)m/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : 0;
}

function formatMinutes(total) {
  return `${Math.floor(total / 60)}h ${total % 60}m`;
}

function distanceMeters(a, b) {
  const radius = 6371000;
  const toRad = (value) => value * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return Math.round(radius * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)));
}

function officePoint() {
  return {
    lat: Number(state.company.officeLatitude),
    lng: Number(state.company.officeLongitude),
    radius: Number(state.company.officeRadius)
  };
}

function officeLocationReady() {
  const office = officePoint();
  return Number.isFinite(office.lat) && Number.isFinite(office.lng) && Number.isFinite(office.radius) && office.radius > 0;
}

function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Location is not supported on this device."));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 8000,
      maximumAge: 15000
    });
  });
}

async function verifyOfficeLocation(method) {
  if (!officeLocationReady()) throw new Error("Office location is not configured. Ask admin to set it in Company Settings.");
  if (!window.isSecureContext && !["localhost", "127.0.0.1"].includes(location.hostname)) {
    throw new Error("Location check needs HTTPS. Use the trycloudflare link on phone.");
  }
  const position = await getCurrentPosition();
  const current = { lat: position.coords.latitude, lng: position.coords.longitude };
  const office = officePoint();
  const distance = distanceMeters(current, office);
  if (distance > office.radius) {
    throw new Error(`Too far from office: ${distance}m away. Allowed radius is ${office.radius}m.`);
  }
  return `${method} + GPS verified (${distance}m)`;
}

function employee(id) {
  return state.employees.find((item) => item.id === id);
}

function sessionAccount() {
  if (!session) return null;
  return session.role === "admin"
    ? state.admins.find((admin) => admin.id === session.id)
    : employee(session.id);
}

function currentOpenRecord(id = session?.id) {
  return state.attendance.find((item) => item.employeeId === id && item.date === today() && isOpenAttendanceRecord(item));
}

function todaysRecords(id = session?.id) {
  return state.attendance.filter((item) => item.employeeId === id && item.date === today());
}

function isOpenAttendanceRecord(record) {
  return Boolean(record.checkIn && !record.checkOut && ["Checked In", "Late", "Off-day Work"].includes(record.status));
}

function isActiveEmployee(id = session?.id) {
  const emp = employee(id);
  return !emp || emp.status !== "Inactive";
}

function isWorkingDay(dateValue) {
  const day = new Date(`${dateValue}T00:00:00`).toLocaleDateString("en-GB", { weekday: "long" });
  return (state.company.workingDays || seedState.company.workingDays).includes(day);
}

function requestsForDate(employeeId, dateValue) {
  return state.leaves.filter((request) => request.employeeId === employeeId && request.from <= dateValue && request.to >= dateValue);
}

function requestsOverlap(aFrom, aTo, bFrom, bTo) {
  return aFrom <= bTo && bFrom <= aTo;
}

function approvedRequestForDate(employeeId, dateValue) {
  return requestsForDate(employeeId, dateValue).find((request) => request.status === "Approved");
}

function requestDurationLabel(request) {
  return request.duration || "Full Day";
}

function requestCalendarLabel(request) {
  const duration = requestDurationLabel(request);
  return duration === "Full Day" ? request.type : `${request.type} (${duration})`;
}

function attendanceForDate(employeeId, dateValue) {
  return state.attendance.filter((item) => item.employeeId === employeeId && item.date === dateValue);
}

function employmentDate(employeeId) {
  return employee(employeeId)?.employmentDate || "";
}

function calendarStatus(employeeId, dateValue) {
  const startDate = employmentDate(employeeId);
  if (startDate && dateValue < startDate) return { label: "", type: "empty" };
  const records = attendanceForDate(employeeId, dateValue);
  if (records.length) {
    if (records.some((record) => record.status === "Public Holiday")) return { label: "Public Holiday", type: "holiday" };
    if (records.some((record) => record.status === "Absent")) return { label: "Absent", type: "absent" };
    if (records.some((record) => record.status === "Late")) return { label: "Late", type: "late" };
    if (records.some((record) => record.status === "Checked In")) return { label: "Checked In", type: "active" };
    if (records.some((record) => record.status === "Off-day Work")) return { label: "Off-day Work", type: "offwork" };
    return { label: "Present", type: "present" };
  }
  if (dateValue > today()) return { label: "", type: "empty" };
  const approved = approvedRequestForDate(employeeId, dateValue);
  const pending = requestsForDate(employeeId, dateValue).find((request) => request.status === "Pending");
  const rejected = requestsForDate(employeeId, dateValue).find((request) => request.status === "Rejected");
  if (approved) return { label: requestCalendarLabel(approved), type: approved.type.includes("WFH") ? "wfh" : "approved" };
  if (pending) return { label: `Pending ${requestCalendarLabel(pending)}`, type: "pending" };
  if (rejected) return { label: `Rejected ${requestCalendarLabel(rejected)}`, type: "rejected" };
  if (isWorkingDay(dateValue) && dateValue < today()) return { label: "Absent", type: "absent" };
  return { label: "Off Day", type: "off" };
}

function displayVerification(value) {
  const text = String(value || "-");
  if (text.includes("Manual rotating code")) return "Code";
  if (text.includes("Rotating QR code")) return "QR";
  if (text.includes("Admin manual update")) return "Admin Update";
  return text.replace(/\s*\+\s*GPS verified.*$/i, "");
}

function badgeClass(status) {
  return `badge status-${safeName(status)}`;
}

function monthDates(value = new Date()) {
  const year = value.getFullYear();
  const month = value.getMonth();
  const days = new Date(year, month + 1, 0).getDate();
  return Array.from({ length: days }, (_, index) => {
    const day = index + 1;
    return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  });
}

function dateRange(from, to) {
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  const dates = [];
  for (let cursor = start; cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    dates.push(localDateKey(cursor));
  }
  return dates;
}

function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function downloadCSV(filename, headers, rows) {
  const csv = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
  toast(`${filename} generated.`);
}

function downloadHTML(filename, html) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
  toast(`${filename} generated.`);
}

function safeName(value) {
  return String(value || "report").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "report";
}

function readableDatasetName(value) {
  return String(value || "Company")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim() || "Company";
}

function createDatasetState(adminEmail, adminPassword) {
  const adminName = adminEmail.split("@")[0].replace(/[._-]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
  const next = normalize({
    ...structuredClone(seedState),
    datasetPassword,
    company: {
      ...seedState.company,
      name: readableDatasetName(companyKey),
      officeName: "Company Office"
    },
    admins: [{ id: "ADM001", name: adminName || "Admin", email: adminEmail, password: adminPassword }],
    employees: [],
    attendance: [],
    leaves: [],
    auditLogs: []
  });
  return next;
}

function companyReportName() {
  const cleaned = String(state.company.name || "Company")
    .replace(/\bdemo\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || "Company";
}

function exportBase(scope, label) {
  const companyName = companyReportName();
  if (scope === "mine") return `${companyName}-${session.name}-${label}-${today()}`;
  return `${companyName}-${label}-${today()}`;
}

function monthLabel() {
  return new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

function searchBox(key, placeholder = "Search") {
  return `<label class="search-field"><span>Search</span><input data-search-key="${key}" value="${escapeHtml(searchTerms[key] || "")}" placeholder="${placeholder}"></label>`;
}

function includesSearch(values, key) {
  const query = (searchTerms[key] || "").trim().toLowerCase();
  if (!query) return true;
  return values.some((value) => String(value ?? "").toLowerCase().includes(query));
}

function renderAndFocusSearch(key) {
  render();
  const input = document.querySelector(`[data-search-key="${key}"]`);
  if (input) {
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }
}

function hash(text) {
  let value = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

function slot(offset = 0) {
  return Math.floor(Date.now() / ((state.company.codeInterval || 30) * 1000)) + offset;
}

function currentCode(offset = 0) {
  return String(hash(`${state.company.codeSecret}-${today()}-${slot(offset)}`) % 1000000).padStart(6, "0");
}

function currentQr(offset = 0) {
  return hash(`QR-${state.company.codeSecret}-${today()}-${slot(offset)}`).toString(36).toUpperCase();
}

function validQr(token) {
  return [currentQr(), currentQr(-1)].includes(String(token || "").toUpperCase());
}

function secondsLeft() {
  const interval = state.company.codeInterval || 30;
  return interval - (Math.floor(Date.now() / 1000) % interval);
}

function qrUrl() {
  const url = new URL(location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("qrCheckIn", currentQr());
  return url.toString();
}

function drawQr() {
  const box = document.querySelector("#qrBox");
  if (!box) return;
  if (typeof QRCode === "undefined") {
    box.innerHTML = `<div class="qr-error">QR library failed to load. Refresh the page.</div>`;
    return;
  }
  const text = qrUrl();
  if (box.dataset.text === text) return;
  box.dataset.text = text;
  box.innerHTML = "";
  try {
    new QRCode(box, {
      text,
      width: 360,
      height: 360,
      colorDark: "#000000",
      colorLight: "#ffffff",
      correctLevel: QRCode.CorrectLevel.M
    });
  } catch (error) {
    box.innerHTML = `<div class="qr-error">QR generation failed. Use the link below.</div>`;
  }
}

function addAudit(action, details) {
  state.auditLogs.unshift({
    id: `AUD${Date.now()}`,
    at: new Date().toLocaleString("en-GB", { hour12: false }),
    actor: session ? `${session.name} (${session.role})` : "System",
    action,
    details
  });
  state.auditLogs = state.auditLogs.slice(0, 80);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function passwordField(id, label, value = "", placeholder = "", autocomplete = "current-password", extra = "") {
  return `<label class="field password-field"><span>${label}</span><div class="password-control"><input id="${id}" type="password" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}" autocomplete="${autocomplete}" ${extra} required><button class="password-toggle" type="button" data-toggle-password="${id}" aria-label="Show or hide password"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"></path><circle cx="12" cy="12" r="2.8"></circle></svg></button></div></label>`;
}

function render() {
  if (isQrDisplayMode()) {
    renderQrDisplay();
    return;
  }
  if (session && !sessionAccount()) {
    session = null;
  }
  if (!session) return renderLogin();
  renderApp();
}

function renderLogin() {
  if (pendingQr) loginRole = "employee";
  app.innerHTML = `
    <main class="login-screen">
      <section class="login-hero">
        <div class="brand-lockup"><span class="brand-mark">AP</span><span>AttendPro</span></div>
        <div>
          <h1>Employee Attendance System</h1>
          <p>Live attendance, rotating QR check-in, leave workflow, employee records, and admin dashboard.</p>
        </div>
      </section>
      <form class="login-panel" id="loginForm" autocomplete="on">
        <h2>Sign in</h2>
        <div class="segmented">
          <button type="button" data-role="employee" class="${loginRole === "employee" ? "active" : ""}">Employee</button>
          <button type="button" data-role="admin" class="${loginRole === "admin" ? "active" : ""}">Admin</button>
        </div>
        <label class="field"><span>Company Dataset</span><input id="companyKey" value="${escapeHtml(companyKey)}" placeholder="company-name" autocomplete="organization" required></label>
        ${passwordField("datasetPassword", "Dataset Password", datasetPassword, "Company dataset password", "off", 'data-lpignore="true" data-1p-ignore="true"')}
        <p class="helper">Use the same dataset name and dataset password on every company device. A new Admin login creates a new empty dataset automatically.</p>
        <label class="field"><span>Email</span><input id="email" type="email" required placeholder="Email" autocomplete="username"></label>
        ${passwordField("password", "Password", "", "Password", "current-password")}
        <button class="btn primary" type="submit">Login</button>
        <p class="helper">${pendingQr ? "Login as employee to complete QR check-in." : "Use your assigned company account."}</p>
        <div class="toast inline" id="loginMessage"></div>
      </form>
    </main>
  `;

  document.querySelectorAll("[data-role]").forEach((button) => {
    button.addEventListener("click", () => {
      loginRole = button.dataset.role;
      renderLogin();
    });
  });
  bindPasswordToggles();
  document.querySelector("#loginForm").addEventListener("submit", login);
}

async function login(event) {
  event.preventDefault();
  const selectedCompany = cleanDatasetKey(document.querySelector("#companyKey").value);
  const selectedDatasetPassword = document.querySelector("#datasetPassword").value;
  const email = document.querySelector("#email").value.trim().toLowerCase();
  const password = document.querySelector("#password").value;
  if (selectedCompany !== companyKey) {
    setCompanyKey(selectedCompany);
  }
  setDatasetPassword(selectedDatasetPassword);
  const loadResult = await loadServerState();
  if (!loadResult.ok) {
    if (loadResult.status === 404 && loginRole === "admin") {
      state = createDatasetState(email, password);
      setState(state);
      await pushServerState();
      serverReady = true;
      addAudit("Dataset created", `${state.admins[0].name} created company dataset ${companyKey}.`);
      saveState("Company dataset created.");
    } else {
      const message = getDatasetLoginError(loadResult.status);
      document.querySelector("#loginMessage").textContent = message;
      return;
    }
  }
  const source = loginRole === "admin" ? state.admins : state.employees;
  const account = source.find((item) => item.email.toLowerCase() === email && item.password === password);
  if (!account) {
    document.querySelector("#loginMessage").textContent = "Invalid login.";
    return;
  }
  session = { role: loginRole, id: account.id, name: account.name, email: account.email, status: account.status || "Active" };
  view = "dashboard";
  render();
  processQr();
}

function getDatasetLoginError(status) {
  if (status === 404) {
    return "Dataset not found. Login as admin with a new dataset name to create it.";
  }
  if (usingFirebase() && status === 401) {
    return "Firebase database permission denied. Please publish the Realtime Database read/write rules first.";
  }
  if (status === 0) {
    return "Cannot connect to the shared database. Check your internet connection and Firebase setup.";
  }
  return "Invalid dataset password.";
}

function renderApp() {
  const isAdmin = session.role === "admin";
  const inactiveEmployee = session.role === "employee" && !isActiveEmployee();
  const nav = isAdmin
    ? [["dashboard", "Dashboard"], ["employees", "Employees"], ["admins", "Admins"], ["records", "Attendance"], ["leaves", "Work Requests"], ["settings", "Settings"], ["audit", "Audit Log"], ["profile", "My Profile"]]
    : inactiveEmployee
      ? [["dashboard", "Dashboard"], ["history", "Attendance"]]
      : [["dashboard", "Dashboard"], ["history", "Attendance"], ["leave", "Work Request"], ["profile", "My Profile"]];

  app.innerHTML = `
    <div class="layout">
      <aside class="sidebar">
        <div class="brand-lockup"><span class="brand-mark">AP</span><span>${escapeHtml(state.company.name)}</span></div>
        <div class="user-card"><strong>${escapeHtml(session.name)}</strong><span>${session.role}</span></div>
        <nav>${nav.map(([key, label]) => `<button data-view="${key}" class="${view === key ? "active" : ""}">${label}</button>`).join("")}</nav>
      </aside>
      <main>
        <header class="topbar">
          <div><h1>${title()}</h1><p>${new Date().toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}</p></div>
          <div class="top-actions"><span class="sync-pill">${serverReady ? (usingFirebase() ? "Firebase Sync" : "Server Sync") : "Local Mode"}</span><button class="btn ghost" id="logout">Logout</button></div>
        </header>
        <section class="content">${renderView()}</section>
      </main>
    </div>
    <div class="modal-backdrop" id="modal"></div>
    <div class="toast" id="toast"></div>
  `;
  document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => {
    view = button.dataset.view;
    render();
  }));
  document.querySelector("#logout").addEventListener("click", () => {
    session = null;
    render();
  });
  bindEvents();
}

function title() {
  return {
    dashboard: "Dashboard",
    employees: "Manage Employees",
    admins: "Manage Admins",
    records: "Attendance Records",
    leaves: "Work Requests",
    settings: "Company Settings",
    audit: "Audit Log",
    history: "Attendance History",
    leave: "Work Request",
    profile: "My Profile"
  }[view] || "Dashboard";
}

function renderView() {
  if (session.role === "admin") {
    if (view === "employees") return renderEmployees();
    if (view === "admins") return renderAdmins();
    if (view === "records") return renderRecords(true);
    if (view === "leaves") return renderLeaveApproval();
    if (view === "settings") return renderSettings();
    if (view === "audit") return renderAudit();
    if (view === "profile") return renderProfile();
    return renderAdminDashboard();
  }
  if (view === "history") return renderRecords(false);
  if (view === "leave") return renderLeaveForm();
  if (view === "profile") return renderProfile();
  return renderEmployeeDashboard();
}

function renderEmployeeDashboard() {
  const emp = employee(session.id);
  const open = currentOpenRecord();
  const todayRecords = todaysRecords();
  const latestToday = todayRecords.at(-1);
  const inactive = emp.status === "Inactive";
  return `
    <div class="metrics">
      <div class="metric"><span>Department</span><strong>${escapeHtml(emp.department)}</strong></div>
      <div class="metric"><span>Today Sessions</span><strong>${todaysRecords().length}</strong></div>
      <div class="metric code-metric"><div class="metric-row"><span>Current Code</span><small class="metric-timer" id="countdown">${secondsLeft()}s</small></div><strong id="liveCode">${currentCode()}</strong></div>
    </div>
    ${inactive ? `<section class="panel notice danger">This account is inactive. You can view and export records only.</section>` : ""}
    <section class="panel">
      <div class="panel-head"><h2>Today Attendance</h2></div>
      <div class="clock-grid">
        <div><span>Now</span><strong id="clockNow">${nowTime()}</strong></div>
        <div><span>Check In</span><strong>${latestToday?.checkIn || "--:--"}</strong></div>
        <div><span>Check Out</span><strong>${latestToday?.checkOut || "--:--"}</strong></div>
        <div><span>Status</span><strong>${latestToday?.status || "Ready"}</strong></div>
      </div>
      <p class="helper">Scan the lobby QR or enter the rotating code. Both methods require office GPS range.</p>
      <div class="actions">
        <button class="btn primary" id="checkIn" ${todayRecords.length || inactive || attendanceBusy ? "disabled" : ""}>Check In by Code</button>
        <button class="btn" id="checkOut" ${!open || inactive || attendanceBusy ? "disabled" : ""}>Check Out</button>
      </div>
    </section>
    <section class="panel"><div class="panel-head"><h2>Monthly Calendar</h2><button class="btn" data-export-calendar="${session.id}">Export Report</button></div>${calendarForEmployee(session.id)}</section>
    <section class="panel"><div class="panel-head"><h2>Recent Attendance</h2><button class="btn" data-export-attendance="mine">Export CSV</button></div>${attendanceTable(state.attendance.filter((r) => r.employeeId === session.id).slice(-5).reverse(), false)}</section>
  `;
}

function renderAdminDashboard() {
  const pending = state.leaves.filter((leave) => leave.status === "Pending").length;
  return `
    <div class="metrics">
      <div class="metric"><span>Employees</span><strong>${state.employees.length}</strong></div>
      <div class="metric"><span>Today Attendance</span><strong>${state.attendance.filter((r) => r.date === today()).length}</strong></div>
      <div class="metric"><span>Pending Requests</span><strong>${pending}</strong></div>
    </div>
    <section class="panel">
      <div class="panel-head"><div><h2>QR Check-In Display</h2><p>Open this on a lobby monitor. QR refreshes every ${state.company.codeInterval}s.</p></div><button class="btn primary" id="openQr">Open QR Display</button></div>
      <div class="metrics compact"><div class="metric"><span>Manual Code</span><strong id="liveCode">${currentCode()}</strong></div><div class="metric"><span>Refresh In</span><strong id="countdown">${secondsLeft()}s</strong></div><div class="metric"><span>Late After</span><strong>${state.company.lateAfter}</strong></div></div>
    </section>
    <section class="panel"><div class="panel-head"><h2>Latest Attendance</h2><button class="btn" data-export-attendance="all">Export CSV</button></div>${attendanceTable(state.attendance.slice(-6).reverse(), true)}</section>
  `;
}

function renderRecords(admin) {
  const key = admin ? "attendanceAll" : "attendanceMine";
  const records = (admin ? state.attendance : state.attendance.filter((item) => item.employeeId === session.id))
    .filter((item) => includesSearch([employee(item.employeeId)?.name, item.employeeId, item.date, formatDate(item.date), item.status, item.verification], key));
  if (!selectedCalendarEmployee || !employee(selectedCalendarEmployee)) selectedCalendarEmployee = state.employees[0]?.id || "";
  const selectedEmp = employee(selectedCalendarEmployee);
  const calendar = admin
    ? `<section class="panel"><div class="panel-head"><h2>Employee Calendar</h2><div class="actions"><select class="select-control" id="calendarEmployee">${state.employees.map((emp) => `<option value="${emp.id}" ${emp.id === selectedCalendarEmployee ? "selected" : ""}>${escapeHtml(emp.name)}</option>`).join("")}</select><button class="btn" data-export-calendar="${selectedCalendarEmployee}">Export Report</button><button class="btn" data-export-calendar="all">Export All</button></div></div>${selectedEmp ? calendarForEmployee(selectedEmp.id) : `<p class="empty">No employee selected.</p>`}</section>`
    : `<section class="panel"><div class="panel-head"><h2>Monthly Calendar</h2><button class="btn" data-export-calendar="${session.id}">Export Report</button></div>${calendarForEmployee(session.id)}</section>`;
  return `<section class="search-panel">${searchBox(key, "Search records")}</section><section class="panel"><div class="panel-head"><h2>${admin ? "Attendance Records" : "My Attendance Records"}</h2><div class="actions">${admin ? `<button class="btn primary" id="addManualAttendance">Add Manual Status</button>` : ""}<button class="btn" data-export-attendance="${admin ? "all" : "mine"}">Export CSV</button></div></div>${attendanceTable(records.slice().reverse(), admin)}</section>${calendar}`;
}

function attendanceTable(records, admin) {
  if (!records.length) return `<p class="empty">No records yet.</p>`;
  return `<div class="table-wrap record-scroll"><table class="responsive-table"><thead><tr>${admin ? "<th>Employee</th>" : ""}<th>Date</th><th>In</th><th>Out</th><th>Hours</th><th>Status</th><th>Verify</th><th>Remark</th>${admin ? "<th>Action</th>" : ""}</tr></thead><tbody>${records.map((r) => `<tr>${admin ? `<td data-label="Employee">${escapeHtml(employee(r.employeeId)?.name || r.employeeId)}</td>` : ""}<td data-label="Date">${formatDate(r.date)}</td><td data-label="In">${r.checkIn || "-"}</td><td data-label="Out">${r.checkOut || "-"}</td><td data-label="Hours">${r.hours || "-"}</td><td data-label="Status"><span class="${badgeClass(r.status)}">${r.status}</span></td><td data-label="Verify">${escapeHtml(displayVerification(r.verification))}</td><td data-label="Remark">${escapeHtml(r.remark || "-")}</td>${admin ? `<td data-label="Action"><button class="btn danger" data-delete-attendance="${r.id}">Delete</button></td>` : ""}</tr>`).join("")}</tbody></table></div>`;
}

function calendarForEmployee(employeeId) {
  const dates = monthDates();
  const blanks = new Date(`${dates[0]}T00:00:00`).getDay();
  return `
    <div class="calendar-month">${monthLabel()}</div>
    <div class="calendar-grid">
      ${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => `<div class="calendar-head">${day}</div>`).join("")}
      ${Array.from({ length: blanks }, () => `<div class="calendar-cell empty-cell"></div>`).join("")}
      ${dates.map((dateValue) => {
        const status = calendarStatus(employeeId, dateValue);
        return `<div class="calendar-cell ${status.type}"><strong>${Number(dateValue.slice(-2))}</strong><span>${escapeHtml(status.label)}</span></div>`;
      }).join("")}
    </div>
    ${calendarMonthSummary(employeeId, dates)}
  `;
}

function calendarMonthSummary(employeeId, dates = monthDates()) {
  const records = state.attendance.filter((item) => item.employeeId === employeeId && dates.includes(item.date));
  const totalMinutes = records.reduce((sum, record) => sum + parseDurationMinutes(record.hours), 0);
  const workedDays = new Set(records.filter((record) => record.hours || ["Present", "Late", "Checked In", "Off-day Work"].includes(record.status)).map((record) => record.date)).size;
  const absentDays = dates.filter((dateValue) => calendarStatus(employeeId, dateValue).type === "absent").length;
  const lateDays = records.filter((record) => record.status === "Late").length;
  return `<div class="calendar-summary"><div><span>Total Worked</span><strong>${formatMinutes(totalMinutes)}</strong></div><div><span>Worked Days</span><strong>${workedDays}</strong></div><div><span>Late</span><strong>${lateDays}</strong></div><div><span>Absent</span><strong>${absentDays}</strong></div></div>`;
}

function renderLeaveForm() {
  const mine = state.leaves
    .filter((leave) => leave.employeeId === session.id)
    .filter((leave) => includesSearch([leave.type, requestDurationLabel(leave), leave.from, formatDate(leave.from), leave.to, formatDate(leave.to), leave.reason, leave.status], "myRequests"))
    .slice().reverse();
  return `
    <section class="search-panel">${searchBox("myRequests", "Search requests")}</section>
    <div class="request-layout">
      <form class="panel form-grid" id="leaveForm">
        <div class="panel-head wide"><h2>Submit Work Request</h2></div>
        <label class="field"><span>Type</span><select id="leaveType"><option>Annual Leave</option><option>Medical Leave</option><option>WFH</option><option>Business Trip</option><option>Emergency Leave</option><option>Unpaid Leave</option></select></label>
        <label class="field"><span>Duration</span><select id="leaveDuration"><option>Full Day</option><option>Half Day Morning</option><option>Half Day Afternoon</option></select></label>
        <label class="field"><span>From</span><input id="leaveFrom" type="date" min="${today()}" required></label>
        <label class="field"><span>To</span><input id="leaveTo" type="date" min="${today()}" required></label>
        <label class="field wide"><span>Reason</span><textarea id="leaveReason" required></textarea></label>
        <button class="btn primary" type="submit">Submit Request</button>
      </form>
      <section class="panel request-list-panel"><div class="panel-head"><h2>My Requests</h2><button class="btn" data-export-requests="mine">Export CSV</button></div>${leaveTable(mine, false)}</section>
    </div>
  `;
}

function renderLeaveApproval() {
  const requests = state.leaves
    .filter((leave) => includesSearch([employee(leave.employeeId)?.name, leave.employeeId, leave.type, requestDurationLabel(leave), leave.from, formatDate(leave.from), leave.to, formatDate(leave.to), leave.reason, leave.status], "requestsAll"))
    .slice().reverse();
  return `<section class="search-panel">${searchBox("requestsAll", "Search requests")}</section><section class="panel"><div class="panel-head"><h2>Work Requests</h2><button class="btn" data-export-requests="all">Export CSV</button></div>${leaveTable(requests, true)}</section>`;
}

function leaveTable(leaves, admin) {
  if (!leaves.length) return `<p class="empty">No requests.</p>`;
  return `<div class="table-wrap record-scroll"><table class="responsive-table"><thead><tr>${admin ? "<th>Employee</th>" : ""}<th>Type</th><th>Duration</th><th>From</th><th>To</th><th>Reason</th><th>Status</th>${admin ? "<th>Action</th>" : ""}</tr></thead><tbody>${leaves.map((leave) => `<tr>${admin ? `<td data-label="Employee">${escapeHtml(employee(leave.employeeId)?.name || leave.employeeId)}</td>` : ""}<td data-label="Type">${leave.type}</td><td data-label="Duration">${requestDurationLabel(leave)}</td><td data-label="From">${formatDate(leave.from)}</td><td data-label="To">${formatDate(leave.to)}</td><td data-label="Reason">${escapeHtml(leave.reason)}</td><td data-label="Status"><span class="${badgeClass(leave.status)}">${leave.status}</span></td>${admin ? `<td class="actions" data-label="Action"><button class="btn primary" data-approve="${leave.id}" ${leave.status !== "Pending" ? "disabled" : ""}>Approve</button><button class="btn danger" data-reject="${leave.id}" ${leave.status !== "Pending" ? "disabled" : ""}>Reject</button></td>` : ""}</tr>`).join("")}</tbody></table></div>`;
}

function renderEmployees() {
  const employees = state.employees.filter((emp) => includesSearch([emp.id, emp.name, emp.email, emp.department, emp.position, emp.employmentDate, emp.phone, emp.status, emp.statusRemark], "employees"));
  return `<section class="search-panel">${searchBox("employees", "Search employees")}</section><section class="panel"><div class="panel-head"><h2>Employees</h2><div class="actions"><button class="btn" data-export-employees>Export CSV</button><button class="btn primary" id="addEmployee">Add Employee</button></div></div><div class="table-wrap record-scroll"><table class="employees-table"><thead><tr><th>ID</th><th>Name</th><th>Email</th><th>Password</th><th>Department</th><th>Position</th><th>Joined</th><th>Phone</th><th>Status</th><th>Remark</th><th>Action</th></tr></thead><tbody>${employees.map((emp) => `<tr><td>${emp.id}</td><td>${escapeHtml(emp.name)}</td><td>${escapeHtml(emp.email)}</td><td><code>${escapeHtml(emp.password)}</code></td><td>${escapeHtml(emp.department)}</td><td>${escapeHtml(emp.position)}</td><td>${emp.employmentDate ? formatDate(emp.employmentDate) : "-"}</td><td>${escapeHtml(emp.phone || "-")}</td><td>${emp.status}</td><td>${escapeHtml(emp.statusRemark || "-")}</td><td><button class="btn" data-edit="${emp.id}">Edit</button></td></tr>`).join("") || `<tr><td colspan="11" class="empty">No employees found.</td></tr>`}</tbody></table></div></section>`;
}

function renderAdmins() {
  const admins = state.admins.filter((admin) => includesSearch([admin.id, admin.name, admin.email], "admins"));
  return `<section class="search-panel">${searchBox("admins", "Search admins")}</section><section class="panel"><div class="panel-head"><h2>Admins</h2><div class="actions"><button class="btn primary" id="addAdmin">Add Admin</button></div></div><div class="table-wrap record-scroll"><table class="responsive-table"><thead><tr><th>ID</th><th>Name</th><th>Email</th><th>Password</th><th>Action</th></tr></thead><tbody>${admins.map((admin) => `<tr><td data-label="ID">${escapeHtml(admin.id)}</td><td data-label="Name">${escapeHtml(admin.name)}</td><td data-label="Email">${escapeHtml(admin.email)}</td><td data-label="Password"><code>${escapeHtml(admin.password)}</code></td><td class="actions" data-label="Action"><button class="btn" data-edit-admin="${admin.id}">Edit</button><button class="btn danger" data-delete-admin="${admin.id}" ${state.admins.length <= 1 ? "disabled" : ""}>Delete</button></td></tr>`).join("") || `<tr><td colspan="5" class="empty">No admins found.</td></tr>`}</tbody></table></div></section>`;
}

function renderProfile() {
  const account = session.role === "admin" ? state.admins.find((admin) => admin.id === session.id) : employee(session.id);
  return `<form class="panel form-grid profile-form" id="profileForm" autocomplete="off"><div class="panel-head wide"><h2>My Profile</h2></div><label class="field"><span>Name</span><input id="profileName" value="${escapeHtml(account.name)}" ${session.role === "employee" ? "readonly" : "required"}></label><label class="field"><span>Email</span><input id="profileEmail" type="email" value="${escapeHtml(account.email)}" required></label>${session.role === "employee" ? `<label class="field"><span>Phone</span><input id="profilePhone" value="${escapeHtml(account.phone || "")}"></label>` : ""}<label class="field"><span>Current Password</span><input id="currentPassword" type="password" value="" autocomplete="new-password" readonly onfocus="this.removeAttribute('readonly')"></label><label class="field"><span>New Password</span><input id="newPassword" type="password" value="" autocomplete="new-password" placeholder="Leave blank to keep"></label><label class="field"><span>Confirm New Password</span><input id="confirmPassword" type="password" value="" autocomplete="new-password" placeholder="Repeat new password"></label><div class="wide actions"><button class="btn primary compact-btn" type="submit">Save Profile</button></div></form>`;
}

function renderSettings() {
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const selected = state.company.workingDays || seedState.company.workingDays;
  return `
    <form class="panel form-grid settings-form compact-settings" id="settingsForm">
      <div class="panel-head wide">
        <div>
          <h2>Company Settings</h2>
          <p>Configure this system for different companies.</p>
        </div>
      </div>
      <div class="field wide dataset-card">
        <span>Current Dataset</span>
        <strong>${escapeHtml(companyKey)}</strong>
        <small>Devices using the same dataset key share the same company data. Use a different key for another company.</small>
      </div>
      <label class="field"><span>Company Name</span><input id="companyName" value="${escapeHtml(state.company.name)}" required></label>
      <label class="field"><span>Office Name</span><input id="officeName" value="${escapeHtml(state.company.officeName)}" required></label>
      <label class="field"><span>Late After</span><input id="lateAfter" type="time" value="${state.company.lateAfter}" required></label>
      <label class="field"><span>QR / Code Refresh</span><select id="codeInterval"><option value="30" ${state.company.codeInterval === 30 ? "selected" : ""}>30 seconds</option><option value="60" ${state.company.codeInterval === 60 ? "selected" : ""}>60 seconds</option></select></label>
      <label class="field">
        <span class="label-row">Code Secret <span class="help-tip" tabindex="0" aria-label="Code Secret explanation">?<span class="help-text">Private seed used to generate rotating QR and manual codes. Change it if a code is leaked.</span></span></span>
        <input id="codeSecret" value="${escapeHtml(state.company.codeSecret)}" required>
      </label>
      <label class="field"><span>Office Latitude</span><input id="officeLatitude" type="number" step="0.000001" value="${state.company.officeLatitude}" required></label>
      <label class="field"><span>Office Longitude</span><input id="officeLongitude" type="number" step="0.000001" value="${state.company.officeLongitude}" required></label>
      <label class="field"><span>Allowed Radius (m)</span><input id="officeRadius" type="number" min="20" max="5000" step="10" value="${state.company.officeRadius}" required></label>
      <div class="field wide">
        <span>Working Days</span>
        <div class="day-grid">
          ${days.map((day) => `
            <label class="day-pill">
              <input type="checkbox" name="workingDay" value="${day}" ${selected.includes(day) ? "checked" : ""}>
              <span>${day.slice(0, 3)}</span>
            </label>
          `).join("")}
        </div>
      </div>
      <div class="wide actions">
        <button class="btn" type="button" id="useMyLocation">Use My Current Location</button>
        <button class="btn primary" type="submit">Save Settings</button>
      </div>
    </form>
  `;
}

function renderAudit() {
  const logs = state.auditLogs.filter((log) => includesSearch([log.at, log.actor, log.action, log.details], "audit"));
  return `<section class="search-panel">${searchBox("audit", "Search audit log")}</section><section class="panel"><div class="panel-head"><h2>Audit Log</h2><button class="btn" data-export-audit>Export CSV</button></div><div class="table-wrap"><table><thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Details</th></tr></thead><tbody>${logs.map((log) => `<tr><td>${escapeHtml(log.at)}</td><td>${escapeHtml(log.actor)}</td><td>${escapeHtml(log.action)}</td><td>${escapeHtml(log.details)}</td></tr>`).join("") || `<tr><td colspan="4" class="empty">No logs found.</td></tr>`}</tbody></table></div></section>`;
}

function bindEvents() {
  bindPasswordToggles();
  document.querySelector("#checkIn")?.addEventListener("click", () => openManualCheckIn());
  document.querySelector("#checkOut")?.addEventListener("click", checkOut);
  document.querySelector("#openQr")?.addEventListener("click", openQrDisplay);
  document.querySelector("#leaveForm")?.addEventListener("submit", submitLeave);
  document.querySelector("#profileForm")?.addEventListener("submit", saveProfile);
  document.querySelector("#settingsForm")?.addEventListener("submit", saveSettings);
  document.querySelector("#useMyLocation")?.addEventListener("click", useMyLocationForOffice);
  document.querySelector("#addEmployee")?.addEventListener("click", () => openEmployeeModal());
  document.querySelector("#addAdmin")?.addEventListener("click", () => openAdminModal());
  document.querySelector("#addManualAttendance")?.addEventListener("click", () => openManualAttendanceModal());
  document.querySelectorAll("[data-edit]").forEach((button) => button.addEventListener("click", () => openEmployeeModal(button.dataset.edit)));
  document.querySelectorAll("[data-edit-admin]").forEach((button) => button.addEventListener("click", () => openAdminModal(button.dataset.editAdmin)));
  document.querySelectorAll("[data-delete-admin]").forEach((button) => button.addEventListener("click", () => deleteAdmin(button.dataset.deleteAdmin)));
  document.querySelectorAll("[data-approve]").forEach((button) => button.addEventListener("click", () => updateLeave(button.dataset.approve, "Approved")));
  document.querySelectorAll("[data-reject]").forEach((button) => button.addEventListener("click", () => updateLeave(button.dataset.reject, "Rejected")));
  document.querySelectorAll("[data-delete-attendance]").forEach((button) => button.addEventListener("click", () => deleteAttendance(button.dataset.deleteAttendance)));
  document.querySelectorAll("[data-export-attendance]").forEach((button) => button.addEventListener("click", () => exportAttendance(button.dataset.exportAttendance)));
  document.querySelectorAll("[data-export-requests]").forEach((button) => button.addEventListener("click", () => exportRequests(button.dataset.exportRequests)));
  document.querySelectorAll("[data-export-calendar]").forEach((button) => button.addEventListener("click", () => exportCalendar(button.dataset.exportCalendar)));
  document.querySelector("[data-export-employees]")?.addEventListener("click", exportEmployees);
  document.querySelector("[data-export-audit]")?.addEventListener("click", exportAudit);
  document.querySelectorAll("[data-search-key]").forEach((input) => input.addEventListener("input", () => {
    searchTerms[input.dataset.searchKey] = input.value;
    renderAndFocusSearch(input.dataset.searchKey);
  }));
  document.querySelector("#calendarEmployee")?.addEventListener("change", (event) => {
    selectedCalendarEmployee = event.target.value;
    render();
  });
}

function bindPasswordToggles() {
  document.querySelectorAll("[data-toggle-password]").forEach((button) => {
    button.addEventListener("click", () => {
      const input = document.querySelector(`#${button.dataset.togglePassword}`);
      if (!input) return;
      input.type = input.type === "password" ? "text" : "password";
      button.classList.toggle("active", input.type === "text");
    });
  });
}

function renderQrDisplay() {
  const currentUrl = qrUrl();
  const isPublic = location.protocol === "https:" && !["localhost", "127.0.0.1", "0.0.0.0"].includes(location.hostname);
  app.innerHTML = `
    <section class="qr-screen">
      <div class="qr-card">
        <h1>${escapeHtml(state.company.name)}</h1>
        <p>Scan to check in. GPS office verification is required.</p>
        ${isPublic ? "" : `<div class="qr-warning">This QR is not public. Open the https://...trycloudflare.com link first, then open QR Display again.</div>`}
        <div class="qr-box" id="qrBox"></div>
        <div class="big-code"><span>Manual Code</span><strong id="displayCode">${currentCode()}</strong><small id="countdown">Refresh in ${secondsLeft()}s</small></div>
        <div class="qr-link"><span>QR opens:</span><code>${escapeHtml(currentUrl)}</code></div>
      </div>
    </section>
  `;
  drawQr();
}

function openQrDisplay() {
  const url = new URL(location.href);
  url.search = "?display=qr";
  window.open(url.toString(), "attendpro-qr");
}

async function processQr() {
  if (!pendingQr) return;
  const token = pendingQr;
  pendingQr = null;
  const url = new URL(location.href);
  url.searchParams.delete("qrCheckIn");
  history.replaceState({}, "", url.toString());
  if (session.role !== "employee") return toast("QR check-in is for employees only.");
  if (!validQr(token)) return toast("QR expired. Scan the latest QR.");
  await checkIn("Rotating QR code");
}

function openManualCheckIn() {
  const modal = document.querySelector("#modal");
  modal.innerHTML = `<form class="modal" id="codeForm"><h2>Check In</h2><p>Enter rotating code from QR display. GPS office verification is required.</p><label class="field"><span>Code</span><input id="manualCode" inputmode="numeric" maxlength="6" required></label><div class="modal-actions"><button class="btn primary" type="submit">Check In</button><button class="btn" type="button" id="closeModal">Cancel</button></div></form>`;
  modal.classList.add("show");
  document.querySelector("#closeModal").addEventListener("click", closeModal);
  document.querySelector("#codeForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitButton = document.querySelector("#codeForm button[type='submit']");
    if (submitButton) submitButton.disabled = true;
    const code = document.querySelector("#manualCode").value.trim();
    if (![currentCode(), currentCode(-1)].includes(code)) {
      if (submitButton) submitButton.disabled = false;
      return toast("Invalid or expired code.");
    }
    await checkIn("Manual rotating code");
  });
}

function closeModal() {
  document.querySelector("#modal").classList.remove("show");
}

async function checkIn(method) {
  if (attendanceBusy) return toast("Attendance action is already processing.");
  if (!isActiveEmployee()) return toast("Inactive account cannot check in.");
  if (currentOpenRecord()) return toast("Already checked in.");
  if (todaysRecords().length) return toast("You have already checked in today.");
  attendanceBusy = true;
  render();
  let verification;
  try {
    toast("Checking office location...");
    verification = await verifyOfficeLocation(method);
  } catch (error) {
    attendanceBusy = false;
    render();
    return toast(error.message || "Location check failed.");
  }
  if (currentOpenRecord() || todaysRecords().length) {
    attendanceBusy = false;
    render();
    return toast("You have already checked in today.");
  }
  const time = nowTime();
  const first = todaysRecords().length === 0;
  const status = !isWorkingDay(today()) ? "Off-day Work" : first && minutes(time) > minutes(state.company.lateAfter) ? "Late" : "Checked In";
  state.attendance.push({ id: `ATT${Date.now()}`, employeeId: session.id, date: today(), checkIn: time, checkOut: "", hours: "", status, verification });
  addAudit("Check in", `${session.name} checked in using ${verification}.`);
  saveState("Attendance updated.");
  attendanceBusy = false;
  closeModal();
  render();
  toast("Checked in.");
}

function checkOut() {
  if (attendanceBusy) return toast("Attendance action is already processing.");
  if (!isActiveEmployee()) return toast("Inactive account cannot check out.");
  const record = currentOpenRecord();
  if (!record) return toast("No active check-in found.");
  attendanceBusy = true;
  record.checkOut = nowTime();
  record.hours = duration(record.checkIn, record.checkOut);
  record.status = record.status === "Late" || record.status === "Off-day Work" ? record.status : "Present";
  addAudit("Check out", `${session.name} checked out.`);
  saveState("Attendance updated.");
  attendanceBusy = false;
  render();
  toast("Checked out.");
}

function submitLeave(event) {
  event.preventDefault();
  if (!isActiveEmployee()) return toast("Inactive account cannot submit requests.");
  const from = document.querySelector("#leaveFrom").value;
  const to = document.querySelector("#leaveTo").value;
  const duration = document.querySelector("#leaveDuration").value;
  if (from < today()) return toast("Start date cannot be in the past.");
  if (to < from) return toast("End date must be after start date.");
  if (duration !== "Full Day" && from !== to) return toast("Half day requests must use the same From and To date.");
  const duplicate = state.leaves.some((leave) => leave.employeeId === session.id && ["Pending", "Approved"].includes(leave.status) && requestsOverlap(from, to, leave.from, leave.to));
  if (duplicate) return toast("A pending or approved request already exists for this date range.");
  const leave = { id: `LEV${Date.now()}`, employeeId: session.id, type: document.querySelector("#leaveType").value, duration, from, to, reason: document.querySelector("#leaveReason").value.trim(), status: "Pending", reviewedBy: "" };
  state.leaves.push(leave);
  addAudit("Request submitted", `${session.name} submitted ${leave.type} (${duration}).`);
  saveState("New work request.");
  render();
  toast("Request submitted.");
}

function updateLeave(id, status) {
  const leave = state.leaves.find((item) => item.id === id);
  if (!leave) return;
  if (leave.status !== "Pending") return toast("This request has already been reviewed.");
  leave.status = status;
  leave.reviewedBy = session.name;
  addAudit(`Request ${status}`, `${session.name} ${status.toLowerCase()} a work request.`);
  saveState("Request updated.");
  render();
  toast(`Request ${status.toLowerCase()}.`);
}

function deleteAttendance(id) {
  const record = state.attendance.find((item) => item.id === id);
  if (!record) return toast("Attendance record not found.");
  const emp = employee(record.employeeId);
  const modal = document.querySelector("#modal");
  modal.innerHTML = `<form class="modal" id="deleteAttendanceForm"><h2>Delete Attendance Record</h2><p class="helper">This action will be saved in the audit log.</p><div class="record-summary"><strong>${escapeHtml(emp?.name || record.employeeId)}</strong><span>${formatDate(record.date)} | In ${escapeHtml(record.checkIn || "-")} | Out ${escapeHtml(record.checkOut || "-")} | ${escapeHtml(record.status)}</span></div><label class="field"><span>Deletion Remark / Proof</span><textarea id="deleteRemark" required placeholder="Example: Duplicate record, wrong employee selected, accidental checkout correction"></textarea></label><div class="modal-actions"><button class="btn danger" type="submit">Delete Record</button><button class="btn" type="button" id="closeModal">Cancel</button></div></form>`;
  modal.classList.add("show");
  document.querySelector("#closeModal").addEventListener("click", closeModal);
  document.querySelector("#deleteAttendanceForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const remark = document.querySelector("#deleteRemark").value.trim();
    if (!remark) return toast("Deletion remark is required.");
    state.attendance = state.attendance.filter((item) => item.id !== id);
    state.deletedAttendanceIds = uniqueValues([...state.deletedAttendanceIds, id]);
    addAudit("Attendance deleted", `${session.name} deleted attendance record for ${emp?.name || record.employeeId} on ${formatDate(record.date)}. Reason: ${remark}. Deleted record: In ${record.checkIn || "-"}, Out ${record.checkOut || "-"}, Status ${record.status}.`);
    saveState("Attendance record deleted.");
    closeModal();
    render();
    toast("Attendance record deleted.");
  });
}

function saveProfile(event) {
  event.preventDefault();
  if (session.role === "employee" && !isActiveEmployee()) return toast("Inactive account cannot edit profile.");
  const account = session.role === "admin" ? state.admins.find((admin) => admin.id === session.id) : employee(session.id);
  const email = document.querySelector("#profileEmail").value.trim();
  const duplicateEmployee = state.employees.some((item) => !(session.role === "employee" && item.id === account.id) && item.email.toLowerCase() === email.toLowerCase());
  const duplicateAdmin = state.admins.some((item) => !(session.role === "admin" && item.id === account.id) && item.email.toLowerCase() === email.toLowerCase());
  const duplicate = duplicateEmployee || duplicateAdmin;
  if (duplicate) return toast("Email already used.");
  const nextPassword = document.querySelector("#newPassword").value;
  const confirmPassword = document.querySelector("#confirmPassword").value;
  const currentPassword = document.querySelector("#currentPassword").value;
  if (currentPassword && !nextPassword && !confirmPassword) return toast("Enter a new password to change it.");
  if (nextPassword || confirmPassword) {
    if (!nextPassword || !confirmPassword) return toast("Enter and confirm the new password.");
    if (nextPassword !== confirmPassword) return toast("New passwords do not match.");
    if (document.querySelector("#currentPassword").value !== account.password) return toast("Current password incorrect.");
    if (nextPassword.length < 8) return toast("Password must be at least 8 characters.");
    account.password = nextPassword;
  }
  if (session.role === "admin") account.name = document.querySelector("#profileName").value.trim();
  account.email = email;
  if (session.role === "employee") account.phone = document.querySelector("#profilePhone").value.trim();
  session.name = account.name;
  session.email = email;
  addAudit("Profile updated", `${account.name} updated profile.`);
  saveState("Profile updated.");
  render();
  toast("Profile saved.");
}

function saveSettings(event) {
  event.preventDefault();
  state.company.name = document.querySelector("#companyName").value.trim();
  state.company.officeName = document.querySelector("#officeName").value.trim();
  state.company.lateAfter = document.querySelector("#lateAfter").value;
  state.company.codeInterval = Number(document.querySelector("#codeInterval").value);
  state.company.codeSecret = document.querySelector("#codeSecret").value.trim().toUpperCase();
  state.company.officeLatitude = Number(document.querySelector("#officeLatitude").value);
  state.company.officeLongitude = Number(document.querySelector("#officeLongitude").value);
  state.company.officeRadius = Number(document.querySelector("#officeRadius").value);
  if (!officeLocationReady()) return toast("Enter a valid office latitude, longitude, and radius.");
  state.company.workingDays = Array.from(document.querySelectorAll("input[name='workingDay']:checked")).map((input) => input.value);
  if (!state.company.workingDays.length) return toast("Select at least one working day.");
  addAudit("Settings updated", `${session.name} updated company settings.`);
  saveState("Settings updated.");
  render();
  toast("Settings saved.");
}

async function useMyLocationForOffice() {
  try {
    toast("Getting your current location...");
    const position = await getCurrentPosition();
    document.querySelector("#officeLatitude").value = position.coords.latitude.toFixed(6);
    document.querySelector("#officeLongitude").value = position.coords.longitude.toFixed(6);
    toast("Location filled. Review radius, then save settings.");
  } catch (error) {
    toast(error.message || "Cannot get current location.");
  }
}

function exportAttendance(scope) {
  const records = scope === "all" ? state.attendance : state.attendance.filter((item) => item.employeeId === session.id);
  const rows = records.map((r) => [employee(r.employeeId)?.name || r.employeeId, r.employeeId, r.date, r.checkIn, r.checkOut || "", r.hours || "", r.status, displayVerification(r.verification), r.remark || ""]);
  downloadCSV(`${safeName(exportBase(scope, "attendance-records"))}.csv`, ["Employee", "Employee ID", "Date", "Check In", "Check Out", "Hours", "Status", "Verification", "Remark"], rows);
}

function exportRequests(scope) {
  const requests = scope === "all" ? state.leaves : state.leaves.filter((item) => item.employeeId === session.id);
  const rows = requests.map((r) => [employee(r.employeeId)?.name || r.employeeId, r.employeeId, r.type, requestDurationLabel(r), r.from, r.to, r.reason, r.status, r.reviewedBy || ""]);
  downloadCSV(`${safeName(exportBase(scope, "work-requests"))}.csv`, ["Employee", "Employee ID", "Type", "Duration", "From", "To", "Reason", "Status", "Reviewed By"], rows);
}

function exportEmployees() {
  const rows = state.employees.map((emp) => [emp.id, emp.name, emp.email, emp.password, emp.department, emp.position, emp.employmentDate || "", emp.phone || "", emp.status, emp.statusRemark || "", emp.statusUpdatedBy || "", emp.statusUpdatedAt || ""]);
  downloadCSV(`${safeName(`${companyReportName()}-employee-list-${today()}`)}.csv`, ["ID", "Name", "Email", "Password", "Department", "Position", "Employment Date", "Phone", "Status", "Status Remark", "Updated By", "Updated At"], rows);
}

function exportAudit() {
  const rows = state.auditLogs.map((log) => [log.at, log.actor, log.action, log.details]);
  downloadCSV(`${safeName(`${companyReportName()}-audit-log-${today()}`)}.csv`, ["Time", "Actor", "Action", "Details"], rows);
}

function exportCalendar(target) {
  const employees = target === "all" ? state.employees : [employee(target || session.id)].filter(Boolean);
  if (!employees.length) return toast("No employee selected for calendar export.");
  const title = target === "all" ? `All Employees Attendance Calendar - ${monthLabel()}` : `${employees[0].name} Attendance Calendar - ${monthLabel()}`;
  const sections = employees.map((emp) => `
    <section class="employee-section">
      <h2>${escapeHtml(emp.name)}</h2>
      <p>${escapeHtml(emp.department || "-")} | ${escapeHtml(emp.position || "-")} | ${escapeHtml(emp.id)} | Joined: ${emp.employmentDate ? formatDate(emp.employmentDate) : "-"}</p>
      ${calendarForEmployee(emp.id)}
      <table>
        <thead><tr><th>Date</th><th>Working Day</th><th>Status</th><th>Check In</th><th>Check Out</th></tr></thead>
        <tbody>
          ${monthDates().map((dateValue) => {
            const records = attendanceForDate(emp.id, dateValue);
            const status = calendarStatus(emp.id, dateValue);
            return `<tr><td>${formatDate(dateValue)}</td><td>${isWorkingDay(dateValue) ? "Yes" : "No"}</td><td>${escapeHtml(status.label)}</td><td>${records.map((r) => r.checkIn).filter(Boolean).join(", ") || "-"}</td><td>${records.map((r) => r.checkOut || "-").join(", ") || "-"}</td></tr>`;
          }).join("")}
        </tbody>
      </table>
    </section>
  `).join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>
    body{font-family:Segoe UI,Arial,sans-serif;margin:28px;color:#172026;background:#f5f8fa}
    header{background:#0f766e;color:white;padding:22px 26px;border-radius:10px;margin-bottom:18px}
    h1{margin:0;font-size:24px} h2{margin:0 0 4px;font-size:18px}
    .meta{margin-top:8px;color:rgba(255,255,255,.82)}
    .employee-section{background:white;border:1px solid #d9e4e8;border-radius:10px;padding:18px;margin-bottom:18px;page-break-inside:avoid}
    .employee-section p{margin:0 0 14px;color:#65747c}
    .calendar-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:6px;margin-bottom:16px}
    .calendar-head{text-align:center;color:#65747c;font-size:12px;font-weight:700;text-transform:uppercase}
    .calendar-cell{min-height:58px;border:1px solid #d9e4e8;border-radius:8px;padding:7px;background:#fbfcfd}
    .calendar-cell strong{display:block;font-size:13px}.calendar-cell span{font-size:11px;color:#65747c}
    .present{background:#e8f8ef;border-color:#b7e8ca}.late{background:#fff5df;border-color:#f1d38c}.absent,.rejected{background:#fff0f0;border-color:#f3baba}
    .approved,.wfh{background:#eaf2ff;border-color:#bad0ff}.holiday{background:#f2edff;border-color:#cbbef5}.pending{background:#fff9e8;border-color:#ecd79d}.off,.empty,.empty-cell{background:#f4f7f8}
    .calendar-summary{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:0 0 16px}
    .calendar-summary div{border:1px solid #d9e4e8;border-radius:8px;background:#f7fafb;padding:10px}
    .calendar-summary span{display:block;color:#65747c;font-size:11px;font-weight:700;text-transform:uppercase}.calendar-summary strong{display:block;margin-top:4px;font-size:16px}
    table{width:100%;border-collapse:collapse;margin-top:8px}th,td{border-bottom:1px solid #d9e4e8;text-align:left;padding:9px;font-size:13px}th{color:#65747c;text-transform:uppercase;font-size:11px}
  </style></head><body><header><h1>${escapeHtml(title)}</h1><div class="meta">Company: ${escapeHtml(companyReportName())} | Dataset: ${escapeHtml(companyKey)} | Generated: ${new Date().toLocaleString("en-GB")}</div></header>${sections}</body></html>`;
  const fileBase = target === "all" ? `${companyReportName()}-calendar-report-${monthLabel()}` : `${companyReportName()}-${employees[0].name}-calendar-report-${monthLabel()}`;
  downloadHTML(`${safeName(fileBase)}.html`, html);
}

function openManualAttendanceModal() {
  if (!state.employees.length) return toast("Add employees first.");
  const modal = document.querySelector("#modal");
  modal.innerHTML = `<form class="modal" id="manualAttendanceForm"><h2>Add Manual Status</h2><p class="helper">Use this for approved corrections, absence updates, or public holidays. A remark is required for audit tracking.</p><label class="field"><span>Employee</span><select id="manualEmployee">${state.employees.map((emp) => `<option value="${emp.id}">${escapeHtml(emp.name)} (${escapeHtml(emp.id)})</option>`).join("")}</select></label><label class="field"><span>From Date</span><input id="manualFrom" type="date" value="${today()}" required></label><label class="field"><span>To Date</span><input id="manualTo" type="date" value="${today()}" required></label><label class="field"><span>Status</span><select id="manualStatus"><option>Absent</option><option>Public Holiday</option><option>Present</option><option>Late</option><option>Checked In</option></select></label><label class="field"><span>Check In Time</span><input id="manualCheckIn" type="time"></label><label class="field"><span>Check Out Time</span><input id="manualCheckOut" type="time"></label><label class="field check-line"><input id="manualAllEmployees" type="checkbox"><span>Apply to all employees for this date range</span></label><label class="field"><span>Remark / Proof</span><textarea id="manualRemark" required placeholder="Example: Public holiday approved by management, medical proof received, admin correction after missed checkout"></textarea></label><div class="modal-actions"><button class="btn primary" type="submit">Save Status</button><button class="btn" type="button" id="closeModal">Cancel</button></div></form>`;
  modal.classList.add("show");
  document.querySelector("#closeModal").addEventListener("click", closeModal);
  document.querySelector("#manualAttendanceForm").addEventListener("submit", saveManualAttendance);
}

function saveManualAttendance(event) {
  event.preventDefault();
  const from = document.querySelector("#manualFrom").value;
  const to = document.querySelector("#manualTo").value;
  const status = document.querySelector("#manualStatus").value;
  const manualCheckIn = document.querySelector("#manualCheckIn").value;
  const manualCheckOut = document.querySelector("#manualCheckOut").value;
  const remark = document.querySelector("#manualRemark").value.trim();
  const applyAll = document.querySelector("#manualAllEmployees").checked;
  if (to < from) return toast("To Date must be after From Date.");
  if (["Present", "Late", "Checked In"].includes(status) && !manualCheckIn) return toast("Check-in time is required for this status.");
  if (manualCheckOut && !manualCheckIn) return toast("Enter check-in time before check-out time.");
  if (manualCheckIn && manualCheckOut && manualCheckOut < manualCheckIn) return toast("Check-out time must be after check-in time.");
  if (!remark) return toast("Remark is required.");
  const targets = applyAll ? state.employees : [employee(document.querySelector("#manualEmployee").value)].filter(Boolean);
  const dates = dateRange(from, to);
  let changed = 0;
  const clearTimes = ["Absent", "Public Holiday"].includes(status);
  if (clearTimes && (manualCheckIn || manualCheckOut)) return toast("Absent and Public Holiday records should not include check-in/out time.");
  targets.forEach((emp) => {
    dates
      .filter((dateValue) => !emp.employmentDate || dateValue >= emp.employmentDate)
      .forEach((dateValue) => {
        const existing = state.attendance.find((item) => item.employeeId === emp.id && item.date === dateValue);
        if (existing) {
          existing.status = status;
          existing.remark = remark;
          existing.verification = "Admin manual update";
          if (manualCheckIn || manualCheckOut || clearTimes) {
            existing.checkIn = manualCheckIn || "";
            existing.checkOut = manualCheckOut || "";
            existing.hours = manualCheckIn && manualCheckOut ? duration(manualCheckIn, manualCheckOut) : "";
          }
        } else {
          state.attendance.push({
            id: `ATT${Date.now()}${Math.random().toString(16).slice(2, 6)}`,
            employeeId: emp.id,
            date: dateValue,
            checkIn: manualCheckIn || "",
            checkOut: manualCheckOut || "",
            hours: manualCheckIn && manualCheckOut ? duration(manualCheckIn, manualCheckOut) : "",
            status,
            verification: "Admin manual update",
            remark
          });
        }
        changed += 1;
      });
  });
  if (!changed) return toast("No eligible employee dates in this range.");
  addAudit("Manual attendance status", `${session.name} set ${status} for ${targets.length} employee(s), ${changed} date record(s), from ${formatDate(from)} to ${formatDate(to)}${manualCheckIn ? `, In ${manualCheckIn}` : ""}${manualCheckOut ? `, Out ${manualCheckOut}` : ""}. Remark: ${remark}.`);
  saveState("Attendance status updated.");
  closeModal();
  render();
  toast("Manual status saved.");
}

function openEmployeeModal(id) {
  const emp = employee(id) || { id: `EMP${String(state.employees.length + 1).padStart(3, "0")}`, name: "", email: "", password: "employee123", department: "", position: "", employmentDate: today(), phone: "", status: "Active", statusRemark: "" };
  const modal = document.querySelector("#modal");
  modal.innerHTML = `<form class="modal" id="employeeForm"><h2>${id ? "Edit" : "Add"} Employee</h2><label class="field"><span>ID</span><input id="empId" value="${emp.id}" ${id ? "readonly" : ""}></label><label class="field"><span>Name</span><input id="empName" value="${escapeHtml(emp.name)}" required></label><label class="field"><span>Email</span><input id="empEmail" type="email" value="${escapeHtml(emp.email)}" required></label><label class="field"><span>Password</span><input id="empPassword" value="${escapeHtml(emp.password)}" required></label><label class="field"><span>Department</span><input id="empDept" value="${escapeHtml(emp.department)}"></label><label class="field"><span>Position</span><input id="empPos" value="${escapeHtml(emp.position)}"></label><label class="field"><span>Employment Date</span><input id="empEmploymentDate" type="date" value="${emp.employmentDate || today()}" required></label><label class="field"><span>Phone</span><input id="empPhone" value="${escapeHtml(emp.phone || "")}"></label><label class="field"><span>Status</span><select id="empStatus"><option ${emp.status === "Active" ? "selected" : ""}>Active</option><option ${emp.status === "Inactive" ? "selected" : ""}>Inactive</option></select></label><label class="field"><span>Status Remark / Proof</span><textarea id="empStatusRemark" placeholder="Required if status is changed">${escapeHtml(emp.statusRemark || "")}</textarea></label><div class="modal-actions"><button class="btn primary" type="submit">Save</button><button class="btn" type="button" id="closeModal">Cancel</button></div></form>`;
  modal.classList.add("show");
  document.querySelector("#closeModal").addEventListener("click", closeModal);
  document.querySelector("#employeeForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const previous = employee(id);
    const statusRemark = document.querySelector("#empStatusRemark").value.trim();
    const nextStatus = document.querySelector("#empStatus").value;
    if (previous && previous.status !== nextStatus && !statusRemark) return toast("Status change requires a remark/proof.");
    const payload = { id: document.querySelector("#empId").value.trim(), name: document.querySelector("#empName").value.trim(), email: document.querySelector("#empEmail").value.trim(), password: document.querySelector("#empPassword").value.trim() || "employee123", department: document.querySelector("#empDept").value.trim(), position: document.querySelector("#empPos").value.trim(), employmentDate: document.querySelector("#empEmploymentDate").value, phone: document.querySelector("#empPhone").value.trim(), status: nextStatus, statusRemark, statusUpdatedAt: previous && previous.status !== nextStatus ? new Date().toLocaleString("en-GB", { hour12: false }) : emp.statusUpdatedAt || "", statusUpdatedBy: previous && previous.status !== nextStatus ? session.name : emp.statusUpdatedBy || "" };
    if (!payload.id || !payload.name || !payload.email) return toast("Fill in employee ID, name, and email.");
    if (payload.password.length < 8) return toast("Employee password must be at least 8 characters.");
    const duplicateEmployeeId = state.employees.some((item) => item.id === payload.id && item.id !== id);
    if (duplicateEmployeeId) return toast("Employee ID already exists.");
    const duplicateEmployeeEmail = state.employees.some((item) => item.email.toLowerCase() === payload.email.toLowerCase() && item.id !== id);
    const duplicateAdminEmail = state.admins.some((item) => item.email.toLowerCase() === payload.email.toLowerCase());
    if (duplicateEmployeeEmail || duplicateAdminEmail) return toast("Email already used.");
    const index = state.employees.findIndex((item) => item.id === payload.id);
    if (index >= 0) state.employees[index] = payload;
    else state.employees.push(payload);
    addAudit("Employee saved", `${payload.name} record saved.${previous && previous.status !== nextStatus ? ` Status changed to ${nextStatus}. Remark: ${statusRemark}` : ""}`);
    saveState("Employee updated.");
    closeModal();
    render();
    toast("Employee saved.");
  });
}

function openAdminModal(id) {
  const existing = state.admins.find((admin) => admin.id === id);
  const admin = existing || { id: `ADM${String(state.admins.length + 1).padStart(3, "0")}`, name: "", email: "", password: "admin12345" };
  const modal = document.querySelector("#modal");
  modal.innerHTML = `<form class="modal" id="adminForm"><h2>${existing ? "Edit" : "Add"} Admin</h2><label class="field"><span>ID</span><input id="adminId" value="${escapeHtml(admin.id)}" ${existing ? "readonly" : ""} required></label><label class="field"><span>Name</span><input id="adminName" value="${escapeHtml(admin.name)}" required></label><label class="field"><span>Email</span><input id="adminEmail" type="email" value="${escapeHtml(admin.email)}" required></label><label class="field"><span>Password</span><input id="adminPassword" value="${escapeHtml(admin.password)}" required></label><div class="modal-actions"><button class="btn primary" type="submit">Save Admin</button><button class="btn" type="button" id="closeModal">Cancel</button></div></form>`;
  modal.classList.add("show");
  document.querySelector("#closeModal").addEventListener("click", closeModal);
  document.querySelector("#adminForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const payload = {
      id: document.querySelector("#adminId").value.trim(),
      name: document.querySelector("#adminName").value.trim(),
      email: document.querySelector("#adminEmail").value.trim(),
      password: document.querySelector("#adminPassword").value.trim()
    };
    if (!payload.id || !payload.name || !payload.email || !payload.password) return toast("Fill in all admin fields.");
    if (payload.password.length < 8) return toast("Admin password must be at least 8 characters.");
    const duplicateId = state.admins.some((item) => item.id === payload.id && item.id !== id);
    if (duplicateId) return toast("Admin ID already exists.");
    const duplicateAdminEmail = state.admins.some((item) => item.email.toLowerCase() === payload.email.toLowerCase() && !(existing && item.id === existing.id));
    const duplicateEmployeeEmail = state.employees.some((item) => item.email.toLowerCase() === payload.email.toLowerCase());
    const duplicateEmail = duplicateAdminEmail || duplicateEmployeeEmail;
    if (duplicateEmail) return toast("Email already used.");
    const index = state.admins.findIndex((item) => item.id === payload.id);
    if (index >= 0) state.admins[index] = payload;
    else state.admins.push(payload);
    if (session.id === payload.id) {
      session.name = payload.name;
      session.email = payload.email;
    }
    addAudit("Admin saved", `${session.name} saved admin account ${payload.email}.`);
    saveState("Admin account updated.");
    closeModal();
    render();
    toast("Admin saved.");
  });
}

function deleteAdmin(id) {
  const admin = state.admins.find((item) => item.id === id);
  if (!admin) return toast("Admin not found.");
  if (state.admins.length <= 1) return toast("At least one admin is required.");
  if (admin.id === session.id) return toast("You cannot delete your own admin account while logged in.");
  const modal = document.querySelector("#modal");
  modal.innerHTML = `<form class="modal" id="deleteAdminForm"><h2>Delete Admin</h2><p class="helper">This removes admin login access and will be saved in the audit log.</p><div class="record-summary"><strong>${escapeHtml(admin.name)}</strong><span>${escapeHtml(admin.email)} | ${escapeHtml(admin.id)}</span></div><label class="field"><span>Deletion Remark / Proof</span><textarea id="deleteAdminRemark" required placeholder="Example: Duplicate admin created by mistake"></textarea></label><div class="modal-actions"><button class="btn danger" type="submit">Delete Admin</button><button class="btn" type="button" id="closeModal">Cancel</button></div></form>`;
  modal.classList.add("show");
  document.querySelector("#closeModal").addEventListener("click", closeModal);
  document.querySelector("#deleteAdminForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const remark = document.querySelector("#deleteAdminRemark").value.trim();
    if (!remark) return toast("Deletion remark is required.");
    state.admins = state.admins.filter((item) => item.id !== id);
    state.deletedAdminIds = uniqueValues([...state.deletedAdminIds, id]);
    addAudit("Admin deleted", `${session.name} deleted admin ${admin.email}. Reason: ${remark}.`);
    saveState("Admin account deleted.");
    closeModal();
    render();
    toast("Admin deleted.");
  });
}

function toast(message) {
  const el = document.querySelector("#toast");
  if (!el) return;
  el.textContent = message;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2400);
}

setInterval(() => {
  document.querySelector("#clockNow") && (document.querySelector("#clockNow").textContent = nowTime());
  document.querySelectorAll("#liveCode, #displayCode").forEach((el) => el.textContent = currentCode());
  document.querySelectorAll("#countdown").forEach((el) => el.textContent = `${el.id === "countdown" && el.tagName === "SMALL" ? "Refresh in " : ""}${secondsLeft()}s`);
  drawQr();
}, 1000);

startSync();
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations()
    .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
    .catch(() => {});
}
render();



