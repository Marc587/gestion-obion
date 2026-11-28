const firebaseConfig = {
  apiKey: "AIzaSyAjOKy6EDW4ga3WMdanlXoFl2zmZWakdFM",
  authDomain: "obion-9dd88.firebaseapp.com",
  databaseURL: "https://obion-9dd88-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "obion-9dd88",
  storageBucket: "obion-9dd88.firebasestorage.app",
  messagingSenderId: "323290176171",
  appId: "1:323290176171:web:0a8e937e0e3127ce9535ee",
  measurementId: "G-TXEM0R3769"
};

firebase.initializeApp(firebaseConfig);
const firestoreDb = firebase.firestore();
const firebaseAuth = firebase.auth();
let firestoreUnsubscribe = null;
firestoreDb.settings({
  experimentalForceLongPolling: true,
  useFetchStreams: false
});
const docRefObion = firestoreDb.collection("erp_obion").doc("groupe_principal");

const BACKUP_KEY = "obion_erp_backup_v1";
const BACKUP_USER_KEY = "obion_erp_backup_uid_v1";
const SESSION_KEY = "obion_erp_session_v1";
const IDLE_LIMIT_MS = 15 * 60 * 1000;
let idleTimer = null;
const BRANCHES = ["Oisillon", "Meute", "Troupe", "Chemin", "Route"];

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
    { id: "chef_meute", nom: "Akissi Kouamé", branche: "Meute", tel: "" },
    { id: "chef_troupe", nom: "Yao Konan", branche: "Troupe", tel: "" }
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
  settings: {
    cg_nom: "Chef de Groupe Obion",
    cg_tel: "",
    wave_url: "",
    cot_annuelle_j: 2500,
    cot_mensuelle_j: 500,
    cot_nationale_deadline: "",
    pins: {
      cg: "1111",
      financier: "2222",
      cu: "3333"
    }
  }
};

let db = cloneSafe(defaultData);
let currentUser = null;
let lastReceiptText = "";

function normalizeDbStructure(raw) {
  const merged = Object.assign(cloneSafe(defaultData), raw || {});
  merged.settings = Object.assign(cloneSafe(defaultData.settings), (raw && raw.settings) || {});
  merged.settings.pins = Object.assign(
    cloneSafe(defaultData.settings.pins),
    (raw && raw.settings && raw.settings.pins) || {}
  );
  if (!Array.isArray(merged.scouts)) merged.scouts = [];
  if (!Array.isArray(merged.chefs) || !merged.chefs.length) merged.chefs = cloneSafe(defaultData.chefs);
  if (!Array.isArray(merged.activites)) merged.activites = [];
  if (!Array.isArray(merged.programmeEvents)) merged.programmeEvents = [];
  if (!Array.isArray(merged.presences)) merged.presences = [];
  if (!Array.isArray(merged.finances)) merged.finances = [];
  if (!Array.isArray(merged.messageLogs)) merged.messageLogs = [];
  if (!merged.cuAckLogs || typeof merged.cuAckLogs !== "object") merged.cuAckLogs = {};
  if (!merged.parentMeetingsDone || typeof merged.parentMeetingsDone !== "object") merged.parentMeetingsDone = {};
  if (!Array.isArray(merged.cotisationsCustom)) merged.cotisationsCustom = [];
  if (!merged.cotisationPayments || typeof merged.cotisationPayments !== "object") merged.cotisationPayments = {};
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
    settings: Object.assign({}, remote.settings, local.settings)
  });
}

function setSyncBadge(text, cls = "badge-info") {
  const el = document.getElementById("syncStatusBadge");
  if (!el) return;
  el.textContent = text;
  el.className = `badge ${cls}`;
}

