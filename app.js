code = r"""const firebaseConfig = {
  apiKey: "AIzaSyAjOKy6EDW4ga3WMdanlXoFl2zmZWakdFM",
  authDomain: "obion-9dd88.firebaseapp.com",
  databaseURL: "https://obion-9dd88-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "obion-9dd88",
  storageBucket: "obion-9dd88.firebasestorage.app",
  messagingSenderId: "323290176171",
  appId: "1:323290176171:web:0a8e937e0e3127ce9535ee",
  measurementId: "G-TXEM0R3769"
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const authDb = firebase.auth();
const firestoreDb = firebase.firestore();
firestoreDb.settings({
  experimentalForceLongPolling: true,
  useFetchStreams: false,
  ignoreUndefinedProperties: true
});

const BACKUP_KEY = "obion_erp_backup_v1";
const BRANCHES = ["Oisillon", "Meute", "Troupe", "Chemin", "Route"];
const UNIT_ALIASES = {
  "Oisillon": "Oisillon",
  "Oisillons": "Oisillon",
  "Meute": "Meute",
  "Louveteau": "Meute",
  "Troupe": "Troupe",
  "Troupier": "Troupe",
  "Chemin": "Chemin",
  "Cheminot": "Chemin",
  "Route": "Route",
  "Routier": "Route"
};

const TENUE_LABELS = {
  aucune: "Pas encore / non acquise",
  confection: "En confection",
  partielle: "Incomplète / partielle",
  complete: "Tenue complète"
};

function cloneSafe(obj) {
  try {
    if (typeof structuredClone === "function") return structuredClone(obj);
  } catch (e) {}
  return JSON.parse(JSON.stringify(obj));
}

function uid(prefix = "id") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatMoney(amount) {
  const n = Number(amount || 0);
  return `${n.toLocaleString("fr-FR")} FCFA`;
}

function normalizeBranch(rawBranch) {
  const val = String(rawBranch || "").trim();
  if (!val || val === "Toutes" || val === "Groupe") return val || "Groupe";
  return UNIT_ALIASES[val] || val;
}

function normalizeWaPhone(phoneRaw) {
  const digits = String(phoneRaw || "").replace(/\D+/g, "");
  if (!digits) return "";
  if (digits.startsWith("225")) return digits;
  if (digits.length === 10) return `225${digits}`;
  return digits;
}

const defaultData = {
  scouts: [],
  chefs: [
    { id: "chef_meute", nom: "Akissi Kouamé", poste: "Chef d'Unité", branche: "Meute", tel: "", matricule: "", email: "" },
    { id: "chef_troupe", nom: "Yao Konan", poste: "Chef d'Unité", branche: "Troupe", tel: "", matricule: "", email: "" }
  ],
  activites: [],
  programmeEvents: [],
  presences: [],
  finances: [],
  messageLogs: [],
  cuAckLogs: {},
  parentMeetingsDone: {},
  cotisationsCustom: [],
  cotisationPayments: {},
  transitions: [],
  progressions: [],
  activityFinances: [],
  absenceRequests: [],
  announcements: [],
  settings: {
    cg_nom: "Chef de Groupe Obion",
    cg_tel: "",
    wave_url: "",
    cot_annuelle_j: 2500,
    cot_mensuelle_j: 500,
    cot_nationale_deadline: "",
    roleOverrides: {}
  }
};

let db = cloneSafe(defaultData);
let currentUser = null;
let lastReceiptText = "";
let preparedParentMessages = [];
let unsubscribeDoc = null;
let saveTimer = null;

function getDocRefForUser(user) {
  const uidVal = (user && user.uid) ? user.uid : "groupe_principal";
  return firestoreDb.collection("erp_obion").doc(uidVal);
}

function normalizeDbStructure(raw) {
  const merged = Object.assign(cloneSafe(defaultData), raw || {});
  merged.settings = Object.assign(cloneSafe(defaultData.settings), (raw && raw.settings) || {});
  if (!merged.settings.roleOverrides || typeof merged.settings.roleOverrides !== "object") {
    merged.settings.roleOverrides = {};
  }

  merged.scouts = Array.isArray(merged.scouts) ? merged.scouts.map((s) => ({
    id: s.id || uid("sc"),
    prenom: s.prenom || "",
    nom: s.nom || "",
    matricule: s.matricule || "",
    cotisationNationalePayee: Boolean(s.cotisationNationalePayee || s.matricule),
    branche: normalizeBranch(s.branche || "Meute"),
    parent_nom: s.parent_nom || "",
    parent_tel: s.parent_tel || "",
    parent_tel2: s.parent_tel2 || "",
    allergies: s.allergies || "",
    tenue: ["aucune", "confection", "partielle", "complete"].includes(s.tenue) ? s.tenue : "aucune",
    dob: s.dob || "",
    address: s.address || "",
    docs: s.docs || "",
    notes: s.notes || ""
  })) : [];

  merged.chefs = (Array.isArray(merged.chefs) && merged.chefs.length ? merged.chefs : cloneSafe(defaultData.chefs)).map((c) => ({
    id: c.id || uid("chef"),
    nom: c.nom || "",
    poste: c.poste || c.role || "Chef d'Unité",
    branche: normalizeBranch(c.branche || c.unite || "Groupe"),
    tel: c.tel || "",
    matricule: c.matricule || "",
    email: String(c.email || "").trim().toLowerCase()
  }));

  merged.activites = Array.isArray(merged.activites) ? merged.activites.map((a) => ({
    id: a.id || uid("act"),
    titre: a.titre || "",
    date: a.date || "",
    date_limite_paiement: a.date_limite_paiement || "",
    branche: a.branche === "Toutes" ? "Toutes" : normalizeBranch(a.branche || "Toutes"),
    lieu: a.lieu || "",
    forCu: Boolean(a.forCu)
  })) : [];

  merged.programmeEvents = Array.isArray(merged.programmeEvents) ? merged.programmeEvents.map((ev) => ({
    id: ev.id || uid("prog"),
    titre: ev.titre || "",
    date: ev.date || "",
    rappelJoursAvant: Number(ev.rappelJoursAvant ?? 7),
    branche: ev.branche === "Toutes" ? "Toutes" : normalizeBranch(ev.branche || "Toutes"),
    details: ev.details || ""
  })) : [];

  merged.presences = Array.isArray(merged.presences) ? merged.presences : [];
  merged.finances = Array.isArray(merged.finances) ? merged.finances : [];
  merged.messageLogs = Array.isArray(merged.messageLogs) ? merged.messageLogs.slice(0, 500) : [];
  merged.cuAckLogs = merged.cuAckLogs && typeof merged.cuAckLogs === "object" ? merged.cuAckLogs : {};
  merged.parentMeetingsDone = merged.parentMeetingsDone && typeof merged.parentMeetingsDone === "object" ? merged.parentMeetingsDone : {};
  merged.cotisationsCustom = Array.isArray(merged.cotisationsCustom) ? merged.cotisationsCustom : [];
  merged.cotisationPayments = merged.cotisationPayments && typeof merged.cotisationPayments === "object" ? merged.cotisationPayments : {};
  merged.transitions = Array.isArray(merged.transitions) ? merged.transitions : [];
  merged.progressions = Array.isArray(merged.progressions) ? merged.progressions : [];
  merged.activityFinances = Array.isArray(merged.activityFinances) ? merged.activityFinances : [];
  merged.absenceRequests = Array.isArray(merged.absenceRequests) ? merged.absenceRequests : [];
  merged.announcements = Array.isArray(merged.announcements) ? merged.announcements : [];

  return merged;
}

function mergeArrayById(remoteArr = [], localArr = []) {
  const map = new Map();
  remoteArr.forEach((item) => {
    if (item && item.id) map.set(item.id, item);
  });
  localArr.forEach((item) => {
    if (item && item.id && !map.has(item.id)) map.set(item.id, item);
  });
  return Array.from(map.values());
}

function mergeDbStates(remoteRaw, localRaw) {
  const remote = normalizeDbStructure(remoteRaw);
  const local = normalizeDbStructure(localRaw);
  return normalizeDbStructure({
    scouts: mergeArrayById(remote.scouts, local.scouts),
    chefs: mergeArrayById(remote.chefs, local.chefs),
    activites: mergeArrayById(remote.activites, local.activites),
    programmeEvents: mergeArrayById(remote.programmeEvents, local.programmeEvents),
    presences: mergeArrayById(remote.presences, local.presences),
    finances: mergeArrayById(remote.finances, local.finances),
    messageLogs: mergeArrayById(remote.messageLogs, local.messageLogs).slice(0, 500),
    cuAckLogs: Object.assign({}, remote.cuAckLogs, local.cuAckLogs),
    parentMeetingsDone: Object.assign({}, remote.parentMeetingsDone, local.parentMeetingsDone),
    cotisationsCustom: mergeArrayById(remote.cotisationsCustom, local.cotisationsCustom),
    cotisationPayments: Object.assign({}, remote.cotisationPayments, local.cotisationPayments),
    transitions: mergeArrayById(remote.transitions, local.transitions),
    progressions: mergeArrayById(remote.progressions, local.progressions),
    activityFinances: mergeArrayById(remote.activityFinances, local.activityFinances),
    absenceRequests: mergeArrayById(remote.absenceRequests, local.absenceRequests),
    announcements: mergeArrayById(remote.announcements, local.announcements),
    settings: Object.assign({}, remote.settings, local.settings)
  });
}

function resolveUserRoleProfile(authUser) {
  const email = String((authUser && authUser.email) || "").trim().toLowerCase();
  const overrides = (db.settings && db.settings.roleOverrides) || {};
  const matchedChef = (db.chefs || []).find((c) => c.email && c.email === email);

  let role = "cu";
  if (overrides[email] && ["cg", "financier", "cu"].includes(overrides[email])) {
    role = overrides[email];
  } else if (email.includes("financier") || email.includes("tresor")) {
    role = "financier";
  } else if (email.includes("cg") || email.includes("chefdegroupe") || email.includes("obion.cg")) {
    role = "cg";
  }

  if (matchedChef) {
    const posteLower = String(matchedChef.poste || "").toLowerCase();
    if (!overrides[email] && (posteLower.includes("chef de groupe") || posteLower === "cg")) role = "cg";
    if (!overrides[email] && (posteLower.includes("financier") || posteLower.includes("trésorier") || posteLower.includes("tresorier"))) role = "financier";
    return {
      uid: authUser.uid,
      email,
      role,
      chefId: matchedChef.id,
      chefNom: matchedChef.nom || email,
      poste: matchedChef.poste || (role === "cg" ? "Chef de Groupe" : role === "financier" ? "Financier" : "Chef d'Unité"),
      branche: role === "cu" ? normalizeBranch(matchedChef.branche || "Meute") : "Toutes"
    };
  }

  return {
    uid: authUser.uid,
    email,
    role,
    chefId: "",
    chefNom: email || (role === "cg" ? (db.settings.cg_nom || "Chef de Groupe") : role === "financier" ? "Financier" : "Chef d'Unité"),
    poste: role === "cg" ? "Chef de Groupe" : role === "financier" ? "Financier" : "Chef d'Unité",
    branche: role === "cu" ? "Meute" : "Toutes"
  };
}

function isBranchAllowedForCurrentUser(branch) {
  if (!currentUser) return false;
  if (currentUser.role !== "cu") return true;
  if (!currentUser.branche || currentUser.branche === "Toutes" || currentUser.branche === "Groupe") return true;
  return normalizeBranch(branch) === normalizeBranch(currentUser.branche);
}

function setSyncBadge(text, cls = "badge-info") {
  const el = document.getElementById("syncStatusBadge");
  if (!el) return;
  el.textContent = text;
  el.className = `badge ${cls}`;
}

function setLoginError(message) {
  const el = document.getElementById("loginError");
  if (el) el.textContent = message || "";
}

async function persistDb(actionTitle = "Mise à jour", actionDetail = "") {
  db = normalizeDbStructure(db);
  if (actionTitle) {
    db.messageLogs.unshift({
      id: uid("act"),
      dedupKey: `audit_${Date.now()}`,
      category: actionTitle,
      recipientLabel: actionDetail,
      weekKey: getIsoWeekKey(),
      sentAt: new Date().toISOString(),
      author: currentUser ? `${currentUser.chefNom} (${currentUser.role.toUpperCase()})` : "Système"
    });
    db.messageLogs = db.messageLogs.slice(0, 500);
  }

  try {
    localStorage.setItem(BACKUP_KEY, JSON.stringify(db));
  } catch (e) {}

  if (!currentUser || !currentUser.uid) return;
  const docRef = getDocRefForUser(currentUser);
  setSyncBadge("Synchronisation...", "badge-warning");
  try {
    const snap = await docRef.get();
    const finalDoc = snap.exists ? mergeDbStates(snap.data(), db) : db;
    db = finalDoc;
    localStorage.setItem(BACKUP_KEY, JSON.stringify(db));
    await docRef.set(finalDoc, { merge: true });
    setSyncBadge("Synchronisé", "badge-success");
  } catch (err) {
    setSyncBadge("Hors ligne (local)", "badge-warning");
  }
}

async function subscribeUserData(authUser) {
  if (unsubscribeDoc) {
    unsubscribeDoc();
    unsubscribeDoc = null;
  }

  let localFallback = null;
  try {
    const rawLocal = localStorage.getItem(BACKUP_KEY);
    if (rawLocal) localFallback = JSON.parse(rawLocal);
  } catch (e) {}
  if (localFallback) db = normalizeDbStructure(localFallback);

  const docRef = getDocRefForUser(authUser);
  try {
    const snap = await docRef.get();
    if (snap.exists) {
      db = localFallback ? mergeDbStates(snap.data(), localFallback) : normalizeDbStructure(snap.data());
    } else {
      await docRef.set(db);
    }
    localStorage.setItem(BACKUP_KEY, JSON.stringify(db));
    setSyncBadge("Synchronisé", "badge-success");
  } catch (e) {
    setSyncBadge("Hors ligne (local)", "badge-warning");
  }

  currentUser = resolveUserRoleProfile(authUser);

  unsubscribeDoc = docRef.onSnapshot((doc) => {
    if (!doc.exists) return;
    db = normalizeDbStructure(doc.data());
    try {
      localStorage.setItem(BACKUP_KEY, JSON.stringify(db));
    } catch (e) {}
    if (currentUser && currentUser.uid) {
      currentUser = resolveUserRoleProfile({ uid: currentUser.uid, email: currentUser.email });
    }
    setSyncBadge("Synchronisé", "badge-success");
    if (currentUser) renderAll();
  }, () => {
    setSyncBadge("Hors ligne (local)", "badge-warning");
  });
}

async function handleLogin(event) {
  event.preventDefault();
  setLoginError("");
  const email = String(document.getElementById("emailInput")?.value || "").trim();
  const password = String(document.getElementById("passwordInput")?.value || "");
  const submitBtn = event.target.querySelector('button[type="submit"]');

  if (!email || password.length < 8) {
    setLoginError("Veuillez saisir une adresse e-mail valide et un mot de passe d'au moins 8 caractères.");
    return;
  }

  if (submitBtn) submitBtn.disabled = true;
  try {
    const cred = await authDb.signInWithEmailAndPassword(email, password);
    await subscribeUserData(cred.user);
    showAppShell();
  } catch (err) {
    const code = err && err.code ? err.code : "";
    if (code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found") {
      setLoginError("Adresse e-mail ou mot de passe incorrect.");
    } else if (code === "auth/too-many-requests") {
      setLoginError("Trop de tentatives. Réessayez dans quelques instants.");
    } else if (code === "auth/network-request-failed") {
      setLoginError("Problème réseau. Vérifiez votre connexion internet.");
    } else {
      setLoginError("Connexion impossible. Vérifiez vos identifiants.");
    }
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

async function logout() {
  if (unsubscribeDoc) {
    unsubscribeDoc();
    unsubscribeDoc = null;
  }
  currentUser = null;
  try {
    await authDb.signOut();
  } catch (e) {}
  document.getElementById("appShell").style.display = "none";
  document.getElementById("loginScreen").style.display = "grid";
  const pwd = document.getElementById("passwordInput");
  if (pwd) pwd.value = "";
  setLoginError("");
}

function applyRolePermissionsUi() {
  if (!currentUser) return;
  const isCu = currentUser.role === "cu";
  const isFinancier = currentUser.role === "financier" || currentUser.role === "cg";

  document.querySelectorAll(".tab-btn").forEach((btn) => {
    const tab = btn.dataset.tab;
    if (isCu && tab === "parametres") {
      btn.style.display = "none";
    } else {
      btn.style.display = "";
    }
  });

  const activeTabBtn = document.querySelector(".tab-btn.active");
  if (activeTabBtn && activeTabBtn.style.display === "none") {
    switchTab("dashboard");
  }

  const brFilter = document.getElementById("presenceBranchFilter");
  const scBranche = document.getElementById("sc_branche");
  if (isCu && currentUser.branche && currentUser.branche !== "Toutes") {
    if (brFilter) {
      brFilter.value = currentUser.branche;
      brFilter.disabled = true;
    }
    if (scBranche) {
      scBranche.value = currentUser.branche;
      scBranche.disabled = true;
    }
  } else {
    if (brFilter) brFilter.disabled = false;
    if (scBranche) scBranche.disabled = false;
  }

  const waveBtn = document.getElementById("openWaveBusinessBtn");
  if (waveBtn) {
    waveBtn.style.display = isFinancier ? "" : "none";
  }
}

function showAppShell() {
  document.getElementById("loginScreen").style.display = "none";
  document.getElementById("appShell").style.display = "block";
  const badge = document.getElementById("userBadgeLine");
  if (badge && currentUser) {
    const scope = currentUser.role === "cu" ? ` — Unité : ${currentUser.branche}` : " — Groupe complet";
    badge.textContent = `${currentUser.chefNom} (${currentUser.poste})${scope}`;
  }
  applyRolePermissionsUi();
  renderAll();
}

function switchTab(tabName) {
  if (currentUser && currentUser.role === "cu" && tabName === "parametres") {
    tabName = "dashboard";
  }
  document.querySelectorAll(".tab-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.tab === tabName);
  });
  document.querySelectorAll(".tab-panel").forEach((p) => {
    p.classList.toggle("active", p.id === `tab-${tabName}`);
  });
  if (tabName === "gestion") {
    renderAdvancedModules();
  }
}

function toggleActionCenter() {
  const box = document.getElementById("smartRemindersBox");
  if (!box) return;
  box.style.display = box.style.display === "none" ? "block" : "none";
}

// --- DATES, SEMAINES & ANTI-DOUBLON ---
function getIsoWeekKey(dateInput = new Date()) {
  const d = new Date(dateInput);
  if (Number.isNaN(d.getTime())) return "";
  const utc = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((utc - yearStart) / 86400000) + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function daysUntilDate(dateStr) {
  if (!dateStr) return null;
  const target = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target - today) / 86400000);
}

function findRecentMessageLog(dedupKey, maxDays = 7) {
  const currentWeek = getIsoWeekKey();
  const nowMs = Date.now();
  return (db.messageLogs || []).find((entry) => {
    if (!entry || entry.dedupKey !== dedupKey) return false;
    if (entry.weekKey === currentWeek) return true;
    const sentMs = new Date(entry.sentAt || 0).getTime();
    if (!Number.isNaN(sentMs)) {
      return (nowMs - sentMs) / 86400000 <= maxDays;
    }
    return false;
  }) || null;
}

function getMessageStatusBadge(dedupKey) {
  const recent = findRecentMessageLog(dedupKey, 7);
  if (!recent) return `<span class="badge badge-info">Non envoyé cette sem.</span>`;
  const dayStr = String(recent.sentAt || "").slice(0, 10);
  return `<span class="badge badge-success" title="Envoyé le ${escapeHtml(dayStr)}">✓ Envoyé (${escapeHtml(dayStr)})</span>`;
}

function openWhatsAppUrl(phoneRaw, messageText) {
  const digits = normalizeWaPhone(phoneRaw);
  const encoded = encodeURIComponent(String(messageText || "").trim());
  if (!encoded) return;
  const url = digits ? `https://wa.me/${digits}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

async function sendTrackedWhatsAppMessage({
  phoneRaw,
  messageText,
  dedupKey,
  category,
  recipientLabel
}) {
  const existing = dedupKey ? findRecentMessageLog(dedupKey, 7) : null;
  if (existing) {
    const sentDate = String(existing.sentAt || "").slice(0, 10);
    const ok = confirm(
      `Un message a déjà été envoyé pour "${recipientLabel || category}" cette semaine (${sentDate}).\n\nVoulez-vous vraiment renvoyer ce message ?`
    );
    if (!ok) return false;
  }

  openWhatsAppUrl(phoneRaw, messageText);

  db.messageLogs.unshift({
    id: uid("msg"),
    dedupKey: dedupKey || `msg_${Date.now()}`,
    category: category || "Message WhatsApp",
    recipientLabel: recipientLabel || "",
    weekKey: getIsoWeekKey(),
    sentAt: new Date().toISOString(),
    author: currentUser ? `${currentUser.chefNom} (${currentUser.role.toUpperCase()})` : "Système"
  });
  await persistDb("Message WhatsApp préparé", `${category} — ${recipientLabel}`);
  renderAll();
  return true;
}

// --- EFFECTIFS, MATRICULE, TENUE & PRÉSENCES ---
async function addScout(event) {
  event.preventDefault();
  const branchVal = (currentUser && currentUser.role === "cu" && currentUser.branche && currentUser.branche !== "Toutes")
    ? currentUser.branche
    : document.getElementById("sc_branche").value;
  const matriculeVal = document.getElementById("sc_matricule").value.trim();

  const scout = {
    id: uid("sc"),
    prenom: document.getElementById("sc_prenom").value.trim(),
    nom: document.getElementById("sc_nom").value.trim(),
    matricule: matriculeVal,
    cotisationNationalePayee: Boolean(matriculeVal),
    branche: normalizeBranch(branchVal),
    parent_nom: document.getElementById("sc_parent_nom").value.trim(),
    parent_tel: document.getElementById("sc_parent_tel").value.trim(),
    parent_tel2: "",
    allergies: document.getElementById("sc_allergies").value.trim(),
    tenue: document.getElementById("sc_tenue")?.value || "aucune",
    dob: "",
    address: "",
    docs: "",
    notes: ""
  };
  db.scouts.push(scout);
  event.target.reset();
  if (currentUser && currentUser.role === "cu" && currentUser.branche) {
    document.getElementById("sc_branche").value = currentUser.branche;
  }
  await persistDb("Ajout jeune", `${scout.prenom} ${scout.nom} (${scout.branche})`);
  renderAll();
}

async function updateScoutTenue(scoutId, tenueVal) {
  const scout = (db.scouts || []).find((s) => s.id === scoutId);
  if (!scout || !isBranchAllowedForCurrentUser(scout.branche)) return;
  scout.tenue = ["aucune", "confection", "partielle", "complete"].includes(tenueVal) ? tenueVal : "aucune";
  await persistDb("Mise à jour tenue", `${scout.prenom} ${scout.nom} -> ${TENUE_LABELS[scout.tenue]}`);
  renderAll();
}

async function toggleNationalFeeAndMatricule(scoutId) {
  const scout = (db.scouts || []).find((s) => s.id === scoutId);
  if (!scout) return;
  const canManageMatricule = currentUser && (currentUser.role === "financier" || currentUser.role === "cg");
  if (!canManageMatricule) {
    alert("Seul le Financier (ou le CG) peut valider la cotisation nationale et affecter un numéro de matricule.");
    return;
  }

  if (!scout.cotisationNationalePayee) {
    scout.cotisationNationalePayee = true;
    const matInput = prompt(
      `Cotisation nationale validée pour ${scout.prenom} ${scout.nom}.\n\nSaisissez le numéro de matricule à affecter (ou laissez vide pour saisir plus tard) :`,
      scout.matricule || ""
    );
    if (matInput !== null) {
      scout.matricule = String(matInput).trim();
    }
    await persistDb("Cotisation nationale payée", `${scout.prenom} ${scout.nom} — Matricule : ${scout.matricule || "à attribuer"}`);
  } else {
    const newMat = prompt(
      `Modifier le matricule de ${scout.prenom} ${scout.nom} (ou laisser vide) :`,
      scout.matricule || ""
    );
    if (newMat !== null) {
      scout.matricule = String(newMat).trim();
      await persistDb("Affectation matricule", `${scout.prenom} ${scout.nom} -> ${scout.matricule || "aucun"}`);
    }
  }
  renderAll();
}

async function markPresence(scoutId, status) {
  const scout = (db.scouts || []).find((s) => s.id === scoutId);
  if (!scout || !isBranchAllowedForCurrentUser(scout.branche)) return;

  const dateStr = document.getElementById("presenceDateInput")?.value || new Date().toISOString().slice(0, 10);
  const existingIdx = db.presences.findIndex((p) => p.scoutId === scoutId && p.date === dateStr);
  const entry = {
    id: existingIdx >= 0 ? db.presences[existingIdx].id : uid("pr"),
    scoutId,
    date: dateStr,
    status
  };
  if (existingIdx >= 0) db.presences[existingIdx] = entry;
  else db.presences.push(entry);

  await persistDb("Pointage présence", `${scout.prenom} ${scout.nom} : ${status} (${dateStr})`);
  renderAll();
}

function getConsecutiveAbsences(scoutId) {
  const records = (db.presences || [])
    .filter((p) => p.scoutId === scoutId)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));

  let streak = 0;
  for (let i = records.length - 1; i >= 0; i--) {
    if (records[i].status === "absent") streak++;
    else break;
  }
  return streak;
}

function sendParentMeetingInvitation(scoutId) {
  const scout = (db.scouts || []).find((s) => s.id === scoutId);
  if (!scout || !isBranchAllowedForCurrentUser(scout.branche)) return;
  const streak = getConsecutiveAbsences(scoutId);
  const cgNom = db.settings.cg_nom || "Chef de Groupe Obion";
  const salutation = scout.parent_nom ? `Bonjour ${scout.parent_nom}` : "Chers parents";

  const msg = [
    `${salutation} (*Groupe OBION*),`,
    "",
    `Nous avons remarqué *${streak} absences consécutives* de *${scout.prenom} ${scout.nom}* (${scout.branche}) à nos réunions/activités.`,
    "Nous souhaitons organiser une *rencontre avec vous* afin de faire le point avec bienveillance et veiller au bon accompagnement de votre enfant.",
    "\nMerci de nous indiquer vos disponibilités cette semaine.",
    `\n*${cgNom}* — Groupe OBION`
  ].join("\n");

  sendTrackedWhatsAppMessage({
    phoneRaw: scout.parent_tel || scout.parent_tel2,
    messageText: msg,
    dedupKey: `rencontre_parents__${scout.id}`,
    category: "Proposition rencontre parents (3 absences)",
    recipientLabel: `${scout.prenom} ${scout.nom} (${scout.branche})`
  });
}

async function markParentMeetingDone(scoutId) {
  const scout = (db.scouts || []).find((s) => s.id === scoutId);
  if (!scout || !isBranchAllowedForCurrentUser(scout.branche)) return;
  db.parentMeetingsDone[scoutId] = new Date().toISOString().slice(0, 10);
  await persistDb("Rencontre parents effectuée", `${scout.prenom} ${scout.nom}`);
  renderAll();
}

function renderTenueSummary(visibleScouts) {
  const box = document.getElementById("tenueSummaryBox");
  if (!box) return;
  const counts = { complete: 0, confection: 0, partielle: 0, aucune: 0 };
  (visibleScouts || []).forEach((s) => {
    const st = counts[s.tenue] !== undefined ? s.tenue : "aucune";
    counts[st] += 1;
  });

  box.innerHTML = `
    <div class="stats-grid tenue-stats">
      <div class="stat-box"><div class="muted small">Tenue complète</div><div class="stat-value">${counts.complete}</div></div>
      <div class="stat-box"><div class="muted small">En confection</div><div class="stat-value">${counts.confection}</div></div>
      <div class="stat-box"><div class="muted small">Incomplète / partielle</div><div class="stat-value">${counts.partielle}</div></div>
      <div class="stat-box"><div class="muted small">Pas encore acquise</div><div class="stat-value">${counts.aucune}</div></div>
    </div>
  `;
}

function renderEffectifsAndPresences() {
  const box = document.getElementById("scoutsListBox");
  if (!box) return;
  const dateStr = document.getElementById("presenceDateInput")?.value || new Date().toISOString().slice(0, 10);
  const branchFilter = (currentUser && currentUser.role === "cu" && currentUser.branche && currentUser.branche !== "Toutes")
    ? currentUser.branche
    : (document.getElementById("presenceBranchFilter")?.value || "Toutes");

  const list = (db.scouts || []).filter((s) => {
    if (!isBranchAllowedForCurrentUser(s.branche)) return false;
    if (branchFilter !== "Toutes" && normalizeBranch(s.branche) !== normalizeBranch(branchFilter)) return false;
    return true;
  });

  renderTenueSummary(list);

  if (!list.length) {
    box.innerHTML = `<p class="muted">Aucun jeune enregistré pour ce filtre.</p>`;
    return;
  }

  const canManageMatricule = currentUser && (currentUser.role === "financier" || currentUser.role === "cg");

  box.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Jeune</th>
            <th>Branche</th>
            <th>Cot. nationale &amp; Matricule</th>
            <th>Tenue</th>
            <th>Absence suite</th>
            <th>Statut (${escapeHtml(dateStr)})</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${list.map((s) => {
            const p = db.presences.find((x) => x.scoutId === s.id && x.date === dateStr);
            const streak = getConsecutiveAbsences(s.id);
            const meetingDone = Boolean(db.parentMeetingsDone[s.id]);
            const tenueBadgeCls = s.tenue === "complete"
              ? "badge-success"
              : (s.tenue === "confection" || s.tenue === "partielle" ? "badge-info" : "badge-warning");

            return `
              <tr>
                <td>
                  <strong>${escapeHtml(s.prenom)} ${escapeHtml(s.nom)}</strong>
                  ${s.parent_nom ? `<br><span class="small muted">Parent : ${escapeHtml(s.parent_nom)}</span>` : ""}
                  ${s.allergies ? `<br><span class="small muted">Santé : ${escapeHtml(s.allergies)}</span>` : ""}
                </td>
                <td>${escapeHtml(s.branche)}</td>
                <td>
                  ${s.cotisationNationalePayee
                    ? `<span class="badge badge-success">Cot. nat. payée</span>`
                    : `<span class="badge badge-warning">Cot. nat. en attente</span>`}
                  <div class="small mt-2">Matricule : <strong>${escapeHtml(s.matricule || "Non attribué")}</strong></div>
                  ${canManageMatricule
                    ? `<button type="button" class="btn btn-sm btn-secondary mt-2" onclick="toggleNationalFeeAndMatricule('${s.id}')">${s.cotisationNationalePayee ? "Modifier matricule" : "Valider cot. nat. & matricule"}</button>`
                    : ""}
                </td>
                <td>
                  <span class="badge ${tenueBadgeCls}">${escapeHtml(TENUE_LABELS[s.tenue] || TENUE_LABELS.aucune)}</span>
                  <select class="tenue-select mt-2" aria-label="Tenue de ${escapeHtml(s.prenom)} ${escapeHtml(s.nom)}" onchange="updateScoutTenue('${s.id}', this.value)">
                    <option value="aucune" ${s.tenue === "aucune" ? "selected" : ""}>Pas encore / non acquise</option>
                    <option value="confection" ${s.tenue === "confection" ? "selected" : ""}>En confection</option>
                    <option value="partielle" ${s.tenue === "partielle" ? "selected" : ""}>Incomplète / partielle</option>
                    <option value="complete" ${s.tenue === "complete" ? "selected" : ""}>Tenue complète</option>
                  </select>
                </td>
                <td>
                  ${streak >= 3 && !meetingDone
                    ? `<span class="badge badge-warning">${streak} abs. de suite — Rencontre parents</span>`
                    : `<span class="badge badge-info">${streak} abs.</span>`}
                </td>
                <td>${p ? escapeHtml(p.status) : "Non pointé"}</td>
                <td>
                  <div class="actions-row">
                    <button type="button" class="btn btn-sm btn-success" onclick="markPresence('${s.id}', 'present')">Présent</button>
                    <button type="button" class="btn btn-sm btn-danger" onclick="markPresence('${s.id}', 'absent')">Absent</button>
                    ${streak >= 3 && !meetingDone
                      ? `<button type="button" class="btn btn-sm btn-info" onclick="sendParentMeetingInvitation('${s.id}')">Rencontre</button>`
                      : ""}
                  </div>
                </td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    </div>
  `;
}

// --- COTISATIONS, WAVE BUSINESS & REÇUS ---
function openWaveBusinessLink() {
  const url = String((db.settings && db.settings.wave_url) || "").trim();
  if (!url) {
    alert("Aucun lien Wave Business n'est encore configuré dans les Paramètres.");
    return;
  }
  if (!/^https?:\/\//i.test(url)) {
    alert("Le lien Wave Business enregistré doit commencer par https:// ou http://.");
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

async function addCustomCotisation() {
  const label = document.getElementById("newCustomCotLabel").value.trim();
  const montant = Number(document.getElementById("newCustomCotAmount").value || 0);
  if (!label) return;
  db.cotisationsCustom.push({ id: uid("cot"), label, montant });
  document.getElementById("newCustomCotLabel").value = "";
  document.getElementById("newCustomCotAmount").value = "";
  await persistDb("Création cotisation", `${label} (${formatMoney(montant)})`);
  renderAll();
}

function getCotisationMeta(cotType) {
  if (cotType === "annuelle") {
    return {
      id: "annuelle",
      label: "Cotisation annuelle",
      montant: Number(db.settings.cot_annuelle_j || 2500)
    };
  }
  if (cotType === "mensuelle") {
    return {
      id: "mensuelle",
      label: "Cotisation mensuelle",
      montant: Number(db.settings.cot_mensuelle_j || 500)
    };
  }
  const custom = (db.cotisationsCustom || []).find((c) => c.id === cotType);
  return custom || { id: cotType, label: "Cotisation", montant: 0 };
}

async function toggleCotisationPayment(memberId, kind, cotId) {
  const key = `${kind}__${memberId}__${cotId}`;
  const isPaid = Boolean(db.cotisationPayments[key]);
  db.cotisationPayments[key] = !isPaid;

  const meta = getCotisationMeta(cotId);
  if (!isPaid && meta.montant > 0) {
    db.finances.unshift({
      id: uid("fin"),
      date: new Date().toISOString().slice(0, 10),
      type: "recette",
      libelle: `${meta.label} (${memberId})`,
      montant: meta.montant
    });
  }
  await persistDb("Paiement cotisation", `${key} -> ${!isPaid ? "Payée" : "Non payée"}`);
  renderAll();
}

function sendCotisationReminderWhatsApp(memberId, kind, cotId) {
  const meta = getCotisationMeta(cotId);
  const wantWave = Boolean(document.getElementById("includeWaveInReminder")?.checked);
  const waveUrl = String(db.settings.wave_url || "").trim();
  const cgNom = db.settings.cg_nom || "Chef de Groupe Obion";

  let nom = "";
  let branche = "";
  let matriculeTxt = "";
  let phone = "";
  let salutation = "Chers parents";

  if (kind === "chef") {
    const chef = (db.chefs || []).find((c) => c.id === memberId);
    if (!chef) return;
    nom = chef.nom;
    branche = chef.branche || "Groupe";
    phone = chef.tel || "";
    salutation = `Bonjour ${chef.nom}`;
  } else {
    const scout = (db.scouts || []).find((s) => s.id === memberId);
    if (!scout || !isBranchAllowedForCurrentUser(scout.branche)) return;
    nom = `${scout.prenom} ${scout.nom}`;
    branche = scout.branche || "-";
    matriculeTxt = cotId === "annuelle" && scout.matricule ? ` (Matricule : *${scout.matricule}*)` : "";
    phone = scout.parent_tel || scout.parent_tel2 || "";
    salutation = scout.parent_nom ? `Bonjour ${scout.parent_nom}` : "Chers parents";
  }

  const lines = [
    `${salutation} (*Groupe OBION*),`,
    "",
    `Rappel amical concernant *${meta.label}* de *${nom}* (${branche})${matriculeTxt}.`,
    meta.montant > 0 ? `Montant : *${formatMoney(meta.montant)}*.` : "",
    wantWave && waveUrl ? `\n🌊 Lien Wave Business : ${waveUrl}` : "",
    "\n📸 Merci de nous envoyer une *capture d'écran de confirmation* si possible après paiement afin que nous puissions valider votre règlement.",
    "\nMerci pour votre soutien.",
    `*${cgNom}* — Groupe OBION`
  ].filter(Boolean);

  sendTrackedWhatsAppMessage({
    phoneRaw: phone,
    messageText: lines.join("\n"),
    dedupKey: `relance_cot__${cotId}__${kind}__${memberId}`,
    category: `Relance ${meta.label}`,
    recipientLabel: `${nom} (${branche})`
  });
}

function renderCotisationsSuivi() {
  const box = document.getElementById("cotisationsTableBox");
  const typeSel = document.getElementById("cotTypeSelect");
  const groupSel = document.getElementById("cotTargetGroupSelect");
  if (!box || !typeSel || !groupSel) return;

  const baseValues = ["annuelle", "mensuelle"];
  Array.from(typeSel.options).forEach((opt) => {
    if (!baseValues.includes(opt.value)) opt.remove();
  });
  (db.cotisationsCustom || []).forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c.id;
    opt.textContent = `${c.label} (${formatMoney(c.montant)})`;
    typeSel.appendChild(opt);
  });

  const activeCotId = typeSel.value || "annuelle";
  const targetGroup = groupSel.value || "all";

  const rows = [];
  if (targetGroup === "all" || targetGroup === "scout") {
    (db.scouts || []).filter((s) => isBranchAllowedForCurrentUser(s.branche)).forEach((s) => {
      rows.push({
        id: s.id,
        kind: "scout",
        nom: `${s.prenom} ${s.nom}`,
        roleLabel: "Jeune",
        branche: s.branche || "-",
        matricule: activeCotId === "annuelle" ? (s.matricule || "Sans matricule") : "-"
      });
    });
  }
  if (targetGroup === "all" || targetGroup === "chef") {
    if (!(currentUser && currentUser.role === "cu")) {
      (db.chefs || []).forEach((c) => {
        rows.push({
          id: c.id,
          kind: "chef",
          nom: c.nom,
          roleLabel: c.poste || "Chef d'Unité",
          branche: c.branche || "Groupe",
          matricule: "-"
        });
      });
    }
  }

  if (!rows.length) {
    box.innerHTML = `<p class="muted">Aucun membre à afficher.</p>`;
    return;
  }

  box.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Membre</th>
            <th>Profil / Poste</th>
            <th>Branche</th>
            <th>Matricule</th>
            <th>Statut</th>
            <th>Suivi message</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((r) => {
            const paid = Boolean(db.cotisationPayments[`${r.kind}__${r.id}__${activeCotId}`]);
            const dedupKey = `relance_cot__${activeCotId}__${r.kind}__${r.id}`;
            return `
              <tr>
                <td><strong>${escapeHtml(r.nom)}</strong></td>
                <td>${escapeHtml(r.roleLabel)}</td>
                <td>${escapeHtml(r.branche)}</td>
                <td>${escapeHtml(r.matricule)}</td>
                <td>${paid ? `<span class="badge badge-success">Payée</span>` : `<span class="badge badge-warning">Non payée</span>`}</td>
                <td>${getMessageStatusBadge(dedupKey)}</td>
                <td>
                  <div class="actions-row">
                    <button type="button" class="btn btn-sm ${paid ? "btn-secondary" : "btn-success"}" onclick="toggleCotisationPayment('${r.id}', '${r.kind}', '${activeCotId}')">
                      ${paid ? "Annuler" : "Marquer payée"}
                    </button>
                    ${!paid ? `<button type="button" class="btn btn-sm btn-info" onclick="sendCotisationReminderWhatsApp('${r.id}', '${r.kind}', '${activeCotId}')">Relancer</button>` : ""}
                  </div>
                </td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    </div>
  `;
}

// --- CACHET NUMÉRIQUE DU CHEF DE GROUPE & REÇUS ---
function buildDigitalStampHtml(dateLabel = "") {
  const cgNom = db.settings.cg_nom || "Chef de Groupe Obion";
  const cgTel = db.settings.cg_tel || "";
  const dt = dateLabel || new Date().toISOString().slice(0, 10);
  return `
    <div class="digital-stamp" aria-label="Cachet numérique du Chef de Groupe">
      <div>
        <div>GROUPE OBION</div>
        <div>CHEF DE GROUPE</div>
        <div>${escapeHtml(cgNom)}</div>
        ${cgTel ? `<div>${escapeHtml(cgTel)}</div>` : ""}
        <div>${escapeHtml(dt)}</div>
      </div>
    </div>
  `;
}

function populateReceiptScoutSelect() {
  const sel = document.getElementById("rc_scout");
  if (!sel) return;
  const current = sel.value;
  const visibleScouts = (db.scouts || []).filter((s) => isBranchAllowedForCurrentUser(s.branche));
  sel.innerHTML = `<option value="">-- Sélectionner un jeune (optionnel) --</option>` +
    visibleScouts.map((s) => `<option value="${escapeHtml(s.id)}">${escapeHtml(s.prenom)} ${escapeHtml(s.nom)} (${escapeHtml(s.branche)})</option>`).join("");
  sel.value = current;
}

function prefillReceiptFromScout() {
  const id = document.getElementById("rc_scout")?.value;
  const scout = (db.scouts || []).find((s) => s.id === id);
  if (!scout) return;
  document.getElementById("rc_detail").value = `${scout.prenom} ${scout.nom} — ${scout.branche}${scout.matricule ? ` (Mat: ${scout.matricule})` : ""}`;
}

function generateReceipt(event) {
  event.preventDefault();
  const scoutId = document.getElementById("rc_scout").value;
  const scout = (db.scouts || []).find((s) => s.id === scoutId);
  const numero = document.getElementById("rc_numero").value.trim() || `OBN-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`;
  const date = document.getElementById("rc_date").value || new Date().toISOString().slice(0, 10);
  const montant = Number(document.getElementById("rc_montant").value || 0);
  const motif = document.getElementById("rc_motif").value.trim();
  const detail = document.getElementById("rc_detail").value.trim();
  const cgNom = db.settings.cg_nom || "Chef de Groupe Obion";

  const beneficiaire = scout ? `${scout.prenom} ${scout.nom} (${scout.branche})` : (detail || "Membre Groupe OBION");

  const htmlCard = `
    <div class="print-document">
      <strong>GROUPE OBION — REÇU OFFICIEL</strong><br>
      <span class="small muted">N° : ${escapeHtml(numero)} | Date : ${escapeHtml(date)}</span>
      <hr class="mt-2" />
      <p><strong>Reçu de :</strong> ${escapeHtml(beneficiaire)}</p>
      ${scout && scout.matricule ? `<p><strong>Matricule :</strong> ${escapeHtml(scout.matricule)}</p>` : ""}
      <p><strong>Motif :</strong> ${escapeHtml(motif)}</p>
      ${detail ? `<p><strong>Détails :</strong> ${escapeHtml(detail)}</p>` : ""}
      <p><strong>Montant encaissé :</strong> ${escapeHtml(formatMoney(montant))}</p>
      <p class="small muted mt-2">Validé par : ${escapeHtml(cgNom)}</p>
      <div class="print-signature">${buildDigitalStampHtml(date)}</div>
    </div>
  `;

  document.getElementById("printableReceiptCard").innerHTML = htmlCard;
  lastReceiptText = [
    `N° Reçu : *${numero}*`,
    `Date : ${date}`,
    `Membre : *${beneficiaire}*`,
    scout && scout.matricule ? `Matricule : ${scout.matricule}` : "",
    `Motif : ${motif}`,
    `Montant : *${formatMoney(montant)}*`
  ].filter(Boolean).join("\n");
}

function triggerPrintHtml(htmlContent) {
  const overlay = document.getElementById("printOverlay");
  if (!overlay) return;
  overlay.innerHTML = htmlContent;
  window.print();
}

function printReceiptCard() {
  const card = document.getElementById("printableReceiptCard");
  if (!card || !card.innerHTML.trim()) return;
  triggerPrintHtml(card.innerHTML);
}

function sendCurrentReceiptByWhatsApp() {
  const scoutId = document.getElementById("rc_scout")?.value || "";
  const scout = (db.scouts || []).find((s) => s.id === scoutId);
  const cgNom = db.settings.cg_nom || "Chef de Groupe Obion";
  const body = lastReceiptText || document.getElementById("printableReceiptCard")?.innerText || "";
  if (!body.trim()) return;

  const msg = `🧾 *REÇU OFFICIEL — GROUPE OBION*\n\n${body}\n\nCachet numérique : *${cgNom}* — Groupe OBION`;
  sendTrackedWhatsAppMessage({
    phoneRaw: scout ? (scout.parent_tel || scout.parent_tel2) : "",
    messageText: msg,
    dedupKey: `recu_wa__${scoutId || "libre"}__${Date.now().toString().slice(-5)}`,
    category: "Envoi reçu WhatsApp",
    recipientLabel: scout ? `${scout.prenom} ${scout.nom}` : "Reçu"
  });
}

// --- ACTIVITÉS, RAPPELS CU & PROGRAMME ---
async function addActivity(event) {
  event.preventDefault();
  const act = {
    id: uid("act"),
    titre: document.getElementById("act_titre").value.trim(),
    date: document.getElementById("act_date").value,
    date_limite_paiement: document.getElementById("act_deadline").value,
    branche: document.getElementById("act_branche").value,
    lieu: document.getElementById("act_lieu").value.trim(),
    forCu: Boolean(document.getElementById("act_for_cu").checked)
  };
  db.activites.push(act);
  event.target.reset();
  await persistDb("Nouvelle activité", `${act.titre} (${act.date})`);
  renderAll();
}

async function acknowledgeCuActivity(activityId) {
  const ackKey = `${activityId}__${currentUser && currentUser.chefId ? currentUser.chefId : (currentUser && currentUser.uid ? currentUser.uid : "cu")}`;
  db.cuAckLogs[ackKey] = new Date().toISOString().slice(0, 10);
  await persistDb("Accusé réception activité CU", activityId);
  renderAll();
}

function remindCuForActivity(activityId) {
  const act = (db.activites || []).find((a) => a.id === activityId);
  if (!act) return;
  const targets = (db.chefs || []).filter((c) => !act.branche || act.branche === "Toutes" || normalizeBranch(c.branche) === normalizeBranch(act.branche));
  const firstPhone = targets.find((c) => c.tel)?.tel || "";
  const cgNom = db.settings.cg_nom || "Chef de Groupe Obion";

  const msg = [
    `🔔 *RAPPEL ACTIVITÉ / RÉUNION — GROUPE OBION*`,
    "",
    `Activité : *${act.titre}*`,
    `📅 Date : *${act.date}*`,
    act.lieu ? `📍 Lieu : *${act.lieu}*` : "",
    act.branche && act.branche !== "Toutes" ? `Branche : ${act.branche}` : "",
    "\nMerci de confirmer votre disponibilité / présence.",
    `*${cgNom}*`
  ].filter(Boolean).join("\n");

  sendTrackedWhatsAppMessage({
    phoneRaw: firstPhone,
    messageText: msg,
    dedupKey: `rappel_cu_act__${act.id}`,
    category: "Rappel activité CU",
    recipientLabel: `${act.titre} (${act.branche})`
  });
}

async function addProgramEvent(event) {
  event.preventDefault();
  const ev = {
    id: uid("prog"),
    titre: document.getElementById("prog_titre").value.trim(),
    date: document.getElementById("prog_date").value,
    rappelJoursAvant: Number(document.getElementById("prog_rappel_jours").value || 7),
    branche: document.getElementById("prog_branche").value,
    details: document.getElementById("prog_details").value.trim()
  };
  db.programmeEvents.push(ev);
  event.target.reset();
  document.getElementById("prog_rappel_jours").value = "7";
  await persistDb("Ajout programme", `${ev.titre} (${ev.date})`);
  renderAll();
}

function sendProgramInfoToParents(eventId) {
  const ev = (db.programmeEvents || []).find((e) => e.id === eventId);
  if (!ev) return;
  const cgNom = db.settings.cg_nom || "Chef de Groupe Obion";
  const targetScout = (db.scouts || []).find((s) => isBranchAllowedForCurrentUser(s.branche) && (!ev.branche || ev.branche === "Toutes" || normalizeBranch(s.branche) === normalizeBranch(ev.branche)));

  const msg = [
    `Bonjour chers parents (*Groupe OBION*),`,
    "",
    `Information au programme : *${ev.titre}*`,
    `📅 Date : *${ev.date}*`,
    ev.branche && ev.branche !== "Toutes" ? `Branche : *${ev.branche}*` : "",
    ev.details ? `\nℹ️ ${ev.details}` : "",
    "\nMerci pour votre accompagnement.",
    `*${cgNom}* — Groupe OBION`
  ].filter(Boolean).join("\n");

  sendTrackedWhatsAppMessage({
    phoneRaw: targetScout ? (targetScout.parent_tel || targetScout.parent_tel2) : "",
    messageText: msg,
    dedupKey: `prog_info__${ev.id}`,
    category: "Info programme parents",
    recipientLabel: `${ev.titre} (${ev.branche})`
  });
}

function renderActivitiesAndProgram() {
  const actBox = document.getElementById("activitiesListBox");
  const progBox = document.getElementById("programListBox");

  if (actBox) {
    const visibleActs = (db.activites || []).filter((a) => !a.branche || a.branche === "Toutes" || isBranchAllowedForCurrentUser(a.branche));
    if (!visibleActs.length) {
      actBox.innerHTML = `<p class="muted">Aucune activité enregistrée.</p>`;
    } else {
      actBox.innerHTML = visibleActs.map((a) => {
        const dLeft = daysUntilDate(a.date);
        const ackKey = `${a.id}__${currentUser && currentUser.chefId ? currentUser.chefId : (currentUser && currentUser.uid ? currentUser.uid : "cu")}`;
        const isAck = Boolean(db.cuAckLogs[ackKey]);
        return `
          <div class="alert-item ${a.forCu && dLeft !== null && dLeft <= 2 && dLeft >= 0 ? "alert-warning" : "alert-info"}">
            <div>
              <strong>${escapeHtml(a.titre)}</strong> — <span class="small">${escapeHtml(a.date)} (${escapeHtml(a.branche)})</span><br>
              <span class="small muted">${escapeHtml(a.lieu || "Lieu à préciser")}${a.forCu ? " • Signal CU actif" : ""}</span>
            </div>
            <div class="actions-row">
              ${a.forCu ? `<button type="button" class="btn btn-sm btn-info" onclick="remindCuForActivity('${a.id}')">Rappel CU</button>` : ""}
              ${a.forCu && currentUser && currentUser.role === "cu"
                ? `<button type="button" class="btn btn-sm ${isAck ? "btn-secondary" : "btn-success"}" onclick="acknowledgeCuActivity('${a.id}')">${isAck ? "✓ Vu" : "Accuser réception"}</button>`
                : ""}
            </div>
          </div>
        `;
      }).join("");
    }
  }

  if (progBox) {
    const visibleProgs = (db.programmeEvents || []).filter((ev) => !ev.branche || ev.branche === "Toutes" || isBranchAllowedForCurrentUser(ev.branche));
    if (!visibleProgs.length) {
      progBox.innerHTML = `<p class="muted">Aucun événement dans le programme.</p>`;
    } else {
      progBox.innerHTML = visibleProgs.map((ev) => {
        const dedupKey = `prog_info__${ev.id}`;
        return `
          <div class="alert-item alert-info">
            <div>
              <strong>${escapeHtml(ev.titre)}</strong> — <span class="small">${escapeHtml(ev.date)} (${escapeHtml(ev.branche)})</span><br>
              <span class="small muted">${escapeHtml(ev.details || "")}</span>
            </div>
            <div class="actions-row">
              ${getMessageStatusBadge(dedupKey)}
              <button type="button" class="btn btn-sm btn-primary" onclick="sendProgramInfoToParents('${ev.id}')">Info parents</button>
            </div>
          </div>
        `;
      }).join("");
    }
  }
}

// --- ONGLET INFOS PARENTS ---
function prepareParentBroadcast(event) {
  event.preventDefault();
  const titre = String(document.getElementById("parent_msg_titre")?.value || "").trim();
  const brancheRaw = String(document.getElementById("parent_msg_branche")?.value || "Toutes");
  const dateStr = String(document.getElementById("parent_msg_date")?.value || "").trim();
  const contenu = String(document.getElementById("parent_msg_contenu")?.value || "").trim();
  const cgNom = db.settings.cg_nom || "Chef de Groupe Obion";

  const targets = (db.scouts || []).filter((s) => {
    if (!isBranchAllowedForCurrentUser(s.branche)) return false;
    if (brancheRaw !== "Toutes" && normalizeBranch(s.branche) !== normalizeBranch(brancheRaw)) return false;
    return true;
  });

  preparedParentMessages = targets.map((s) => {
    const salutation = s.parent_nom ? `Bonjour ${s.parent_nom}` : "Bonjour chers parents";
    const text = [
      `${salutation} (*Groupe OBION*),`,
      "",
      `*${titre}*`,
      dateStr ? `📅 Date : *${dateStr}*` : "",
      `Branche : *${s.branche}* (Jeune : ${s.prenom} ${s.nom})`,
      `\n${contenu}`,
      `\n*${cgNom}* — Groupe OBION`
    ].filter(Boolean).join("\n");

    return {
      scoutId: s.id,
      scoutName: `${s.prenom} ${s.nom}`,
      branch: s.branche,
      parentName: s.parent_nom || "Parent / Tuteur",
      phone: s.parent_tel || s.parent_tel2 || "",
      text,
      dedupKey: `parent_info__${s.id}__${getIsoWeekKey()}`
    };
  });

  renderParentBroadcastRecipients();
}

function sendPreparedParentMessage(index) {
  const item = preparedParentMessages[index];
  if (!item) return;
  sendTrackedWhatsAppMessage({
    phoneRaw: item.phone,
    messageText: item.text,
    dedupKey: item.dedupKey,
    category: "Information parent WhatsApp",
    recipientLabel: `${item.parentName} — ${item.scoutName} (${item.branch})`
  });
}

function renderParentBroadcastRecipients() {
  const listEl = document.getElementById("parentMessageRecipients");
  const countEl = document.getElementById("parentMessageCount");
  if (!listEl || !countEl) return;

  if (!preparedParentMessages.length) {
    countEl.textContent = "Aucun message préparé";
    listEl.innerHTML = `<p class="muted">Prépare un message pour afficher la liste des parents concernés.</p>`;
    return;
  }

  countEl.textContent = `${preparedParentMessages.length} parent(s) prêt(s)`;
  listEl.innerHTML = preparedParentMessages.map((m, idx) => `
    <div class="recipient-row">
      <div class="recipient-index">${idx + 1}</div>
      <div class="recipient-info">
        <strong>${escapeHtml(m.parentName)} — ${escapeHtml(m.scoutName)} (${escapeHtml(m.branch)})</strong>
        <span>${escapeHtml(m.phone || "Numéro non renseigné")} • ${getMessageStatusBadge(m.dedupKey)}</span>
      </div>
      <button type="button" class="btn btn-sm btn-whatsapp" onclick="sendPreparedParentMessage(${idx})">Ouvrir WhatsApp</button>
    </div>
  `).join("");
}

// --- BANDEAU CENTRALISÉ "À TRAITER MAINTENANT" ---
function renderSmartRemindersPanel() {
  const box = document.getElementById("smartRemindersBox");
  if (!box) return;
  const alerts = [];

  if (db.settings.cot_nationale_deadline) {
    const dLeft = daysUntilDate(db.settings.cot_nationale_deadline);
    if (dLeft !== null && dLeft <= 14 && dLeft >= -3) {
      alerts.push({
        cls: "alert-warning",
        title: "Cotisation nationale — Échéance proche (J-14)",
        detail: `Limite fixée le ${db.settings.cot_nationale_deadline} (${dLeft >= 0 ? `dans ${dLeft} j` : `dépassée de ${Math.abs(dLeft)} j`}). Pensez à relancer les familles.`,
        btnText: "Voir cotisations",
        action: "switchTab('finances')"
      });
    }
  }

  (db.activites || []).forEach((a) => {
    if (a.branche && a.branche !== "Toutes" && !isBranchAllowedForCurrentUser(a.branche)) return;
    const refDate = a.date_limite_paiement || a.date;
    const dLeft = daysUntilDate(refDate);
    if (dLeft !== null && dLeft <= 14 && dLeft >= -1) {
      alerts.push({
        cls: "alert-info",
        title: `Activité : ${a.titre} (${refDate})`,
        detail: `Échéance dans ${dLeft} jour(s). Vérifiez les règlements et rappels.`,
        btnText: "Activités",
        action: "switchTab('activites')"
      });
    }
  });

  (db.programmeEvents || []).forEach((ev) => {
    if (ev.branche && ev.branche !== "Toutes" && !isBranchAllowedForCurrentUser(ev.branche)) return;
    const dLeft = daysUntilDate(ev.date);
    const notice = Number(ev.rappelJoursAvant || 7);
    const alreadySent = Boolean(findRecentMessageLog(`prog_info__${ev.id}`, 21));
    if (dLeft !== null && dLeft <= notice && dLeft >= 0 && !alreadySent) {
      alerts.push({
        cls: "alert-warning",
        title: `Programme : envoyer info parents pour "${ev.titre}"`,
        detail: `Prévu le ${ev.date} (dans ${dLeft} jour(s)).`,
        btnText: "Envoyer info",
        action: `sendProgramInfoToParents('${ev.id}')`
      });
    }
  });

  (db.activites || []).forEach((a) => {
    if (!a.forCu) return;
    if (a.branche && a.branche !== "Toutes" && !isBranchAllowedForCurrentUser(a.branche)) return;
    const dLeft = daysUntilDate(a.date);
    const ackKey = `${a.id}__${currentUser && currentUser.chefId ? currentUser.chefId : (currentUser && currentUser.uid ? currentUser.uid : "cu")}`;
    const isAck = Boolean(db.cuAckLogs[ackKey]);
    if (dLeft !== null && dLeft <= 1 && dLeft >= 0 && !isAck) {
      alerts.push({
        cls: "alert-warning",
        title: `Signal CU : ${a.titre} (${dLeft === 0 ? "Aujourd'hui" : "Demain"})`,
        detail: `Lieu : ${a.lieu || "À préciser"} — Branche : ${a.branche}.`,
        btnText: currentUser && currentUser.role === "cu" ? "Accuser réception" : "Rappel CU",
        action: currentUser && currentUser.role === "cu" ? `acknowledgeCuActivity('${a.id}')` : `remindCuForActivity('${a.id}')`
      });
    }
  });

  (db.scouts || []).filter((s) => isBranchAllowedForCurrentUser(s.branche)).forEach((s) => {
    const streak = getConsecutiveAbsences(s.id);
    if (streak >= 3 && !db.parentMeetingsDone[s.id]) {
      alerts.push({
        cls: "alert-warning",
        title: `3 absences consécutives : ${s.prenom} ${s.nom} (${s.branche})`,
        detail: `${streak} absences d'affilée — Rencontre avec les parents recommandée.`,
        btnText: "Inviter parents",
        action: `sendParentMeetingInvitation('${s.id}')`
      });
    }
  });

  if (!alerts.length) {
    box.innerHTML = `<p class="muted small">Aucune alerte urgente à traiter maintenant.</p>`;
    return;
  }

  box.innerHTML = alerts.map((al) => `
    <div class="alert-item ${al.cls}">
      <div>
        <strong>${escapeHtml(al.title)}</strong><br>
        <span class="small">${escapeHtml(al.detail)}</span>
      </div>
      <button type="button" class="btn btn-sm btn-primary" onclick="${al.action}">${escapeHtml(al.btnText)}</button>
    </div>
  `).join("");
}

// --- TABLEAU DE BORD ---
function renderDashboard() {
  const statsBox = document.getElementById("dashboardStats");
  const branchBox = document.getElementById("branchSummaryBox");
  const absBox = document.getElementById("absencesAlertsBox");
  const logsBox = document.getElementById("recentLogsBox");

  const visibleScouts = (db.scouts || []).filter((s) => isBranchAllowedForCurrentUser(s.branche));
  const totalScouts = visibleScouts.length;
  const totalChefs = (db.chefs || []).length;
  const totalRecettes = (db.finances || [])
    .filter((f) => f.type === "recette")
    .reduce((acc, f) => acc + Number(f.montant || 0), 0);
  const alerts3Abs = visibleScouts.filter((s) => getConsecutiveAbsences(s.id) >= 3 && !db.parentMeetingsDone[s.id]);

  if (statsBox) {
    statsBox.innerHTML = `
      <div class="stat-box"><div class="muted small">Jeunes inscrits</div><div class="stat-value">${totalScouts}</div></div>
      <div class="stat-box"><div class="muted small">Chefs d'Unité</div><div class="stat-value">${totalChefs}</div></div>
      <div class="stat-box"><div class="muted small">Encaissements enregistrés</div><div class="stat-value">${escapeHtml(formatMoney(totalRecettes))}</div></div>
      <div class="stat-box"><div class="muted small">Alertes 3 absences</div><div class="stat-value">${alerts3Abs.length}</div></div>
    `;
  }

  if (branchBox) {
    const branchesToShow = (currentUser && currentUser.role === "cu" && currentUser.branche && currentUser.branche !== "Toutes")
      ? BRANCHES.filter((b) => normalizeBranch(b) === normalizeBranch(currentUser.branche))
      : BRANCHES;
    branchBox.innerHTML = branchesToShow.map((br) => {
      const count = visibleScouts.filter((s) => normalizeBranch(s.branche) === normalizeBranch(br)).length;
      return `<div class="alert-item alert-info"><strong>${escapeHtml(br)}</strong><span>${count} jeune(s)</span></div>`;
    }).join("");
  }

  if (absBox) {
    if (!alerts3Abs.length) {
      absBox.innerHTML = `<p class="muted small">Aucun jeune avec 3 absences consécutives non suivies.</p>`;
    } else {
      absBox.innerHTML = alerts3Abs.map((s) => `
        <div class="alert-item alert-warning">
          <div>
            <strong>${escapeHtml(s.prenom)} ${escapeHtml(s.nom)}</strong> (${escapeHtml(s.branche)})<br>
            <span class="small">${getConsecutiveAbsences(s.id)} absences de suite</span>
          </div>
          <div class="actions-row">
            <button type="button" class="btn btn-sm btn-info" onclick="sendParentMeetingInvitation('${s.id}')">Proposer rencontre</button>
            <button type="button" class="btn btn-sm btn-success" onclick="markParentMeetingDone('${s.id}')">Rencontre faite</button>
          </div>
        </div>
      `).join("");
    }
  }

  if (logsBox) {
    const items = (db.messageLogs || []).slice(0, 8);
    logsBox.innerHTML = items.length
      ? items.map((l) => `<div class="small border-bottom"><strong>${escapeHtml(l.category)}</strong> — ${escapeHtml(l.recipientLabel || "")} <span class="muted">(${escapeHtml(String(l.sentAt || "").slice(0, 16).replace("T", " "))})</span></div>`).join("")
      : `<p class="muted small">Aucune activité récente enregistrée.</p>`;
  }
}

// --- PARAMÈTRES, CACHET NUMÉRIQUE & EXPORTS ---
function renderDigitalStampPreview() {
  const preview = document.getElementById("digitalStampPreview");
  if (!preview) return;
  preview.innerHTML = buildDigitalStampHtml(new Date().toISOString().slice(0, 10));
}

function populateSettingsForm() {
  const s = db.settings || {};
  const setVal = (id, v) => {
    const el = document.getElementById(id);
    if (el) el.value = v ?? "";
  };
  setVal("set_cg_nom", s.cg_nom);
  setVal("set_cg_tel", s.cg_tel);
  setVal("set_wave_url", s.wave_url);
  setVal("set_cot_annuelle", s.cot_annuelle_j);
  setVal("set_cot_mensuelle", s.cot_mensuelle_j);
  setVal("set_cot_nationale_deadline", s.cot_nationale_deadline);
  renderDigitalStampPreview();
}

async function saveSettings(event) {
  event.preventDefault();
  if (currentUser && currentUser.role === "cu") {
    alert("L'accès aux paramètres généraux est réservé au Chef de Groupe / Financier.");
    return;
  }
  db.settings.cg_nom = document.getElementById("set_cg_nom").value.trim() || "Chef de Groupe Obion";
  db.settings.cg_tel = document.getElementById("set_cg_tel").value.trim();
  db.settings.wave_url = document.getElementById("set_wave_url").value.trim();
  db.settings.cot_annuelle_j = Number(document.getElementById("set_cot_annuelle").value || 2500);
  db.settings.cot_mensuelle_j = Number(document.getElementById("set_cot_mensuelle").value || 500);
  db.settings.cot_nationale_deadline = document.getElementById("set_cot_nationale_deadline").value;
  await persistDb("Mise à jour paramètres", db.settings.cg_nom);
  renderAll();
  alert("Paramètres enregistrés.");
}

function exportBackupJson() {
  const blob = new Blob([JSON.stringify(db, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `obion_erp_sauvegarde_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

async function restoreBackupJson(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    db = normalizeDbStructure(parsed);
    await persistDb("Restauration sauvegarde JSON", file.name);
    renderAll();
    alert("Sauvegarde restaurée avec succès.");
  } catch (e) {
    alert("Fichier JSON invalide.");
  }
}

function exportScoutsCsv() {
  const header = ["Prenom", "Nom", "Branche", "Cotisation_Nationale", "Matricule", "Tenue", "Parent", "Tel_Parent", "Allergies"];
  const lines = [header.join(";")];
  (db.scouts || []).filter((s) => isBranchAllowedForCurrentUser(s.branche)).forEach((s) => {
    lines.push([
      s.prenom,
      s.nom,
      s.branche,
      s.cotisationNationalePayee ? "Payee" : "En attente",
      s.matricule || "",
      TENUE_LABELS[s.tenue] || TENUE_LABELS.aucune,
      s.parent_nom || "",
      s.parent_tel || "",
      s.allergies || ""
    ].map((v) => `"${String(v ?? "").replaceAll('"', '""')}"`).join(";"));
  });
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `obion_effectifs_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function exportActivitiesCsv() {
  const header = ["Titre", "Date", "Date_Limite", "Branche", "Lieu", "Rappel_CU"];
  const lines = [header.join(";")];
  (db.activites || []).forEach((a) => {
    lines.push([a.titre, a.date, a.date_limite_paiement || "", a.branche, a.lieu || "", a.forCu ? "Oui" : "Non"]
      .map((v) => `"${String(v ?? "").replaceAll('"', '""')}"`).join(";"));
  });
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `obion_activites_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function exportProgramCsv() {
  const header = ["Titre", "Date", "Rappel_Jours_Avant", "Branche", "Details"];
  const lines = [header.join(";")];
  (db.programmeEvents || []).forEach((ev) => {
    lines.push([ev.titre, ev.date, ev.rappelJoursAvant || 7, ev.branche, ev.details || ""]
      .map((v) => `"${String(v ?? "").replaceAll('"', '""')}"`).join(";"));
  });
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `obion_programme_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function printActivitiesReport() {
  const rows = (db.activites || []).map((a) => `<tr><td>${escapeHtml(a.titre)}</td><td>${escapeHtml(a.date)}</td><td>${escapeHtml(a.branche)}</td><td>${escapeHtml(a.lieu || "-")}</td></tr>`).join("");
  triggerPrintHtml(`<div class="print-document"><h1>GROUPE OBION — ACTIVITÉS</h1><table class="print-table"><thead><tr><th>Titre</th><th>Date</th><th>Branche</th><th>Lieu</th></tr></thead><tbody>${rows}</tbody></table><div class="print-signature">${buildDigitalStampHtml()}</div></div>`);
}

function printProgramReport() {
  const rows = (db.programmeEvents || []).map((ev) => `<tr><td>${escapeHtml(ev.titre)}</td><td>${escapeHtml(ev.date)}</td><td>${escapeHtml(ev.branche)}</td><td>${escapeHtml(ev.details || "-")}</td></tr>`).join("");
  triggerPrintHtml(`<div class="print-document"><h1>GROUPE OBION — PROGRAMME</h1><table class="print-table"><thead><tr><th>Événement</th><th>Date</th><th>Branche</th><th>Détails</th></tr></thead><tbody>${rows}</tbody></table><div class="print-signature">${buildDigitalStampHtml()}</div></div>`);
}

// --- MODULES COMPLÉMENTAIRES (ONGLET GESTION COMPLÈTE) ---
function populateAdvancedSelects() {
  const visibleScouts = (db.scouts || []).filter((s) => isBranchAllowedForCurrentUser(s.branche));
  const scoutOptions = `<option value="">Choisir un jeune</option>` + visibleScouts.map((s) =>
    `<option value="${escapeHtml(s.id)}">${escapeHtml(s.prenom)} ${escapeHtml(s.nom)} (${escapeHtml(s.branche)})</option>`
  ).join("");

  ["gx_scout", "gt_scout", "gp_scout", "ga_scout", "gprint_scout"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      const prev = el.value;
      el.innerHTML = scoutOptions;
      if (prev) el.value = prev;
    }
  });

  const actSel = document.getElementById("gf_activity");
  if (actSel) {
    const prev = actSel.value;
    actSel.innerHTML = `<option value="">Choisir une activité</option>` + (db.activites || []).map((a) =>
      `<option value="${escapeHtml(a.id)}">${escapeHtml(a.titre)} (${escapeHtml(a.date)})</option>`
    ).join("");
    if (prev) actSel.value = prev;
  }
}

async function saveScoutExtra(event) {
  event.preventDefault();
  const scoutId = document.getElementById("gx_scout").value;
  const scout = (db.scouts || []).find((s) => s.id === scoutId);
  if (!scout || !isBranchAllowedForCurrentUser(scout.branche)) return;

  scout.dob = document.getElementById("gx_dob").value || scout.dob || "";
  const mat = document.getElementById("gx_matricule").value.trim();
  if (mat) {
    scout.matricule = mat;
    scout.cotisationNationalePayee = true;
  }
  scout.parent_tel2 = document.getElementById("gx_parent2").value.trim() || scout.parent_tel2 || "";
  scout.address = document.getElementById("gx_address").value.trim() || scout.address || "";
  scout.docs = document.getElementById("gx_docs").value.trim() || scout.docs || "";
  scout.notes = document.getElementById("gx_notes").value.trim() || scout.notes || "";

  await persistDb("Mise à jour fiche jeune", `${scout.prenom} ${scout.nom}`);
  renderAdvancedModules();
  renderAll();
  alert("Fiche complémentaire enregistrée.");
}

async function addLeaderFull(event) {
  event.preventDefault();
  if (currentUser && currentUser.role === "cu") {
    alert("Réservé au Chef de Groupe / Financier.");
    return;
  }
  const leader = {
    id: uid("chef"),
    nom: document.getElementById("gl_nom").value.trim(),
    poste: document.getElementById("gl_role").value,
    branche: normalizeBranch(document.getElementById("gl_unite").value),
    tel: document.getElementById("gl_tel").value.trim(),
    matricule: document.getElementById("gl_matricule").value.trim(),
    email: ""
  };
  db.chefs.push(leader);
  event.target.reset();
  await persistDb("Ajout membre maîtrise", `${leader.nom} — ${leader.poste} (${leader.branche})`);
  renderAll();
}

async function recordUnitTransition(event) {
  event.preventDefault();
  const scoutId = document.getElementById("gt_scout").value;
  const scout = (db.scouts || []).find((s) => s.id === scoutId);
  if (!scout || !isBranchAllowedForCurrentUser(scout.branche)) return;

  const newUnit = normalizeBranch(document.getElementById("gt_unit").value);
  const dateStr = document.getElementById("gt_date").value;
  const ceremony = document.getElementById("gt_ceremony").value.trim();
  const oldUnit = scout.branche;

  scout.branche = newUnit;
  db.transitions.unshift({
    id: uid("tr"),
    scoutId,
    scoutName: `${scout.prenom} ${scout.nom}`,
    fromUnit: oldUnit,
    toUnit: newUnit,
    date: dateStr,
    ceremony
  });
  event.target.reset();
  await persistDb("Passage d'unité", `${scout.prenom} ${scout.nom} : ${oldUnit} -> ${newUnit}`);
  renderAll();
}

async function addProgression(event) {
  event.preventDefault();
  const scoutId = document.getElementById("gp_scout").value;
  const scout = (db.scouts || []).find((s) => s.id === scoutId);
  if (!scout || !isBranchAllowedForCurrentUser(scout.branche)) return;

  db.progressions.unshift({
    id: uid("prog_sc"),
    scoutId,
    scoutName: `${scout.prenom} ${scout.nom}`,
    branche: scout.branche,
    competence: document.getElementById("gp_comp").value.trim(),
    status: document.getElementById("gp_status").value,
    date: document.getElementById("gp_date").value,
    validateur: document.getElementById("gp_validateur").value.trim(),
    note: document.getElementById("gp_note").value.trim()
  });
  event.target.reset();
  await persistDb("Progression scoute", `${scout.prenom} ${scout.nom} — ${document.getElementById("gp_comp")?.value || ""}`);
  renderAdvancedModules();
}

async function addActivityFinancialLine(event) {
  event.preventDefault();
  const actId = document.getElementById("gf_activity").value;
  const act = (db.activites || []).find((a) => a.id === actId);
  const type = document.getElementById("gf_type").value;
  const label = document.getElementById("gf_label").value.trim();
  const amount = Number(document.getElementById("gf_amount").value || 0);
  const receipt = document.getElementById("gf_receipt").value.trim();

  db.activityFinances.unshift({
    id: uid("af"),
    activityId: actId,
    activityTitle: act ? act.titre : "Activité",
    type,
    label,
    amount,
    receipt,
    date: new Date().toISOString().slice(0, 10)
  });

  if ((type === "recette" || type === "depense") && amount > 0) {
    db.finances.unshift({
      id: uid("fin"),
      date: new Date().toISOString().slice(0, 10),
      type,
      libelle: `${act ? act.titre : "Activité"} — ${label}`,
      montant: amount
    });
  }

  event.target.reset();
  await persistDb("Finance activité", `${label} (${formatMoney(amount)})`);
  renderAll();
}

async function submitAbsenceRequest(event) {
  event.preventDefault();
  const scoutId = document.getElementById("ga_scout").value;
  const scout = (db.scouts || []).find((s) => s.id === scoutId);
  if (!scout || !isBranchAllowedForCurrentUser(scout.branche)) return;

  db.absenceRequests.unshift({
    id: uid("abs"),
    scoutId,
    scoutName: `${scout.prenom} ${scout.nom}`,
    branche: scout.branche,
    date: document.getElementById("ga_date").value,
    reason: document.getElementById("ga_reason").value.trim(),
    fileRef: document.getElementById("ga_file").value.trim()
  });
  event.target.reset();
  await persistDb("Justificatif d'absence", `${scout.prenom} ${scout.nom}`);
  renderAdvancedModules();
}

async function saveAnnouncement(event) {
  event.preventDefault();
  const title = document.getElementById("gn_title").value.trim();
  const unit = document.getElementById("gn_unit").value;
  const date = document.getElementById("gn_date").value;
  const body = document.getElementById("gn_body").value.trim();

  db.announcements.unshift({
    id: uid("ann"),
    title,
    unit,
    date,
    body,
    createdAt: new Date().toISOString().slice(0, 10)
  });
  event.target.reset();
  await persistDb("Annonce / Convocation", `${title} (${unit})`);
  renderAdvancedModules();
}

function printScoutFile() {
  const scoutId = document.getElementById("gprint_scout")?.value;
  const scout = (db.scouts || []).find((s) => s.id === scoutId);
  if (!scout) {
    alert("Choisissez d'abord un jeune.");
    return;
  }
  const progs = (db.progressions || []).filter((p) => p.scoutId === scout.id);
  const html = `
    <div class="print-document">
      <h1>GROUPE OBION — FICHE SCOUT</h1>
      <p><strong>Nom &amp; Prénom :</strong> ${escapeHtml(scout.prenom)} ${escapeHtml(scout.nom)}</p>
      <p><strong>Branche :</strong> ${escapeHtml(scout.branche)}</p>
      <p><strong>Matricule :</strong> ${escapeHtml(scout.matricule || "Non attribué")} (${scout.cotisationNationalePayee ? "Cotisation nationale payée" : "Cotisation nationale en attente"})</p>
      <p><strong>Tenue :</strong> ${escapeHtml(TENUE_LABELS[scout.tenue] || TENUE_LABELS.aucune)}</p>
      <p><strong>Parent / Contact :</strong> ${escapeHtml(scout.parent_nom || "-")} — ${escapeHtml(scout.parent_tel || "-")}</p>
      ${scout.allergies ? `<p><strong>Santé / Allergies :</strong> ${escapeHtml(scout.allergies)}</p>` : ""}
      ${scout.notes ? `<p><strong>Notes :</strong> ${escapeHtml(scout.notes)}</p>` : ""}
      <h3>Progression enregistrée</h3>
      <ul>${progs.map((pr) => `<li>${escapeHtml(pr.competence)} — <strong>${escapeHtml(pr.status)}</strong> (${escapeHtml(pr.date || "")})</li>`).join("") || "<li>Aucune étape enregistrée</li>"}</ul>
      <div class="print-signature">${buildDigitalStampHtml()}</div>
    </div>
  `;
  const target = document.getElementById("scoutPrintable");
  if (target) target.innerHTML = html;
  triggerPrintHtml(html);
}

function renderAdvancedModules() {
  populateAdvancedSelects();

  const leadersBox = document.getElementById("leadersFullBox");
  if (leadersBox) {
    leadersBox.innerHTML = (db.chefs || []).map((c) => `
      <div class="border-bottom small">
        <strong>${escapeHtml(c.nom)}</strong> — ${escapeHtml(c.poste || "Chef d'Unité")} (${escapeHtml(c.branche || "Groupe")})
        ${c.tel ? `• ${escapeHtml(c.tel)}` : ""}
        ${c.matricule ? `• Mat: ${escapeHtml(c.matricule)}` : ""}
      </div>
    `).join("");
  }

  const trBox = document.getElementById("transitionsBox");
  if (trBox) {
    const items = (db.transitions || []).filter((t) => isBranchAllowedForCurrentUser(t.toUnit) || isBranchAllowedForCurrentUser(t.fromUnit));
    trBox.innerHTML = items.map((t) => `
      <div class="border-bottom small"><strong>${escapeHtml(t.scoutName)}</strong> : ${escapeHtml(t.fromUnit)} → ${escapeHtml(t.toUnit)} (${escapeHtml(t.date)})</div>
    `).join("") || `<p class="muted small">Aucun passage enregistré.</p>`;
  }

  const progBox = document.getElementById("progressionBox");
  if (progBox) {
    const items = (db.progressions || []).filter((p) => isBranchAllowedForCurrentUser(p.branche));
    progBox.innerHTML = items.map((p) => `
      <div class="border-bottom small"><strong>${escapeHtml(p.scoutName)}</strong> (${escapeHtml(p.branche)}) — ${escapeHtml(p.competence)} [<span class="badge badge-info">${escapeHtml(p.status)}</span>]</div>
    `).join("") || `<p class="muted small">Aucune progression enregistrée.</p>`;
  }

  const afBox = document.getElementById("activityFinanceBox");
  if (afBox) {
    afBox.innerHTML = (db.activityFinances || []).map((f) => `
      <div class="border-bottom small"><strong>${escapeHtml(f.activityTitle)}</strong> (${escapeHtml(f.type)}) : ${escapeHtml(f.label)} — <strong>${escapeHtml(formatMoney(f.amount))}</strong></div>
    `).join("") || `<p class="muted small">Aucune ligne budgétaire d'activité.</p>`;
  }

  const absReqBox = document.getElementById("absenceRequestsBox");
  if (absReqBox) {
    const items = (db.absenceRequests || []).filter((a) => isBranchAllowedForCurrentUser(a.branche));
    absReqBox.innerHTML = items.map((a) => `
      <div class="border-bottom small"><strong>${escapeHtml(a.scoutName)}</strong> (${escapeHtml(a.date)}) : ${escapeHtml(a.reason)}</div>
    `).join("") || `<p class="muted small">Aucun justificatif enregistré.</p>`;
  }

  const annBox = document.getElementById("announcementsBox");
  if (annBox) {
    annBox.innerHTML = (db.announcements || []).map((a) => `
      <div class="border-bottom small"><strong>${escapeHtml(a.title)}</strong> (${escapeHtml(a.unit)}) — ${escapeHtml(a.body)}</div>
    `).join("") || `<p class="muted small">Aucune annonce enregistrée.</p>`;
  }
}

function exportAdvancedCsv() {
  const header = ["Module", "Titre_ou_Nom", "Branche_ou_Unite", "Detail", "Date"];
  const lines = [header.join(";")];
  (db.progressions || []).forEach((p) => lines.push(["Progression", p.scoutName, p.branche, `${p.competence} (${p.status})`, p.date || ""].map((v) => `"${String(v ?? "").replaceAll('"', '""')}"`).join(";")));
  (db.activityFinances || []).forEach((f) => lines.push(["Finance_Activite", f.activityTitle, f.type, `${f.label} - ${f.amount}`, f.date || ""].map((v) => `"${String(v ?? "").replaceAll('"', '""')}"`).join(";")));
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `obion_modules_avances_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function printAdvancedReport() {
  const progs = (db.progressions || []).map((p) => `<tr><td>${escapeHtml(p.scoutName)}</td><td>${escapeHtml(p.branche)}</td><td>${escapeHtml(p.competence)}</td><td>${escapeHtml(p.status)}</td></tr>`).join("");
  triggerPrintHtml(`<div class="print-document"><h1>GROUPE OBION — BILAN PROGRESSION &amp; GESTION</h1><table class="print-table"><thead><tr><th>Jeune</th><th>Branche</th><th>Étape</th><th>Statut</th></tr></thead><tbody>${progs}</tbody></table><div class="print-signature">${buildDigitalStampHtml()}</div></div>`);
}

function renderAll() {
  applyRolePermissionsUi();
  populateReceiptScoutSelect();
  populateSettingsForm();
  renderSmartRemindersPanel();
  renderDashboard();
  renderEffectifsAndPresences();
  renderCotisationsSuivi();
  renderActivitiesAndProgram();
  renderParentBroadcastRecipients();
  renderAdvancedModules();
}

document.addEventListener("DOMContentLoaded", () => {
  const today = new Date().toISOString().slice(0, 10);
  const pDate = document.getElementById("presenceDateInput");
  const rDate = document.getElementById("rc_date");
  if (pDate && !pDate.value) pDate.value = today;
  if (rDate && !rDate.value) rDate.value = today;
  if (pDate) pDate.addEventListener("change", () => renderEffectifsAndPresences());

  authDb.onAuthStateChanged(async (user) => {
    if (user) {
      await subscribeUserData(user);
      showAppShell();
    } else {
      currentUser = null;
      document.getElementById("appShell").style.display = "none";
      document.getElementById("loginScreen").style.display = "grid";
    }
  });
});
"""
with open("app.js", "w", encoding="utf-8") as f:
    f.write(code)
print("app.js written successfully, lines:", len(code.splitlines()))