async function persistDb(actionTitle = "Mise à jour", actionDetail = "") {
  db = normalizeDbStructure(db);
  try {
    localStorage.setItem(BACKUP_KEY, JSON.stringify(db));
    if (currentUser && currentUser.uid) localStorage.setItem(BACKUP_USER_KEY, currentUser.uid);
  } catch (e) {}

  setSyncBadge("Synchronisation...", "badge-warning");
  try {
    const snap = await docRefObion.get();
    const finalDoc = snap.exists ? mergeDbStates(snap.data(), db) : db;
    db = finalDoc;
    localStorage.setItem(BACKUP_KEY, JSON.stringify(db));
    if (currentUser && currentUser.uid) localStorage.setItem(BACKUP_USER_KEY, currentUser.uid);
    await docRefObion.set(finalDoc, { merge: true });
    setSyncBadge("Synchronisé", "badge-success");
  } catch (err) {
    setSyncBadge("Hors ligne (local)", "badge-warning");
  }

  if (actionTitle) {
    db.messageLogs.unshift({
      id: uid("act"),
      dedupKey: `audit_${Date.now()}`,
      category: actionTitle,
      recipientLabel: actionDetail,
      weekKey: getIsoWeekKey(),
      sentAt: new Date().toISOString(),
      author: currentUser ? (currentUser.chefNom || currentUser.role) : "Système"
    });
    db.messageLogs = db.messageLogs.slice(0, 500);
    try {
      localStorage.setItem(BACKUP_KEY, JSON.stringify(db));
    if (currentUser && currentUser.uid) localStorage.setItem(BACKUP_USER_KEY, currentUser.uid);
    } catch (e) {}
  }
}

async function initAppData() {
  let localFallback = null;
  try {
    const backupUid = localStorage.getItem(BACKUP_USER_KEY);
    const rawLocal = currentUser && backupUid === currentUser.uid ? localStorage.getItem(BACKUP_KEY) : null;
    if (rawLocal) localFallback = JSON.parse(rawLocal);
  } catch (e) {}

  if (localFallback) {
    db = normalizeDbStructure(localFallback);
  }

  try {
    const snap = await docRefObion.get();
    if (snap.exists) {
      db = localFallback ? mergeDbStates(snap.data(), localFallback) : normalizeDbStructure(snap.data());
      localStorage.setItem(BACKUP_KEY, JSON.stringify(db));
    if (currentUser && currentUser.uid) localStorage.setItem(BACKUP_USER_KEY, currentUser.uid);
      setSyncBadge("Synchronisé", "badge-success");
    } else {
      await docRefObion.set(db);
      setSyncBadge("Synchronisé", "badge-success");
    }
  } catch (e) {
    setSyncBadge("Hors ligne (local)", "badge-warning");
  }

  if (firestoreUnsubscribe) firestoreUnsubscribe();
  firestoreUnsubscribe = docRefObion.onSnapshot((doc) => {
    if (!doc.exists) return;
    db = normalizeDbStructure(doc.data());
    try {
      localStorage.setItem(BACKUP_KEY, JSON.stringify(db));
    if (currentUser && currentUser.uid) localStorage.setItem(BACKUP_USER_KEY, currentUser.uid);
    } catch (e) {}
    setSyncBadge("Synchronisé", "badge-success");
    if (currentUser) renderAll();
  }, () => {
    setSyncBadge("Hors ligne (local)", "badge-warning");
  });
}

// --- AUTHENTIFICATION & RÔLES ---
function populateChefLoginSelect() {
  const sel = document.getElementById("chefLoginSelect");
  if (!sel) return;
  sel.innerHTML = (db.chefs || [])
    .map((c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.nom)} (${escapeHtml(c.branche || "Groupe")})</option>`)
    .join("");
}

function toggleChefSelect() {
  const role = document.getElementById("roleSelect")?.value;
  const grp = document.getElementById("chefSelectGroup");
  if (grp) grp.style.display = role === "cu" ? "block" : "none";
}

async function handleLogin(event) {
  event.preventDefault();
  const errorBox = document.getElementById("loginError");
  const email = String(document.getElementById("emailInput").value || "").trim();
  const password = String(document.getElementById("passwordInput").value || "");
  const submit = document.querySelector('#loginForm button[type="submit"]');
  if (errorBox) errorBox.textContent = "";
  if (submit) submit.disabled = true;

  try {
    const credential = await firebaseAuth.signInWithEmailAndPassword(email, password);
    const user = credential.user;
    const accessSnap = await firestoreDb.collection("access_users").doc(user.uid).get();
    if (!accessSnap.exists || accessSnap.data().active !== true) {
      await firebaseAuth.signOut();
      throw new Error("Compte non autorisé. Demande au Chef de Groupe de vérifier ton accès.");
    }
    const access = accessSnap.data();
    const role = String(access.role || "");
    if (!["cg", "financier", "cu"].includes(role)) {
      await firebaseAuth.signOut();
      throw new Error("Rôle non reconnu. Contacte le Chef de Groupe.");
    }
    currentUser = {
      uid: user.uid,
      role,
      chefId: access.chefId || "",
      chefNom: access.chefNom || user.email || "Responsable",
      branche: access.branche || "Toutes"
    };
    await initAppData();
    document.getElementById("passwordInput").value = "";
    showAppShell();
    resetIdleTimer();
  } catch (err) {
    if (errorBox) errorBox.textContent = err.message || "Connexion impossible. Vérifie tes identifiants.";
  } finally {
    if (submit) submit.disabled = false;
  }
}

function resetIdleTimer() {
  if (idleTimer) clearTimeout(idleTimer);
  if (!currentUser) return;
  idleTimer = setTimeout(() => {
    alert("Session terminée après 15 minutes d’inactivité. Reconnecte-toi.");
    logout();
  }, IDLE_LIMIT_MS);
}

function logout() {
  currentUser = null;
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = null;
  if (firestoreUnsubscribe) {
    firestoreUnsubscribe();
    firestoreUnsubscribe = null;
  }
  try {
    sessionStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(BACKUP_KEY);
    localStorage.removeItem(BACKUP_USER_KEY);
  } catch (e) {}
  firebaseAuth.signOut().catch(() => {});
  document.getElementById("appShell").style.display = "none";
  document.getElementById("loginScreen").style.display = "grid";
  const password = document.getElementById("passwordInput");
  if (password) password.value = "";
}

function showAppShell() {
  document.getElementById("loginScreen").style.display = "none";
  document.getElementById("appShell").style.display = "block";
  const badge = document.getElementById("userBadgeLine");
  if (badge && currentUser) {
    const scope = currentUser.role === "cu" ? ` — Branche : ${currentUser.branche}` : " — Groupe complet";
    badge.textContent = `${currentUser.chefNom} (${currentUser.role.toUpperCase()})${scope}`;
  }
  if (currentUser && currentUser.role === "cu" && currentUser.branche) {
    const brFilter = document.getElementById("presenceBranchFilter");
    if (brFilter) brFilter.value = currentUser.branche;
  }
  renderAll();
}

function switchTab(tabName) {
  document.querySelectorAll(".tab-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.tab === tabName);
  });
  document.querySelectorAll(".tab-panel").forEach((p) => {
    p.classList.toggle("active", p.id === `tab-${tabName}`);
  });
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
  if (!recent) return `<span class="badge badge-info">À préparer</span>`;
  const dayStr = String(recent.sentAt || "").slice(0, 10);
  return `<span class="badge badge-warning" title="WhatsApp a été ouvert ; envoi non confirmé">WhatsApp ouvert (${escapeHtml(dayStr)})</span>`;
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
      `WhatsApp a déjà été ouvert pour "${recipientLabel || category}" cette semaine (${sentDate}).\n\nVeux-tu rouvrir la conversation ?`
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
    author: currentUser ? (currentUser.chefNom || currentUser.role) : "Système"
  });
  await persistDb("Conversation WhatsApp ouverte (envoi non confirmé)", `${category} — ${recipientLabel}`);
  renderAll();
  return true;
}

// --- EFFECTIFS & PRÉSENCES + RÈGLE 3 ABSENCES CONSÉCUTIVES ---
async function addScout(event) {
  event.preventDefault();
  const scout = {
    id: uid("sc"),
    prenom: document.getElementById("sc_prenom").value.trim(),
    nom: document.getElementById("sc_nom").value.trim(),
    matricule: document.getElementById("sc_matricule").value.trim(),
    branche: document.getElementById("sc_branche").value,
    parent_nom: document.getElementById("sc_parent_nom").value.trim(),
    parent_tel: document.getElementById("sc_parent_tel").value.trim(),
    allergies: document.getElementById("sc_allergies").value.trim()
  };
  db.scouts.push(scout);
  event.target.reset();
  await persistDb("Ajout jeune", `${scout.prenom} ${scout.nom} (${scout.branche})`);
  renderAll();
}

async function markPresence(scoutId, status) {
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

  const scout = db.scouts.find((s) => s.id === scoutId);
  await persistDb("Pointage présence", `${scout ? `${scout.prenom} ${scout.nom}` : scoutId} : ${status} (${dateStr})`);
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
  if (!scout) return;
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
    phoneRaw: scout.parent_tel,
    messageText: msg,
    dedupKey: `rencontre_parents__${scout.id}`,
    category: "Proposition rencontre parents (3 absences)",
    recipientLabel: `${scout.prenom} ${scout.nom} (${scout.branche})`
  });
}

async function markParentMeetingDone(scoutId) {
  db.parentMeetingsDone[scoutId] = new Date().toISOString().slice(0, 10);
  const scout = db.scouts.find((s) => s.id === scoutId);
  await persistDb("Rencontre parents effectuée", scout ? `${scout.prenom} ${scout.nom}` : scoutId);
  renderAll();
}

function renderEffectifsAndPresences() {
  const box = document.getElementById("scoutsListBox");
  if (!box) return;
  const dateStr = document.getElementById("presenceDateInput")?.value || new Date().toISOString().slice(0, 10);
  const branchFilter = document.getElementById("presenceBranchFilter")?.value || "Toutes";

  const list = (db.scouts || []).filter((s) => {
    if (currentUser && currentUser.role === "cu" && currentUser.branche && currentUser.branche !== "Toutes") {
      if (s.branche !== currentUser.branche) return false;
    }
    if (branchFilter !== "Toutes" && s.branche !== branchFilter) return false;
    return true;
  });

  if (!list.length) {
    box.innerHTML = `<p class="muted">Aucun jeune enregistré pour ce filtre.</p>`;
    return;
  }

  box.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Jeune</th>
            <th>Branche</th>
            <th>Matricule</th>
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
            return `
              <tr>
                <td>
                  <strong>${escapeHtml(s.prenom)} ${escapeHtml(s.nom)}</strong>
                  ${s.allergies ? `<br><span class="small muted">Santé : ${escapeHtml(s.allergies)}</span>` : ""}
                </td>
                <td>${escapeHtml(s.branche)}</td>
                <td>${escapeHtml(s.matricule || "-")}</td>
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

// --- COTISATIONS (JEUNES & CHEFS) + RELANCES WAVE & CAPTURE D'ÉCRAN ---
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
  const meta = getCotisationMeta(cotId);
  if (isPaid) {
    const ok = confirm("Cette cotisation est déjà marquée payée. Pour corriger le statut, une écriture d'annulation sera ajoutée aux finances. Continuer ?");
    if (!ok) return;
    db.cotisationPayments[key] = false;
    if (meta.montant > 0) {
      db.finances.unshift({
        id: uid("fin"), date: new Date().toISOString().slice(0, 10), type: "depense",
        libelle: `Annulation / correction — ${meta.label} (${memberId})`, montant: meta.montant,
        correction: true, referencePaiement: key
      });
    }
    await persistDb("Correction cotisation (écriture compensatoire)", `${key} -> Non payée`);
  } else {
    db.cotisationPayments[key] = true;
    if (meta.montant > 0) {
      db.finances.unshift({
        id: uid("fin"), date: new Date().toISOString().slice(0, 10), type: "recette",
        libelle: `${meta.label} (${memberId})`, montant: meta.montant, referencePaiement: key
      });
    }
    await persistDb("Paiement cotisation", `${key} -> Payée`);
  }
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
    if (!scout) return;
    nom = `${scout.prenom} ${scout.nom}`;
    branche = scout.branche || "-";
    matriculeTxt = cotId === "annuelle" && scout.matricule ? ` (Matricule : *${scout.matricule}*)` : "";
    phone = scout.parent_tel || "";
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
    (db.scouts || []).forEach((s) => {
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
    (db.chefs || []).forEach((c) => {
      rows.push({
        id: c.id,
        kind: "chef",
        nom: c.nom,
        roleLabel: "Chef d'Unité",
        branche: c.branche || "Groupe",
        matricule: "-"
      });
    });
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
            <th>Profil</th>
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

// --- REÇUS + IMPRESSION FIABLE + ENVOI WHATSAPP ---
function populateReceiptScoutSelect() {
  const sel = document.getElementById("rc_scout");
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = `<option value="">-- Sélectionner un jeune (optionnel) --</option>` +
    (db.scouts || []).map((s) => `<option value="${escapeHtml(s.id)}">${escapeHtml(s.prenom)} ${escapeHtml(s.nom)} (${escapeHtml(s.branche)})</option>`).join("");
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
    <div>
      <strong>GROUPE OBION — REÇU OFFICIEL</strong><br>
      <span class="small muted">N° : ${escapeHtml(numero)} | Date : ${escapeHtml(date)}</span>
      <hr class="mt-2" />
      <p><strong>Reçu de :</strong> ${escapeHtml(beneficiaire)}</p>
      ${scout && scout.matricule ? `<p><strong>Matricule :</strong> ${escapeHtml(scout.matricule)}</p>` : ""}
      <p><strong>Motif :</strong> ${escapeHtml(motif)}</p>
      ${detail ? `<p><strong>Détails :</strong> ${escapeHtml(detail)}</p>` : ""}
      <p><strong>Montant encaissé :</strong> ${escapeHtml(formatMoney(montant))}</p>
      <p class="small muted mt-2">Validé par : ${escapeHtml(cgNom)}</p>
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

  const msg = `🧾 *REÇU OFFICIEL — GROUPE OBION*\n\n${body}\n\n*${cgNom}* — Groupe OBION`;
  sendTrackedWhatsAppMessage({
    phoneRaw: scout ? scout.parent_tel : "",
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
  const ackKey = `${activityId}__${currentUser && currentUser.chefId ? currentUser.chefId : "cu"}`;
  db.cuAckLogs[ackKey] = new Date().toISOString().slice(0, 10);
  await persistDb("Accusé réception activité CU", activityId);
  renderAll();
}

function remindCuForActivity(activityId) {
  const act = (db.activites || []).find((a) => a.id === activityId);
  if (!act) return;
  const targets = (db.chefs || []).filter((c) => !act.branche || act.branche === "Toutes" || c.branche === act.branche);
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
  const msg = [
    `Bonjour chers parents (*Groupe OBION*),`, "",
    `Information au programme : *${ev.titre}*`,
    `📅 Date : *${ev.date}*`,
    ev.branche && ev.branche !== "Toutes" ? `Branche : *${ev.branche}*` : "",
    ev.details ? `\nℹ️ ${ev.details}` : "",
    "\nMerci pour votre accompagnement.", `*${cgNom}* — Groupe OBION`
  ].filter(Boolean).join("\n");
  const targets = (db.scouts || []).filter((s) =>
    (!ev.branche || ev.branche === "Toutes" || s.branche === ev.branche) && String(s.parent_tel || "").trim()
  );
  showParentRecipientLinks(`Information programme : ${ev.titre}`, msg, targets, `Programme • ${ev.titre}`);
  switchTab("parents");
}

function prepareParentBroadcast(event) {
  event.preventDefault();
  const title = document.getElementById("parent_msg_titre").value.trim();
  const branch = document.getElementById("parent_msg_branche").value || "Toutes";
  const date = document.getElementById("parent_msg_date").value;
  const content = document.getElementById("parent_msg_contenu").value.trim();
  const cgNom = db.settings.cg_nom || "Chef de Groupe Obion";
  const msg = [
    "Bonjour chers parents (*Groupe OBION*),", "",
    `📌 *${title}*`, date ? `📅 Date : *${date}*` : "",
    branch !== "Toutes" ? `Branche : *${branch}*` : "",
    "", content, "", "Merci pour votre accompagnement.", `*${cgNom}* — Groupe OBION`
  ].filter(Boolean).join("\n");
  const targets = (db.scouts || []).filter((s) =>
    (branch === "Toutes" || s.branche === branch) && String(s.parent_tel || "").trim()
  );
  showParentRecipientLinks(title, msg, targets, `Info parents • ${title}`);
  switchTab("parents");
}

function showParentRecipientLinks(title, messageText, scouts, category) {
  const box = document.getElementById("parentMessageRecipients");
  const count = document.getElementById("parentMessageCount");
  if (!box) return;
  const unique = new Map();
  scouts.forEach((s) => {
    const phone = String(s.parent_tel || "").trim();
    if (!phone) return;
    const key = normalizeWaPhone(phone) || phone;
    if (!unique.has(key)) unique.set(key, { phone, parent: s.parent_nom || "Parent / tuteur", youth: `${s.prenom || ""} ${s.nom || ""}`.trim(), branch: s.branche || "-" });
  });
  const recipients = Array.from(unique.values());
  if (count) count.textContent = `${recipients.length} conversation(s)`;
  if (!recipients.length) {
    box.innerHTML = `<div class="empty-state"><strong>Aucun numéro parent disponible</strong><p>Ajoute d’abord le téléphone WhatsApp des parents dans la fiche des jeunes.</p></div>`;
    return;
  }
  box.innerHTML = `<p class="muted small">${escapeHtml(title)} — ${recipients.length} numéro(s) unique(s). Chaque conversation s’ouvre séparément ; l’envoi reste manuel.</p>` + recipients.map((r, i) => `
    <div class="recipient-row">
      <div class="recipient-index">${i + 1}</div>
      <div class="recipient-info"><strong>${escapeHtml(r.parent)}</strong><span>${escapeHtml(r.youth)} • ${escapeHtml(r.branch)} • ${escapeHtml(r.phone)}</span></div>
      <button type="button" class="btn btn-sm btn-whatsapp" data-phone="${escapeHtml(r.phone)}" data-message="${escapeHtml(messageText)}" data-category="${escapeHtml(category)}" data-recipient="${escapeHtml(r.parent + ' — ' + r.youth)}" onclick="openPreparedParentWhatsApp(this)">Ouvrir WhatsApp</button>
    </div>`).join("");
}

async function openPreparedParentWhatsApp(button) {
  const phone = button.dataset.phone || "";
  const message = button.dataset.message || "";
  const category = button.dataset.category || "Info parents";
  const recipient = button.dataset.recipient || "Parent";
  openWhatsAppUrl(phone, message);
  db.messageLogs.unshift({
    id: uid("msg"), dedupKey: `parent_manual_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    category, recipientLabel: recipient, weekKey: getIsoWeekKey(), sentAt: new Date().toISOString(),
    status: "whatsapp_ouvert_non_confirme", author: currentUser ? (currentUser.chefNom || currentUser.role) : "Système"
  });
  await persistDb("WhatsApp ouvert (envoi non confirmé)", `${category} — ${recipient}`);
  button.textContent = "WhatsApp ouvert";
  button.disabled = true;
}

function renderActivitiesAndProgram() {
  const actBox = document.getElementById("activitiesListBox");
  const progBox = document.getElementById("programListBox");

  if (actBox) {
    if (!db.activites.length) {
      actBox.innerHTML = `<p class="muted">Aucune activité enregistrée.</p>`;
    } else {
      actBox.innerHTML = db.activites.map((a) => {
        const dLeft = daysUntilDate(a.date);
        const ackKey = `${a.id}__${currentUser && currentUser.chefId ? currentUser.chefId : "cu"}`;
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
    if (!db.programmeEvents.length) {
      progBox.innerHTML = `<p class="muted">Aucun événement dans le programme.</p>`;
    } else {
      progBox.innerHTML = db.programmeEvents.map((ev) => {
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

// --- BANDEAU CENTRALISÉ "À TRAITER MAINTENANT" (J-14, PROGRAMME, 3 ABSENCES, CU) ---
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
    const dLeft = daysUntilDate(a.date);
    const ackKey = `${a.id}__${currentUser && currentUser.chefId ? currentUser.chefId : "cu"}`;
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

  (db.scouts || []).forEach((s) => {
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

// --- TABLEAU DE BORD, BILAN PAR BRANCHE & LOGS ---
function renderDashboard() {
  const statsBox = document.getElementById("dashboardStats");
  const branchBox = document.getElementById("branchSummaryBox");
  const absBox = document.getElementById("absencesAlertsBox");
  const logsBox = document.getElementById("recentLogsBox");

  const totalScouts = (db.scouts || []).length;
  const totalChefs = (db.chefs || []).length;
  const totalRecettes = (db.finances || [])
    .filter((f) => f.type === "recette")
    .reduce((acc, f) => acc + Number(f.montant || 0), 0);
  const alerts3Abs = (db.scouts || []).filter((s) => getConsecutiveAbsences(s.id) >= 3 && !db.parentMeetingsDone[s.id]);

  if (statsBox) {
    statsBox.innerHTML = `
      <div class="stat-box"><div class="muted small">Jeunes inscrits</div><div class="stat-value">${totalScouts}</div></div>
      <div class="stat-box"><div class="muted small">Chefs d'Unité</div><div class="stat-value">${totalChefs}</div></div>
      <div class="stat-box"><div class="muted small">Encaissements enregistrés</div><div class="stat-value">${escapeHtml(formatMoney(totalRecettes))}</div></div>
      <div class="stat-box"><div class="muted small">Alertes 3 absences</div><div class="stat-value">${alerts3Abs.length}</div></div>
    `;
  }

  if (branchBox) {
    branchBox.innerHTML = BRANCHES.map((br) => {
      const count = (db.scouts || []).filter((s) => s.branche === br).length;
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
      ? items.map((l) => `<div class="small" style="padding:5px 0; border-bottom:1px solid var(--border);"><strong>${escapeHtml(l.category)}</strong> — ${escapeHtml(l.recipientLabel || "")} <span class="muted">(${escapeHtml(String(l.sentAt || "").slice(0, 16).replace("T", " "))})</span></div>`).join("")
      : `<p class="muted small">Aucune conversation WhatsApp ouverte récemment.</p>`;
  }
}

// --- PARAMÈTRES & EXPORTS ---
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
}

async function saveSettings(event) {
  event.preventDefault();
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
  const header = ["Prenom", "Nom", "Branche", "Matricule", "Parent", "Tel_Parent", "Allergies"];
  const lines = [header.join(";")];
  (db.scouts || []).forEach((s) => {
    lines.push([
      s.prenom,
      s.nom,
      s.branche,
      s.matricule || "",
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

function renderAll() {
  populateChefLoginSelect();
  populateReceiptScoutSelect();
  populateSettingsForm();
  renderSmartRemindersPanel();
  renderDashboard();
  renderEffectifsAndPresences();
  renderCotisationsSuivi();
  renderActivitiesAndProgram();
}

document.addEventListener("DOMContentLoaded", async () => {
  const today = new Date().toISOString().slice(0, 10);
  const pDate = document.getElementById("presenceDateInput");
  const rDate = document.getElementById("rc_date");
  if (pDate && !pDate.value) pDate.value = today;
  if (rDate && !rDate.value) rDate.value = today;

  populateChefLoginSelect();
  document.getElementById("loginScreen").style.display = "grid";
  document.getElementById("appShell").style.display = "none";

  ["click", "keydown", "touchstart", "mousemove"].forEach((eventName) => {
    document.addEventListener(eventName, () => {
      if (currentUser) resetIdleTimer();
    }, { passive: true });
  });
});
