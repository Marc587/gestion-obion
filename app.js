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
firestoreDb.settings({
  experimentalForceLongPolling: true,
  useFetchStreams: false
});
const docRefObion = firestoreDb.collection("erp_obion").doc("groupe_principal");

const BACKUP_KEY = "obion_erp_backup_v1";
const SESSION_KEY = "obion_erp_session_v1";
const BRANCHES = ["Oisillon", "Meute", "Troupe", "Chemin", "Route"];

function cloneSafe(obj) {
  try {
    if (typeof structuredClone === "function") return structuredClone(obj);
  } catch (e) {}
  return JSON.parse(JSON.stringify(obj));
}

const defaultData = {
  scouts: [],
  chefs: [],
  camps: [],
  activites: [],
  presences: [],
  finances: [],
  dons: [],
  materiel: [],
  auditLog: [],
  cotisationsCustom: [],
  cotisationPayments: {},
  activityPayments: {},
  settings: {
    cg_nom: "Chef de Groupe Obion",
    cg_tel: "",
    wave_url: "",
    logo_app: "logo-app.jpg",
    logo_district: "logo-district.jpg",
    logo_groupe: "logo.jpg",
    cachet_actif: true,
    cot_j_total: 2500,
    cot_j_ascci: 2085,
    cot_j_groupe: 415,
    cot_mens_j: 500,
    pins: {
      cg: "1111",
      financier: "2222",
      cu: "3333"
    },
    prog: {
      Oisillon: "Découverte, Petit pas, Aile déployée",
      Meute: "Patte tendre, 1re étoile, 2e étoile, 3e étoile",
      Troupe: "Aspirant, 2e classe, 1re classe, Brevet",
      Chemin: "En route, Compagnon de route, Engagement",
      Route: "Novice, Routier engagé, Service communautaire"
    }
  }
};

function normalizeDb(raw) {
  const base = cloneSafe(defaultData);
  if (!raw || typeof raw !== "object") return base;
  return {
    scouts: Array.isArray(raw.scouts) ? raw.scouts : [],
    chefs: Array.isArray(raw.chefs) ? raw.chefs : [],
    camps: Array.isArray(raw.camps) ? raw.camps : [],
    activites: Array.isArray(raw.activites) ? raw.activites : [],
    presences: Array.isArray(raw.presences) ? raw.presences : [],
    finances: Array.isArray(raw.finances) ? raw.finances : [],
    dons: Array.isArray(raw.dons) ? raw.dons : [],
    materiel: Array.isArray(raw.materiel) ? raw.materiel : [],
    auditLog: Array.isArray(raw.auditLog) ? raw.auditLog : [],
    cotisationsCustom: Array.isArray(raw.cotisationsCustom) ? raw.cotisationsCustom : [],
    cotisationPayments: raw.cotisationPayments && typeof raw.cotisationPayments === "object" ? raw.cotisationPayments : {},
    activityPayments: raw.activityPayments && typeof raw.activityPayments === "object" ? raw.activityPayments : {},
    settings: {
      ...base.settings,
      ...(raw.settings || {}),
      pins: {
        ...base.settings.pins,
        ...((raw.settings && raw.settings.pins) || {})
      },
      prog: {
        ...base.settings.prog,
        ...((raw.settings && raw.settings.prog) || {})
      }
    }
  };
}

function readLocalBackup() {
  try {
    return normalizeDb(JSON.parse(localStorage.getItem(BACKUP_KEY) || "null"));
  } catch (e) {
    return cloneSafe(defaultData);
  }
}

function readSession() {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null");
  } catch (e) {
    return null;
  }
}

let db = readLocalBackup();
let currentUser = readSession();
let currentActiveTab = "dashboard";
let isSavingCloud = false;
let unsubscribeRealtime = null;
let quickAppelStates = {};
let lastReceiptText = "";

function uid(prefix = "id") {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function formatMoney(val) {
  const n = Number(val || 0);
  return `${n.toLocaleString("fr-FR")} FCFA`;
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeWaPhone(rawPhone) {
  const digits = String(rawPhone || "").replace(/[^0-9]/g, "");
  if (!digits) return "";
  if (digits.startsWith("00225")) return digits.slice(2);
  if (digits.startsWith("225")) return digits;
  return `225${digits}`;
}

function setSyncStatus(text, ok = true) {
  const el = document.getElementById("syncStatus");
  if (!el) return;
  el.textContent = text;
  el.style.background = ok ? "rgba(22, 163, 74, 0.25)" : "rgba(220, 38, 38, 0.28)";
}

async function persistDb(auditAction = "", auditDetail = "") {
  if (auditAction && currentUser) {
    db.auditLog.unshift({
      id: uid("log"),
      date: new Date().toLocaleString("fr-FR"),
      auteur: `${currentUser.role.toUpperCase()}${currentUser.branche ? " (" + currentUser.branche + ")" : ""}`,
      action: auditAction,
      detail: auditDetail
    });
    db.auditLog = db.auditLog.slice(0, 150);
  }

  db = normalizeDb(db);
  try {
    localStorage.setItem(BACKUP_KEY, JSON.stringify(db));
  } catch (e) {
    console.warn("Erreur localStorage:", e);
  }

  renderAllViews();

  if (isSavingCloud) return;
  isSavingCloud = true;
  setSyncStatus("☁️ Synchronisation...", true);

  try {
    await docRefObion.set(db);
    setSyncStatus("☁️ Synchronisé", true);
  } catch (err) {
    console.error("Erreur Firestore set:", err);
    setSyncStatus("⚠️ Local uniquement (vérifier règles)", false);
  } finally {
    isSavingCloud = false;
  }
}

function startRealtimeSync() {
  if (typeof unsubscribeRealtime === "function") unsubscribeRealtime();
  setSyncStatus("⏳ Connexion cloud...", true);
  unsubscribeRealtime = docRefObion.onSnapshot(
    (snap) => {
      if (snap && snap.exists && !isSavingCloud) {
        db = normalizeDb(snap.data());
        try {
          localStorage.setItem(BACKUP_KEY, JSON.stringify(db));
        } catch (e) {}
        if (currentUser) renderAllViews();
      }
      setSyncStatus("☁️ Synchronisé", true);
    },
    (err) => {
      console.error("Erreur onSnapshot:", err);
      setSyncStatus("⚠️ Local uniquement", false);
    }
  );
}

/* LOGOS (DISTRICT À GAUCHE, GROUPE À DROITE) & CACHET */
function getPrintHeaderWithSideLogos(titleText, subtitleText = "") {
  const s = db.settings || {};
  const logoDistrict = s.logo_district || "logo-district.jpg";
  const logoGroupe = s.logo_groupe || "logo.jpg";

  return `
    <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #1b4332; padding-bottom:10px; margin-bottom:14px; gap:12px;">
      <div style="flex:0 0 auto;">
        <img src="${escapeHtml(logoDistrict)}" alt="Logo District"
          style="width:48px; height:48px; border-radius:50%; object-fit:cover; border:1px solid #1b4332;"
          onerror="this.style.display='none'">
      </div>
      <div style="flex:1; text-align:center;">
        <h2 style="margin:0; font-size:1.15rem; color:#1b4332;">${escapeHtml(titleText)}</h2>
        ${subtitleText ? `<p style="margin:4px 0 0; font-size:0.85rem; color:#334155;">${escapeHtml(subtitleText)}</p>` : ""}
      </div>
      <div style="flex:0 0 auto;">
        <img src="${escapeHtml(logoGroupe)}" alt="Logo Groupe OBION"
          style="width:48px; height:48px; border-radius:50%; object-fit:cover; border:1px solid #1b4332;"
          onerror="this.style.display='none'">
      </div>
    </div>
  `;
}

function getPrintCachetHtml(label = "CACHET NUMÉRIQUE · CHEF DE GROUPE") {
  if (!db.settings || !db.settings.cachet_actif) return "";
  const cgNom = (db.settings && db.settings.cg_nom) || "Chef de Groupe Obion";
  const cgTel = (db.settings && db.settings.cg_tel) || "";

  return `
    <div style="margin-top:16px; display:flex; justify-content:flex-end;">
      <div style="border:2px solid #1b4332; background:#f8fafc; color:#1b4332; padding:10px 16px; border-radius:6px; font-size:0.82rem; line-height:1.45; min-width:230px; text-align:left; transform:none;">
        <div style="font-weight:700; text-transform:uppercase; border-bottom:1px solid #cbd5e1; padding-bottom:4px; margin-bottom:5px;">
          ${escapeHtml(label)}
        </div>
        <div><strong>Groupe :</strong> OBION</div>
        <div><strong>Chef de Groupe :</strong> ${escapeHtml(cgNom)}</div>
        ${cgTel ? `<div><strong>Contact :</strong> ${escapeHtml(cgTel)}</div>` : ""}
      </div>
    </div>
  `;
}

function generateReceiptNumber(dateStr) {
  const year = String(dateStr || new Date().toISOString().slice(0, 10)).slice(0, 4) || "2026";
  const seq = String((db.finances ? db.finances.length : 0) + 1).padStart(4, "0");
  return `OBION-${year}-${seq}`;
}

function buildSpecialReceiptHtml({ numero, date, nomJeune, brancheJeune, matricule, motif, detail, montant }) {
  const cgNom = (db.settings && db.settings.cg_nom) || "Chef de Groupe Obion";
  const cgTel = (db.settings && db.settings.cg_tel) || "";

  return `
    <div class="receipt-box" id="printableReceiptCard" style="border:2px solid #1b4332; background:#ffffff; padding:20px; border-radius:10px;">
      ${getPrintHeaderWithSideLogos("REÇU OFFICIEL DE PAIEMENT", "GROUPE SCOUT OBION · DISTRICT")}
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; background:#f4f6f5; padding:8px 12px; border-radius:6px; margin-bottom:14px; font-size:0.84rem;">
        <div><strong>N° Reçu :</strong> ${escapeHtml(numero)}</div>
        <div><strong>Date :</strong> ${escapeHtml(date)}</div>
        <div><span class="badge badge-green">PAIEMENT ENREGISTRÉ</span></div>
      </div>
      <p><strong>Jeune / Membre :</strong> ${escapeHtml(nomJeune)}${brancheJeune ? ` — Branche <strong>${escapeHtml(brancheJeune)}</strong>` : ""}</p>
      ${matricule ? `<p><strong>Matricule :</strong> ${escapeHtml(matricule)}</p>` : ""}
      <p><strong>Motif :</strong> ${escapeHtml(motif)}${detail ? ` (${escapeHtml(detail)})` : ""}</p>
      <p style="margin-top:10px; font-size:1.1rem; color:#1b4332;"><strong>Montant perçu :</strong> ${formatMoney(montant)}</p>
      <p style="margin-top:10px; font-size:0.78rem; color:#64748b;">
        Ce reçu atteste de l'enregistrement de l'opération dans les registres du Groupe Scout OBION.
      </p>
      <div style="display:flex; justify-content:space-between; align-items:flex-end; gap:16px; flex-wrap:wrap; margin-top:14px;">
        <div style="font-size:0.82rem; color:#334155;">
          <strong>Validation Trésorerie / Groupe</strong><br>
          <span>${escapeHtml(cgNom)}${cgTel ? " · " + escapeHtml(cgTel) : ""}</span>
        </div>
        ${getPrintCachetHtml("CACHET NUMÉRIQUE · CHEF DE GROUPE")}
      </div>
    </div>
  `;
}

function openReceiptModal(financeId = null) {
  if (!canManageFinances()) return;
  const f = financeId ? db.finances.find((x) => x.id === financeId) : null;
  const scoutOptions = db.scouts.map((s) => `<option value="${s.id}">${escapeHtml(s.nom)} ${escapeHtml(s.prenom)} (${escapeHtml(s.branche)})</option>`).join("");
  const defaultDate = f && f.date ? f.date : new Date().toISOString().slice(0, 10);

  openModal("Générer un reçu de paiement", `
    <form onsubmit="buildReceiptPreview(event)">
      <div class="form-row">
        <div class="form-group"><label>Jeune / Membre</label><select id="rc_scout">${scoutOptions}</select></div>
        <div class="form-group">
          <label>Motif</label>
          <select id="rc_motif">
            <option value="Cotisation annuelle">Cotisation annuelle</option>
            <option value="Cotisation mensuelle">Cotisation mensuelle</option>
            <option value="Paiement d'activité">Paiement d'activité</option>
            <option value="Participation camp">Participation camp</option>
            <option value="Autre cotisation">Autre cotisation</option>
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>N° Reçu</label><input type="text" id="rc_numero" value="${escapeHtml(generateReceiptNumber(defaultDate))}" required></div>
        <div class="form-group"><label>Montant (FCFA) *</label><input type="number" id="rc_montant" min="1" value="${f ? Number(f.montant || 0) : Number(db.settings.cot_mens_j || 500)}" required></div>
        <div class="form-group"><label>Date *</label><input type="date" id="rc_date" value="${escapeHtml(defaultDate)}" required></div>
      </div>
      <div class="form-group"><label>Précision / Référence</label><input type="text" id="rc_detail" value="${escapeHtml(f ? f.libelle : "")}"></div>
      <button type="submit" class="btn btn-accent">Prévisualiser le reçu</button>
    </form>
    <div id="receiptPreviewArea" style="margin-top:16px;"></div>
  `);
}

function openReceiptForScout(scoutId, motifLabel, montantVal) {
  openReceiptModal();
  setTimeout(() => {
    const sel = document.getElementById("rc_scout");
    const det = document.getElementById("rc_detail");
    const mnt = document.getElementById("rc_montant");
    if (sel) sel.value = scoutId;
    if (det) det.value = motifLabel;
    if (mnt) mnt.value = montantVal;
  }, 30);
}

function buildReceiptPreview(e) {
  e.preventDefault();
  const scout = db.scouts.find((s) => s.id === document.getElementById("rc_scout").value);
  const numero = document.getElementById("rc_numero").value.trim() || generateReceiptNumber(document.getElementById("rc_date").value);
  const motif = document.getElementById("rc_motif").value;
  const montant = Number(document.getElementById("rc_montant").value || 0);
  const date = document.getElementById("rc_date").value;
  const detail = document.getElementById("rc_detail").value.trim();

  const nomJeune = scout ? `${scout.nom} ${scout.prenom}` : "Membre";
  const brancheJeune = scout ? scout.branche : "";
  const matricule = scout && scout.matricule ? scout.matricule : "";

  lastReceiptText = [
    `REÇU OFFICIEL DE PAIEMENT — GROUPE SCOUT OBION`,
    `N° Reçu : ${numero}`,
    `Date : ${date}`,
    `Membre : ${nomJeune}${brancheJeune ? " (" + brancheJeune + ")" : ""}`,
    matricule ? `Matricule : ${matricule}` : "",
    `Motif : ${motif}${detail ? " — " + detail : ""}`,
    `Montant : ${formatMoney(montant)}`
  ].filter(Boolean).join("\n");

  document.getElementById("receiptPreviewArea").innerHTML = `
    ${buildSpecialReceiptHtml({ numero, date, nomJeune, brancheJeune, matricule, motif, detail, montant })}
    <div class="actions-row" style="margin-top:12px;">
      <button type="button" class="btn btn-sm btn-success" onclick="copyLastReceipt()">📋 Copier le reçu</button>
      <button type="button" class="btn btn-sm btn-secondary" onclick="printReceiptCard()">🖨️ Imprimer / PDF</button>
    </div>
  `;
}

function copyLastReceipt() {
  if (!lastReceiptText) return;
  navigator.clipboard?.writeText(lastReceiptText);
  alert("Reçu copié !");
}

function printReceiptCard() {
  const card = document.getElementById("printableReceiptCard");
  if (!card) return;
  triggerPrintHtml(card.outerHTML);
}

/* AUTHENTIFICATION & ACCÈS INDIVIDUEL CU */
function toggleLoginBranch() {
  const role = document.getElementById("loginRole").value;
  document.getElementById("loginBranchGroup").style.display = role === "cu" ? "block" : "none";
}

function handleLogin(e) {
  e.preventDefault();
  const role = document.getElementById("loginRole").value;
  const branche = role === "cu" ? document.getElementById("loginBranch").value : null;
  const pin = document.getElementById("loginPin").value.trim();

  if (role === "cu") {
    const cuChefs = db.chefs.filter((c) => c.branche === branche);
    const individualMatch = cuChefs.find((c) => c.pin && String(c.pin).trim() === pin);
    const hasAnyIndividualPin = cuChefs.some((c) => c.pin && String(c.pin).trim().length > 0);
    const fallbackPin = (db.settings.pins && db.settings.pins.cu) || "3333";

    if (individualMatch) {
      currentUser = {
        role: "cu",
        branche,
        chefId: individualMatch.id,
        chefNom: individualMatch.nom,
        loginAt: Date.now()
      };
    } else if (!hasAnyIndividualPin && pin === fallbackPin) {
      currentUser = {
        role: "cu",
        branche,
        chefId: null,
        chefNom: `CU ${branche}`,
        loginAt: Date.now()
      };
    } else {
      alert("PIN individuel ou branche incorrect pour ce Chef d'Unité.");
      return;
    }
  } else {
    const expectedPin = (db.settings.pins && db.settings.pins[role]) || (role === "cg" ? "1111" : "2222");
    if (pin !== expectedPin) {
      alert("Code PIN incorrect pour ce rôle.");
      return;
    }
    currentUser = { role, branche: null, loginAt: Date.now() };
  }

  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(currentUser));
  } catch (err) {}
  showAppShell();
}

function handleLogout() {
  currentUser = null;
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch (err) {}
  document.getElementById("appShell").style.display = "none";
  document.getElementById("loginScreen").style.display = "flex";
  document.getElementById("loginPin").value = "";
}

function isCG() { return currentUser && currentUser.role === "cg"; }
function isFinancier() { return currentUser && currentUser.role === "financier"; }
function isCU() { return currentUser && currentUser.role === "cu"; }
function canManageFinances() { return isCG() || isFinancier(); }
function canManageStructure() { return isCG(); }

function getScopedScouts() {
  if (isCU() && currentUser.branche) {
    return db.scouts.filter((s) => s.branche === currentUser.branche);
  }
  return db.scouts;
}

function getScopedChefs() {
  if (isCU() && currentUser.branche) {
    return db.chefs.filter((c) => c.branche === currentUser.branche);
  }
  return db.chefs;
}

function getScopedCamps() {
  if (isCU() && currentUser.branche) {
    return db.camps.filter((c) => c.type === "branche" && c.branche === currentUser.branche);
  }
  return db.camps;
}

function getScopedProgramme() {
  if (isCU() && currentUser.branche) {
    return db.activites.filter((a) =>
      a.cible === "cu_only" ||
      a.cible === "tous_chefs" ||
      (a.branche && a.branche === currentUser.branche)
    );
  }
  return db.activites;
}

function showAppShell() {
  document.getElementById("loginScreen").style.display = "none";
  document.getElementById("appShell").style.display = "block";

  const roleLabels = {
    cg: "Chef de Groupe",
    financier: "Financier / Trésorier",
    cu: currentUser.chefNom || "Chef d'Unité"
  };

  document.getElementById("activeUserLabel").textContent =
    currentUser.role === "cg" ? (db.settings.cg_nom || "Chef de Groupe") : roleLabels[currentUser.role];

  document.getElementById("activeRoleBadge").textContent =
    currentUser.role === "cu" ? "Chef d'Unité (CU)" : roleLabels[currentUser.role];

  const scopeBadge = document.getElementById("activeScopeBadge");
  if (isCU()) {
    scopeBadge.textContent = `Branche : ${currentUser.branche}`;
    scopeBadge.className = "badge badge-amber";
  } else {
    scopeBadge.textContent = "Périmètre : Groupe OBION";
    scopeBadge.className = "badge badge-blue";
  }

  applyRoleVisibility();
  initDefaultControls();
  renderAllViews();
}

function applyRoleVisibility() {
  const cuMode = isCU();
  document.querySelector('[data-tab="finances"]').style.display = cuMode ? "none" : "inline-flex";
  document.querySelector('[data-tab="parametres"]').style.display = isCG() ? "inline-flex" : "none";
  document.getElementById("btnAddChef").style.display = canManageStructure() ? "inline-flex" : "none";
  document.getElementById("btnAddActivite").style.display = canManageStructure() ? "inline-flex" : "none";
  document.getElementById("btnAddCamp").style.display = canManageStructure() ? "inline-flex" : "none";
  document.getElementById("btnQuickReceiptDash").style.display = canManageFinances() ? "inline-flex" : "none";

  if (cuMode && (currentActiveTab === "finances" || currentActiveTab === "parametres")) {
    currentActiveTab = "dashboard";
  }
}

function initDefaultControls() {
  const today = new Date().toISOString().slice(0, 10);
  const month = new Date().toISOString().slice(0, 7);

  const dateInput = document.getElementById("appelDateInput");
  if (dateInput && !dateInput.value) dateInput.value = today;

  const monthPicker = document.getElementById("financeMonthPicker");
  if (monthPicker && !monthPicker.value) monthPicker.value = month;

  const appelBranche = document.getElementById("appelBrancheSelect");
  const filterBranche = document.getElementById("filterScoutBranche");
  const pedagoBranche = document.getElementById("pedagoBrancheSelect");

  if (isCU() && currentUser.branche) {
    appelBranche.value = currentUser.branche;
    appelBranche.disabled = true;
    filterBranche.value = currentUser.branche;
    filterBranche.disabled = true;
    pedagoBranche.value = currentUser.branche;
    pedagoBranche.disabled = true;
  } else {
    appelBranche.disabled = false;
    filterBranche.disabled = false;
    pedagoBranche.disabled = false;
  }

  applyAnnonceTemplate();
}

function switchTab(tabName) {
  if (isCU() && (tabName === "finances" || tabName === "parametres")) {
    tabName = "dashboard";
  }
  currentActiveTab = tabName;
  document.querySelectorAll(".nav-tab").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tabName);
  });
  document.querySelectorAll(".tab-panel").forEach((panel) => {
    panel.classList.toggle("active", panel.id === `tab-${tabName}`);
  });
  renderAllViews();
}

function renderAllViews() {
  if (!currentUser) return;
  applyRoleVisibility();
  renderDashboard();
  renderTenueMatriculeSummary();
  renderEffectifs();
  renderQuickAppel();
  renderPresencesHistory();
  renderProgrammeAnnuel();
  renderCamps();
  renderPedagogie();
  renderMateriel();
  if (canManageFinances()) {
    renderFinances();
  }
  renderAnnonceRecipients();
  if (isCG()) {
    renderSettingsInputs();
  }
}

function computeGenderStats(list) {
  const total = list.length;
  const garcons = list.filter((x) => x.sexe === "Garçon").length;
  const filles = list.filter((x) => x.sexe === "Fille").length;
  const pctG = total ? Math.round((garcons / total) * 100) : 0;
  const pctF = total ? Math.round((filles / total) * 100) : 0;
  return { total, garcons, filles, pctG, pctF };
}

/* 1. TABLEAU DE BORD, ALERTES & RÉCAPITULATIF TENUE / MATRICULE */
function renderDashboard() {
  const scouts = getScopedScouts();
  const chefs = getScopedChefs();
  const sStats = computeGenderStats(scouts);
  const cStats = computeGenderStats(chefs);
  const solde = db.finances.reduce((acc, f) => acc + (f.type === "entree" ? Number(f.montant || 0) : -Number(f.montant || 0)), 0);

  document.getElementById("dashKpiGrid").innerHTML = `
    <div class="kpi-box">
      <div class="kpi-label">Total Jeunes (${isCU() ? currentUser.branche : "Groupe"})</div>
      <div class="kpi-value">${sStats.total}</div>
      <div class="kpi-sub">Garçons : ${sStats.garcons} (${sStats.pctG}%) · Filles : ${sStats.filles} (${sStats.pctF}%)</div>
    </div>
    <div class="kpi-box">
      <div class="kpi-label">Maîtrise / Chefs</div>
      <div class="kpi-value">${cStats.total}</div>
      <div class="kpi-sub">Garçons : ${cStats.garcons} (${cStats.pctG}%) · Filles : ${cStats.filles} (${cStats.pctF}%)</div>
    </div>
    <div class="kpi-box">
      <div class="kpi-label">Programme visible</div>
      <div class="kpi-value">${getScopedProgramme().length}</div>
      <div class="kpi-sub">Camps visibles : ${getScopedCamps().length}</div>
    </div>
    ${canManageFinances() ? `
    <div class="kpi-box">
      <div class="kpi-label">Solde Trésorerie</div>
      <div class="kpi-value">${formatMoney(solde)}</div>
      <div class="kpi-sub">Dons : ${db.dons.length}</div>
    </div>` : `
    <div class="kpi-box">
      <div class="kpi-label">Sans tenue scoute</div>
      <div class="kpi-value">${scouts.filter((s) => !s.tenue_complete).length}</div>
      <div class="kpi-sub">À signaler aux parents</div>
    </div>`}
  `;

  const branchesToShow = isCU() && currentUser.branche ? [currentUser.branche] : BRANCHES;
  document.getElementById("dashGenderTableBody").innerHTML = branchesToShow.map((br) => {
    const st = computeGenderStats(scouts.filter((s) => s.branche === br));
    const bChefs = chefs.filter((c) => c.branche === br).length;
    return `
      <tr>
        <td><strong>${escapeHtml(br)}</strong></td>
        <td>${st.total}</td>
        <td>${st.garcons} (${st.pctG}%)</td>
        <td>${st.filles} (${st.pctF}%)</td>
        <td>${bChefs}</td>
      </tr>
    `;
  }).join("");

  const alerts = [];
  const noPhone = scouts.filter((s) => !s.parent_tel || !s.parent_tel.trim());
  const noTenue = scouts.filter((s) => !s.tenue_complete);
  const noMatricule = scouts.filter((s) => !s.matricule || !s.matricule.trim());

  if (noPhone.length) alerts.push(`<div class="alert-item"><span>📱 <strong>${noPhone.length}</strong> jeune(s) sans numéro parent.</span><button type="button" class="btn btn-sm btn-secondary" onclick="switchTab('effectifs')">Compléter</button></div>`);
  if (noTenue.length) alerts.push(`<div class="alert-item info"><span>⚜️ <strong>${noTenue.length}</strong> jeune(s) sans tenue scoute.</span></div>`);
  if (noMatricule.length) alerts.push(`<div class="alert-item danger"><span>🆔 <strong>${noMatricule.length}</strong> jeune(s) sans matricule enregistré.</span></div>`);

  document.getElementById("dashAlertsContainer").innerHTML = alerts.length
    ? alerts.join("")
    : `<p style="color:var(--muted); font-size:0.88rem;">Aucune alerte bloquante.</p>`;
}

function renderTenueMatriculeSummary() {
  const tbody = document.getElementById("tenueMatriculeTableBody");
  if (!tbody) return;

  const list = getScopedScouts().filter((s) => !s.tenue_complete || !s.matricule || !s.matricule.trim());
  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--muted);">Tous les jeunes visibles ont une tenue complète et un matricule.</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map((s) => {
    const missingTenue = !s.tenue_complete;
    const missingMat = !s.matricule || !s.matricule.trim();
    let situationBadge = "";
    let presetMsg = "";

    if (missingTenue && missingMat) {
      situationBadge = `<span class="badge badge-red">Sans tenue & Sans matricule</span>`;
      presetMsg = `Bonjour chers parents (Groupe OBION), nous vous informons que ${s.prenom} ${s.nom} (${s.branche}) n'a pas encore de tenue scoute complète et que son matricule est en attente de régularisation. Merci de nous contacter.`;
    } else if (missingTenue) {
      situationBadge = `<span class="badge badge-amber">Sans tenue</span>`;
      presetMsg = `Bonjour chers parents (Groupe OBION), nous vous signalons que ${s.prenom} ${s.nom} (${s.branche}) n'a pas encore de tenue scoute complète. Merci de prévoir de la régulariser pour les activités.`;
    } else {
      situationBadge = `<span class="badge badge-blue">Sans matricule</span>`;
      presetMsg = `Bonjour chers parents (Groupe OBION), le matricule de ${s.prenom} ${s.nom} (${s.branche}) n'est pas encore enregistré. Merci de vous rapprocher de la trésorerie / maîtrise pour le suivi.`;
    }

    const waPhone = normalizeWaPhone(s.parent_tel);
    const waHref = waPhone ? `https://wa.me/${waPhone}?text=${encodeURIComponent(presetMsg)}` : "";

    return `
      <tr>
        <td><strong>${escapeHtml(s.nom)} ${escapeHtml(s.prenom)}</strong></td>
        <td>${escapeHtml(s.branche)}</td>
        <td>${situationBadge}</td>
        <td>${escapeHtml(s.parent_nom || "Parent")} — ${escapeHtml(s.parent_tel || "Non renseigné")}</td>
        <td>
          <div style="font-size:0.78rem; color:#334155; margin-bottom:6px;">${escapeHtml(presetMsg)}</div>
          ${waHref
            ? `<a href="${waHref}" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-success">Envoyer sur WhatsApp</a>`
            : `<span class="badge badge-gray">Numéro absent</span>`}
        </td>
      </tr>
    `;
  }).join("");
}

/* 2. EFFECTIFS & AJOUT DE CHEFS / ACCÈS CU */
function renderEffectifs() {
  const filterBr = document.getElementById("filterScoutBranche").value;
  const query = (document.getElementById("searchScoutInput").value || "").trim().toLowerCase();

  let list = getScopedScouts();
  if (filterBr && filterBr !== "Toutes") list = list.filter((s) => s.branche === filterBr);
  if (query) {
    list = list.filter((s) => `${s.nom} ${s.prenom} ${s.matricule || ""} ${s.parent_nom || ""}`.toLowerCase().includes(query));
  }

  const st = computeGenderStats(list);
  document.getElementById("scoutStatsBar").innerHTML = `
    <div class="kpi-box"><div class="kpi-label">Effectif filtré</div><div class="kpi-value">${st.total}</div></div>
    <div class="kpi-box"><div class="kpi-label">Garçons</div><div class="kpi-value">${st.garcons} <small>(${st.pctG}%)</small></div></div>
    <div class="kpi-box"><div class="kpi-label">Filles</div><div class="kpi-value">${st.filles} <small>(${st.pctF}%)</small></div></div>
    <div class="kpi-box"><div class="kpi-label">Avec matricule</div><div class="kpi-value">${list.filter((x) => x.matricule).length}</div></div>
  `;

  document.getElementById("scoutsTableBody").innerHTML = list.length ? list.map((s) => `
    <tr>
      <td>
        <strong>${escapeHtml(s.nom)} ${escapeHtml(s.prenom)}</strong><br>
        <small style="color:var(--muted);">${s.allergies ? "🩺 " + escapeHtml(s.allergies) : ""}</small>
      </td>
      <td><span class="badge badge-blue">${escapeHtml(s.branche)}</span></td>
      <td>${escapeHtml(s.sexe || "-")}</td>
      <td>${s.tenue_complete ? `<span class="badge badge-green">Complète</span>` : `<span class="badge badge-amber">À prévoir</span>`}</td>
      <td>
        ${escapeHtml(s.parent_nom || "Parent")}<br>
        <small>${escapeHtml(s.parent_tel || "Non renseigné")}</small>
      </td>
      <td>
        ${s.cotisation_annuelle === "paye" ? `<span class="badge badge-green">Annuelle OK</span>` : `<span class="badge badge-gray">En attente</span>`}<br>
        <small>${escapeHtml(s.matricule || "Sans matricule")}</small>
      </td>
      <td>
        <div class="actions-row">
          <button type="button" class="btn btn-sm btn-secondary" onclick="openScoutModal('${s.id}')">Modifier</button>
          ${canManageStructure() ? `<button type="button" class="btn btn-sm btn-danger" onclick="deleteScout('${s.id}')">Suppr.</button>` : ""}
        </div>
      </td>
    </tr>
  `).join("") : `<tr><td colspan="7" style="text-align:center; color:var(--muted);">Aucun jeune trouvé.</td></tr>`;

  const chefs = getScopedChefs();
  const cSt = computeGenderStats(chefs);
  document.getElementById("chefsStatsBar").innerHTML =
    `Total maîtrise : <strong>${cSt.total}</strong> · Garçons : <strong>${cSt.garcons} (${cSt.pctG}%)</strong> · Filles : <strong>${cSt.filles} (${cSt.pctF}%)</strong>`;

  document.getElementById("chefsTableBody").innerHTML = chefs.length ? chefs.map((c) => `
    <tr>
      <td><strong>${escapeHtml(c.nom)}</strong></td>
      <td>${escapeHtml(c.fonction || "Chef")}</td>
      <td>${escapeHtml(c.branche || "Groupe")}</td>
      <td>${escapeHtml(c.sexe || "-")}</td>
      <td>${escapeHtml(c.tel || "-")}</td>
      <td>${canManageStructure() ? (c.pin ? `<span class="badge badge-blue">${escapeHtml(c.pin)}</span>` : `<span class="badge badge-gray">Défaut</span>`) : `<span class="badge badge-gray">Masqué</span>`}</td>
      <td>
        ${canManageStructure() ? `
          <button type="button" class="btn btn-sm btn-secondary" onclick="openChefModal('${c.id}')">Modifier</button>
          <button type="button" class="btn btn-sm btn-danger" onclick="deleteChef('${c.id}')">Suppr.</button>
        ` : `<span class="badge badge-gray">Lecture</span>`}
      </td>
    </tr>
  `).join("") : `<tr><td colspan="7" style="text-align:center; color:var(--muted);">Aucun chef enregistré.</td></tr>`;
}

function openScoutModal(scoutId = null) {
  const existing = scoutId ? db.scouts.find((s) => s.id === scoutId) : null;
  const defaultBr = isCU() && currentUser.branche ? currentUser.branche : (existing ? existing.branche : "Meute");

  openModal(existing ? "Modifier la fiche jeune" : "Ajouter un jeune", `
    <form onsubmit="saveScout(event, '${existing ? existing.id : ""}')">
      <div class="form-row">
        <div class="form-group"><label>Nom *</label><input type="text" id="sc_nom" value="${escapeHtml(existing ? existing.nom : "")}" required></div>
        <div class="form-group"><label>Prénoms *</label><input type="text" id="sc_prenom" value="${escapeHtml(existing ? existing.prenom : "")}" required></div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Branche *</label>
          <select id="sc_branche" ${isCU() && currentUser.branche ? "disabled" : ""}>
            ${BRANCHES.map((b) => `<option value="${b}" ${defaultBr === b ? "selected" : ""}>${b}</option>`).join("")}
          </select>
        </div>
        <div class="form-group">
          <label>Sexe *</label>
          <select id="sc_sexe">
            <option value="Garçon" ${existing && existing.sexe === "Garçon" ? "selected" : ""}>Garçon</option>
            <option value="Fille" ${existing && existing.sexe === "Fille" ? "selected" : ""}>Fille</option>
          </select>
        </div>
        <div class="form-group">
          <label>Tenue scoute</label>
          <select id="sc_tenue">
            <option value="1" ${!existing || existing.tenue_complete ? "selected" : ""}>Tenue complète</option>
            <option value="0" ${existing && !existing.tenue_complete ? "selected" : ""}>Sans tenue / Incomplète</option>
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Nom du parent</label><input type="text" id="sc_parent_nom" value="${escapeHtml(existing ? existing.parent_nom : "")}"></div>
        <div class="form-group"><label>Téléphone parent (WhatsApp)</label><input type="text" id="sc_parent_tel" value="${escapeHtml(existing ? existing.parent_tel : "")}"></div>
        <div class="form-group"><label>Contact d'urgence</label><input type="text" id="sc_urgence_tel" value="${escapeHtml(existing ? existing.urgence_tel : "")}"></div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Cotisation annuelle</label>
          <select id="sc_cot_annuelle">
            <option value="en_attente" ${!existing || existing.cotisation_annuelle !== "paye" ? "selected" : ""}>En attente</option>
            <option value="paye" ${existing && existing.cotisation_annuelle === "paye" ? "selected" : ""}>Payée</option>
          </select>
        </div>
        <div class="form-group"><label>Matricule (confirme annuel)</label><input type="text" id="sc_matricule" value="${escapeHtml(existing ? existing.matricule : "")}"></div>
      </div>
      <div class="form-group"><label>Allergies / Infos médicales en camp</label><input type="text" id="sc_allergies" value="${escapeHtml(existing ? existing.allergies : "")}"></div>
      <div class="actions-row">
        <button type="submit" class="btn btn-success">Enregistrer</button>
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Annuler</button>
      </div>
    </form>
  `);
}

async function saveScout(e, id) {
  e.preventDefault();
  const brancheVal = isCU() && currentUser.branche ? currentUser.branche : document.getElementById("sc_branche").value;
  const matricule = document.getElementById("sc_matricule").value.trim();
  const cotAnn = matricule ? "paye" : document.getElementById("sc_cot_annuelle").value;

  const payload = {
    id: id || uid("scout"),
    nom: document.getElementById("sc_nom").value.trim(),
    prenom: document.getElementById("sc_prenom").value.trim(),
    branche: brancheVal,
    sexe: document.getElementById("sc_sexe").value,
    tenue_complete: document.getElementById("sc_tenue").value === "1",
    parent_nom: document.getElementById("sc_parent_nom").value.trim(),
    parent_tel: document.getElementById("sc_parent_tel").value.trim(),
    urgence_tel: document.getElementById("sc_urgence_tel").value.trim(),
    cotisation_annuelle: cotAnn,
    matricule,
    allergies: document.getElementById("sc_allergies").value.trim()
  };

  if (id) {
    db.scouts = db.scouts.map((s) => (s.id === id ? { ...s, ...payload } : s));
  } else {
    db.scouts.push({ ...payload, etape_pedago: "Début", notes_pedago: "" });
  }
  closeModal();
  await persistDb(id ? "Modification jeune" : "Ajout jeune", `${payload.nom} ${payload.prenom}`);
}

async function deleteScout(id) {
  if (!canManageStructure()) return;
  db.scouts = db.scouts.filter((s) => s.id !== id);
  await persistDb("Suppression jeune", id);
}

function openChefModal(chefId = null) {
  if (!canManageStructure()) return;
  const existing = chefId ? db.chefs.find((c) => c.id === chefId) : null;
  openModal(existing ? "Modifier un chef / accès CU" : "Ajouter un chef / accès CU", `
    <form onsubmit="saveChef(event, '${existing ? existing.id : ""}')">
      <div class="form-row">
        <div class="form-group"><label>Nom & Prénoms *</label><input type="text" id="ch_nom" value="${escapeHtml(existing ? existing.nom : "")}" required></div>
        <div class="form-group"><label>Fonction</label><input type="text" id="ch_fonction" value="${escapeHtml(existing ? existing.fonction : "Chef d'Unité")}"></div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Branche</label>
          <select id="ch_branche">
            <option value="Groupe" ${!existing || existing.branche === "Groupe" ? "selected" : ""}>Groupe / Direction</option>
            ${BRANCHES.map((b) => `<option value="${b}" ${existing && existing.branche === b ? "selected" : ""}>${b}</option>`).join("")}
          </select>
        </div>
        <div class="form-group">
          <label>Sexe</label>
          <select id="ch_sexe">
            <option value="Garçon" ${!existing || existing.sexe === "Garçon" ? "selected" : ""}>Garçon</option>
            <option value="Fille" ${existing && existing.sexe === "Fille" ? "selected" : ""}>Fille</option>
          </select>
        </div>
        <div class="form-group"><label>Téléphone</label><input type="text" id="ch_tel" value="${escapeHtml(existing ? existing.tel : "")}"></div>
      </div>
      <div class="form-group"><label>Code PIN individuel CU</label><input type="text" id="ch_pin" value="${escapeHtml(existing && existing.pin ? existing.pin : "")}" placeholder="Ex: 4101"></div>
      <div class="actions-row">
        <button type="submit" class="btn btn-success">Enregistrer</button>
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Annuler</button>
      </div>
    </form>
  `);
}

async function saveChef(e, id) {
  e.preventDefault();
  if (!canManageStructure()) return;
  const prev = id ? db.chefs.find((c) => c.id === id) : null;
  const payload = {
    ...(prev || {}),
    id: id || uid("chef"),
    nom: document.getElementById("ch_nom").value.trim(),
    fonction: document.getElementById("ch_fonction").value.trim(),
    branche: document.getElementById("ch_branche").value,
    sexe: document.getElementById("ch_sexe").value,
    tel: document.getElementById("ch_tel").value.trim(),
    pin: document.getElementById("ch_pin").value.trim()
  };
  if (id) db.chefs = db.chefs.map((c) => (c.id === id ? payload : c));
  else db.chefs.push(payload);
  closeModal();
  await persistDb(id ? "Modification chef" : "Ajout chef", payload.nom);
}

async function deleteChef(id) {
  if (!canManageStructure()) return;
  db.chefs = db.chefs.filter((c) => c.id !== id);
  await persistDb("Suppression chef", id);
}

/* 3. APPELS, MESSAGES AUTO & IMPRESSION AVEC LOGOS GAUCHE/DROITE + CACHET */
function renderQuickAppel() {
  const br = document.getElementById("appelBrancheSelect").value;
  const list = db.scouts.filter((s) => br === "Toutes" || s.branche === br);
  const container = document.getElementById("quickAppelList");

  if (!list.length) {
    container.innerHTML = `<p style="color:var(--muted); font-size:0.88rem;">Aucun jeune dans cette branche.</p>`;
    return;
  }

  list.forEach((s) => {
    if (!quickAppelStates[s.id]) quickAppelStates[s.id] = "Présent";
  });

  container.innerHTML = list.map((s) => {
    const st = quickAppelStates[s.id];
    return `
      <div class="appel-row">
        <div>
          <strong>${escapeHtml(s.nom)} ${escapeHtml(s.prenom)}</strong>
          <span class="badge badge-gray" style="margin-left:6px;">${escapeHtml(s.branche)}</span>
        </div>
        <div class="appel-toggle">
          <button type="button" class="btn btn-sm ${st === "Présent" ? "btn-success" : "btn-secondary"}" onclick="setAppelState('${s.id}', 'Présent')">Présent</button>
          <button type="button" class="btn btn-sm ${st === "Absent" ? "btn-danger" : "btn-secondary"}" onclick="setAppelState('${s.id}', 'Absent')">Absent</button>
        </div>
      </div>
    `;
  }).join("");
}

function setAppelState(scoutId, state) {
  quickAppelStates[scoutId] = state;
  renderQuickAppel();
}

function markAllAppel(state) {
  const br = document.getElementById("appelBrancheSelect").value;
  db.scouts.filter((s) => br === "Toutes" || s.branche === br).forEach((s) => {
    quickAppelStates[s.id] = state;
  });
  renderQuickAppel();
}

function buildAppelMessages({ date, branche, theme, presentScouts, absentScouts }) {
  const summary = [
    `📋 POINT D'APPEL — GROUPE SCOUT OBION`,
    `Date : ${date}`,
    `Branche : ${branche}`,
    `Thème : ${theme}`,
    `Présents (${presentScouts.length}) : ${presentScouts.length ? presentScouts.map((s) => `${s.nom} ${s.prenom}`).join(", ") : "Aucun"}`,
    `Absents (${absentScouts.length}) : ${absentScouts.length ? absentScouts.map((s) => `${s.nom} ${s.prenom}`).join(", ") : "Aucun"}`
  ].join("\n");

  const absentBtns = absentScouts.map((s) => {
    const msgAbsent = `Bonjour chers parents (Groupe OBION), nous vous signalons que ${s.prenom} ${s.nom} (${s.branche}) était absent(e) à l'activité du ${date} (${theme}). Merci de nous tenir informés.`;
    const waPhone = normalizeWaPhone(s.parent_tel);
    const waUrl = waPhone ? `https://wa.me/${waPhone}?text=${encodeURIComponent(msgAbsent)}` : "";
    return waUrl
      ? `<a href="${waUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-warning">WhatsApp absent : ${escapeHtml(s.prenom)} ${escapeHtml(s.nom)}</a>`
      : `<span class="badge badge-gray">Absent sans tél : ${escapeHtml(s.prenom)} ${escapeHtml(s.nom)}</span>`;
  }).join("");

  return { summary, absentBtns };
}

async function saveQuickAppel() {
  const br = document.getElementById("appelBrancheSelect").value;
  const date = document.getElementById("appelDateInput").value || new Date().toISOString().slice(0, 10);
  const theme = document.getElementById("appelThemeInput").value.trim() || "Réunion d'unité";
  const targets = db.scouts.filter((s) => br === "Toutes" || s.branche === br);

  if (!targets.length) {
    alert("Aucun jeune à enregistrer.");
    return;
  }

  const presentScouts = targets.filter((s) => (quickAppelStates[s.id] || "Présent") === "Présent");
  const absentScouts = targets.filter((s) => quickAppelStates[s.id] === "Absent");

  db.presences.unshift({
    id: uid("pres"),
    date,
    branche: br,
    theme,
    presents: presentScouts.map((s) => s.id),
    absents: absentScouts.map((s) => s.id)
  });

  const { summary, absentBtns } = buildAppelMessages({ date, branche: br, theme, presentScouts, absentScouts });
  document.getElementById("appelAutoMessageArea").value = summary;
  document.getElementById("absentParentActions").innerHTML = absentBtns;
  document.getElementById("appelAutoMessageBox").style.display = "block";
  document.getElementById("appelThemeInput").value = "";

  await persistDb("Enregistrement appel", `${br} — ${date}`);
}

function copyAppelAutoMessage() {
  const txt = document.getElementById("appelAutoMessageArea").value || "";
  if (!txt.trim()) return;
  navigator.clipboard?.writeText(txt);
  alert("Message d'appel copié !");
}

function printCurrentAppelSheet() {
  const br = document.getElementById("appelBrancheSelect").value;
  const date = document.getElementById("appelDateInput").value || new Date().toISOString().slice(0, 10);
  const theme = document.getElementById("appelThemeInput").value.trim() || "Réunion d'unité";
  const targets = db.scouts.filter((s) => br === "Toutes" || s.branche === br);

  triggerPrintHtml(`
    ${getPrintHeaderWithSideLogos("LISTE DE PRÉSENCE — GROUPE SCOUT OBION", `Branche : ${br} · Date : ${date} · Thème : ${theme}`)}
    <table style="width:100%; border-collapse:collapse;">
      <thead>
        <tr>
          <th style="border:1px solid #333; padding:6px;">N°</th>
          <th style="border:1px solid #333; padding:6px;">Nom & Prénoms</th>
          <th style="border:1px solid #333; padding:6px;">Branche</th>
          <th style="border:1px solid #333; padding:6px;">Statut</th>
        </tr>
      </thead>
      <tbody>
        ${targets.map((s, idx) => `
          <tr>
            <td style="border:1px solid #333; padding:6px;">${idx + 1}</td>
            <td style="border:1px solid #333; padding:6px;">${escapeHtml(s.nom)} ${escapeHtml(s.prenom)}</td>
            <td style="border:1px solid #333; padding:6px;">${escapeHtml(s.branche)}</td>
            <td style="border:1px solid #333; padding:6px;">${escapeHtml(quickAppelStates[s.id] || "Présent")}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
    ${getPrintCachetHtml("LISTE DE PRÉSENCE VALIDÉE")}
  `);
}

function renderPresencesHistory() {
  const tbody = document.getElementById("presencesHistoryBody");
  const list = isCU() && currentUser.branche
    ? db.presences.filter((p) => p.branche === currentUser.branche || p.branche === "Toutes")
    : db.presences;

  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--muted);">Aucun appel enregistré.</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map((p) => `
    <tr>
      <td>${escapeHtml(p.date)}</td>
      <td>${escapeHtml(p.branche)}</td>
      <td>${escapeHtml(p.theme)}</td>
      <td><span class="badge badge-green">${(p.presents || []).length}</span></td>
      <td><span class="badge badge-red">${(p.absents || []).length}</span></td>
      <td>
        <div class="actions-row">
          <button type="button" class="btn btn-sm btn-secondary" onclick="showHistoryAppelMessage('${p.id}')">Messages</button>
          ${canManageStructure() ? `<button type="button" class="btn btn-sm btn-danger" onclick="deletePresence('${p.id}')">Suppr.</button>` : ""}
        </div>
      </td>
    </tr>
  `).join("");
}

function showHistoryAppelMessage(presId) {
  const p = db.presences.find((x) => x.id === presId);
  if (!p) return;
  const presentScouts = db.scouts.filter((s) => (p.presents || []).includes(s.id));
  const absentScouts = db.scouts.filter((s) => (p.absents || []).includes(s.id));
  const { summary, absentBtns } = buildAppelMessages({
    date: p.date,
    branche: p.branche,
    theme: p.theme,
    presentScouts,
    absentScouts
  });
  document.getElementById("appelAutoMessageArea").value = summary;
  document.getElementById("absentParentActions").innerHTML = absentBtns;
  document.getElementById("appelAutoMessageBox").style.display = "block";
}

async function deletePresence(id) {
  if (!canManageStructure()) return;
  db.presences = db.presences.filter((p) => p.id !== id);
  await persistDb("Suppression appel", id);
}

/* 4. PROGRAMME ANNUEL & IMPRESSION AVEC LOGOS GAUCHE/DROITE + CACHET */
function renderProgrammeAnnuel() {
  const cibleFilter = document.getElementById("filterActiviteCible").value;
  let list = getScopedProgramme();
  if (cibleFilter !== "all") list = list.filter((a) => a.cible === cibleFilter);

  const cibleBadges = {
    cg_only: `<span class="badge badge-purple">CG seul</span>`,
    cu_only: `<span class="badge badge-amber">CU seul</span>`,
    tous_chefs: `<span class="badge badge-green">Tous les chefs</span>`
  };

  const tbody = document.getElementById("activitesTableBody");
  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--muted);">Aucune activité au programme.</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map((a) => `
    <tr>
      <td>${escapeHtml(a.date || "-")}</td>
      <td><strong>${escapeHtml(a.titre)}</strong></td>
      <td>
        ${cibleBadges[a.cible] || escapeHtml(a.cible)}
        ${a.branche ? `<span class="badge badge-blue">${escapeHtml(a.branche)}</span>` : ""}
      </td>
      <td>${Number(a.tarif || 0) > 0 ? formatMoney(a.tarif) : "Gratuit / Info"}</td>
      <td>${escapeHtml(a.notes || "-")}</td>
      <td>
        ${canManageStructure() ? `
          <button type="button" class="btn btn-sm btn-secondary" onclick="openActiviteModal('${a.id}')">Modifier</button>
          <button type="button" class="btn btn-sm btn-danger" onclick="deleteActivite('${a.id}')">Suppr.</button>
        ` : `<span class="badge badge-gray">Lecture</span>`}
      </td>
    </tr>
  `).join("");
}

function openActiviteModal(id = null) {
  if (!canManageStructure()) return;
  const existing = id ? db.activites.find((a) => a.id === id) : null;
  openModal(existing ? "Modifier l'activité du programme" : "Ajouter au programme annuel", `
    <form onsubmit="saveActivite(event, '${existing ? existing.id : ""}')">
      <div class="form-group"><label>Titre de l'activité *</label><input type="text" id="act_titre" value="${escapeHtml(existing ? existing.titre : "")}" required></div>
      <div class="form-row">
        <div class="form-group"><label>Date</label><input type="date" id="act_date" value="${escapeHtml(existing ? existing.date : new Date().toISOString().slice(0, 10))}"></div>
        <div class="form-group">
          <label>Cible</label>
          <select id="act_cible">
            <option value="tous_chefs" ${!existing || existing.cible === "tous_chefs" ? "selected" : ""}>Tous les chefs</option>
            <option value="cu_only" ${existing && existing.cible === "cu_only" ? "selected" : ""}>CU uniquement</option>
            <option value="cg_only" ${existing && existing.cible === "cg_only" ? "selected" : ""}>CG uniquement</option>
          </select>
        </div>
        <div class="form-group">
          <label>Branche (si ciblée)</label>
          <select id="act_branche">
            <option value="">Toutes / Groupe</option>
            ${BRANCHES.map((b) => `<option value="${b}" ${existing && existing.branche === b ? "selected" : ""}>${b}</option>`).join("")}
          </select>
        </div>
        <div class="form-group"><label>Tarif / Prix fixé (FCFA)</label><input type="number" id="act_tarif" min="0" value="${existing ? Number(existing.tarif || 0) : 0}"></div>
      </div>
      <div class="form-group"><label>Lieu / Notes</label><textarea id="act_notes">${escapeHtml(existing ? existing.notes : "")}</textarea></div>
      <div class="actions-row">
        <button type="submit" class="btn btn-success">Enregistrer</button>
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Annuler</button>
      </div>
    </form>
  `);
}

async function saveActivite(e, id) {
  e.preventDefault();
  if (!canManageStructure()) return;
  const payload = {
    id: id || uid("act"),
    titre: document.getElementById("act_titre").value.trim(),
    date: document.getElementById("act_date").value,
    cible: document.getElementById("act_cible").value,
    branche: document.getElementById("act_branche").value,
    tarif: Number(document.getElementById("act_tarif").value || 0),
    notes: document.getElementById("act_notes").value.trim()
  };
  if (id) db.activites = db.activites.map((a) => (a.id === id ? payload : a));
  else db.activites.unshift(payload);
  closeModal();
  await persistDb(id ? "Modification programme annuel" : "Ajout programme annuel", payload.titre);
}

async function deleteActivite(id) {
  if (!canManageStructure()) return;
  db.activites = db.activites.filter((a) => a.id !== id);
  await persistDb("Suppression programme annuel", id);
}

function printProgrammeAnnuel() {
  const list = getScopedProgramme();
  const scopeLabel = isCU() ? `CU — Branche ${currentUser.branche}` : "Groupe OBION";
  triggerPrintHtml(`
    ${getPrintHeaderWithSideLogos("PROGRAMME D'ACTIVITÉS ANNUEL — GROUPE OBION", `Périmètre : ${scopeLabel}`)}
    <table style="width:100%; border-collapse:collapse;">
      <thead>
        <tr>
          <th style="border:1px solid #333; padding:6px;">Date</th>
          <th style="border:1px solid #333; padding:6px;">Activité</th>
          <th style="border:1px solid #333; padding:6px;">Cible / Branche</th>
          <th style="border:1px solid #333; padding:6px;">Tarif</th>
          <th style="border:1px solid #333; padding:6px;">Notes</th>
        </tr>
      </thead>
      <tbody>
        ${list.map((a) => `
          <tr>
            <td style="border:1px solid #333; padding:6px;">${escapeHtml(a.date || "-")}</td>
            <td style="border:1px solid #333; padding:6px;">${escapeHtml(a.titre)}</td>
            <td style="border:1px solid #333; padding:6px;">${escapeHtml(a.cible)} ${a.branche ? "(" + escapeHtml(a.branche) + ")" : ""}</td>
            <td style="border:1px solid #333; padding:6px;">${Number(a.tarif || 0) > 0 ? formatMoney(a.tarif) : "-"}</td>
            <td style="border:1px solid #333; padding:6px;">${escapeHtml(a.notes || "-")}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
    ${getPrintCachetHtml("PROGRAMME ANNUEL OFFICIEL")}
  `);
}

/* 5. CAMPS & AUTORISATION PARENTALE AVEC LOGOS GAUCHE/DROITE + CACHET */
function renderCamps() {
  const scope = document.getElementById("filterCampScope").value;
  let list = getScopedCamps();
  if (scope !== "all") list = list.filter((c) => c.type === scope);

  const tbody = document.getElementById("campsTableBody");
  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--muted);">Aucun camp visible.</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map((c) => `
    <tr>
      <td><strong>${escapeHtml(c.nom)}</strong></td>
      <td>
        <span class="badge badge-blue">${escapeHtml(c.type)}</span>
        ${c.branche ? `<span class="badge badge-gray">${escapeHtml(c.branche)}</span>` : ""}
      </td>
      <td>${escapeHtml(c.dates || "-")}<br><small>${escapeHtml(c.lieu || "")}</small></td>
      <td>${escapeHtml(c.superviseurs || "Chefs superviseurs")}</td>
      <td>${formatMoney(c.frais || 0)}</td>
      <td>
        <div class="actions-row">
          <button type="button" class="btn btn-sm btn-secondary" onclick="printAutorisationCamp('${c.id}')">📄 Autorisation</button>
          ${canManageStructure() ? `
            <button type="button" class="btn btn-sm btn-secondary" onclick="openCampModal('${c.id}')">Modifier</button>
            <button type="button" class="btn btn-sm btn-danger" onclick="deleteCamp('${c.id}')">Suppr.</button>
          ` : ""}
        </div>
      </td>
    </tr>
  `).join("");
}

function openCampModal(id = null) {
  if (!canManageStructure()) return;
  const existing = id ? db.camps.find((c) => c.id === id) : null;
  openModal(existing ? "Modifier le camp" : "Nouveau camp", `
    <form onsubmit="saveCamp(event, '${existing ? existing.id : ""}')">
      <div class="form-group"><label>Nom du camp *</label><input type="text" id="cp_nom" value="${escapeHtml(existing ? existing.nom : "")}" required></div>
      <div class="form-row">
        <div class="form-group">
          <label>Type</label>
          <select id="cp_type" onchange="toggleCampBrancheInput()">
            <option value="branche" ${!existing || existing.type === "branche" ? "selected" : ""}>Camp de branche</option>
            <option value="groupe" ${existing && existing.type === "groupe" ? "selected" : ""}>Camp de groupe</option>
            <option value="national" ${existing && existing.type === "national" ? "selected" : ""}>Camp national</option>
          </select>
        </div>
        <div class="form-group" id="cp_branche_wrap">
          <label>Branche</label>
          <select id="cp_branche">
            ${BRANCHES.map((b) => `<option value="${b}" ${existing && existing.branche === b ? "selected" : ""}>${b}</option>`).join("")}
          </select>
        </div>
        <div class="form-group"><label>Frais / Prix fixé (FCFA)</label><input type="number" id="cp_frais" min="0" value="${existing ? Number(existing.frais || 0) : 0}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Dates</label><input type="text" id="cp_dates" value="${escapeHtml(existing ? existing.dates : "")}"></div>
        <div class="form-group"><label>Lieu</label><input type="text" id="cp_lieu" value="${escapeHtml(existing ? existing.lieu : "")}"></div>
      </div>
      <div class="form-group"><label>Chefs superviseurs</label><input type="text" id="cp_superviseurs" value="${escapeHtml(existing ? existing.superviseurs : "")}"></div>
      <div class="actions-row">
        <button type="submit" class="btn btn-success">Enregistrer</button>
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Annuler</button>
      </div>
    </form>
  `);
  toggleCampBrancheInput();
}

function toggleCampBrancheInput() {
  const wrap = document.getElementById("cp_branche_wrap");
  if (wrap) wrap.style.display = document.getElementById("cp_type").value === "branche" ? "block" : "none";
}

async function saveCamp(e, id) {
  e.preventDefault();
  if (!canManageStructure()) return;
  const type = document.getElementById("cp_type").value;
  const payload = {
    id: id || uid("camp"),
    nom: document.getElementById("cp_nom").value.trim(),
    type,
    branche: type === "branche" ? document.getElementById("cp_branche").value : "",
    frais: Number(document.getElementById("cp_frais").value || 0),
    dates: document.getElementById("cp_dates").value.trim(),
    lieu: document.getElementById("cp_lieu").value.trim(),
    superviseurs: document.getElementById("cp_superviseurs").value.trim()
  };
  if (id) db.camps = db.camps.map((c) => (c.id === id ? payload : c));
  else db.camps.unshift(payload);
  closeModal();
  await persistDb(id ? "Modification camp" : "Création camp", payload.nom);
}

async function deleteCamp(id) {
  if (!canManageStructure()) return;
  db.camps = db.camps.filter((c) => c.id !== id);
  await persistDb("Suppression camp", id);
}

function printAutorisationCamp(campId) {
  const camp = db.camps.find((c) => c.id === campId);
  if (!camp) return;
  triggerPrintHtml(`
    ${getPrintHeaderWithSideLogos("AUTORISATION PARENTALE — GROUPE OBION", camp.nom)}
    <p style="margin:12px 0;">Je soussigné(e), parent / tuteur légal, autorise mon enfant à participer au camp :</p>
    <p><strong>Camp :</strong> ${escapeHtml(camp.nom)}</p>
    <p><strong>Type / Branche :</strong> ${escapeHtml(camp.type)} ${camp.branche ? "— " + escapeHtml(camp.branche) : ""}</p>
    <p><strong>Dates :</strong> ${escapeHtml(camp.dates || "À préciser")}</p>
    <p><strong>Lieu :</strong> ${escapeHtml(camp.lieu || "À préciser")}</p>
    <p><strong>Supervision :</strong> ${escapeHtml(camp.superviseurs || "Chefs du Groupe OBION")}</p>
    <p style="margin-top:28px;">Signature du parent / tuteur : ___________________________</p>
    ${getPrintCachetHtml("AUTORISATION DE CAMP")}
  `);
}

/* 6. PÉDAGOGIE */
function getBranchStepsList(branche) {
  const raw = (db.settings && db.settings.prog && db.settings.prog[branche]) || "";
  return raw
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function renderPedagogie() {
  const br = document.getElementById("pedagoBrancheSelect").value;
  const refBox = document.getElementById("pedagoReferentielBox");
  if (br && br !== "Toutes" && db.settings.prog && db.settings.prog[br]) {
    refBox.innerHTML = `<strong>Référentiel ${escapeHtml(br)} :</strong> ${escapeHtml(db.settings.prog[br])}`;
  } else {
    refBox.innerHTML = Object.entries(db.settings.prog || {})
      .map(([k, v]) => `<div><strong>${escapeHtml(k)} :</strong> ${escapeHtml(v)}</div>`)
      .join("");
  }

  let list = getScopedScouts();
  if (br && br !== "Toutes") list = list.filter((s) => s.branche === br);

  document.getElementById("pedagoTableBody").innerHTML = list.length ? list.map((s) => `
    <tr>
      <td><strong>${escapeHtml(s.nom)} ${escapeHtml(s.prenom)}</strong></td>
      <td>${escapeHtml(s.branche)}</td>
      <td><span class="badge badge-green">${escapeHtml(s.etape_pedago || "Début")}</span></td>
      <td>${escapeHtml(s.notes_pedago || "-")}</td>
      <td><button type="button" class="btn btn-sm btn-secondary" onclick="openPedagoModal('${s.id}')">Mettre à jour</button></td>
    </tr>
  `).join("") : `<tr><td colspan="5" style="text-align:center; color:var(--muted);">Aucun jeune.</td></tr>`;
}

function openPedagoReferentielModal() {
  const selectedBr = document.getElementById("pedagoBrancheSelect").value;
  const targetBr = selectedBr && selectedBr !== "Toutes" ? selectedBr : (isCU() && currentUser.branche ? currentUser.branche : "Meute");
  const currentVal = (db.settings && db.settings.prog && db.settings.prog[targetBr]) || "";

  openModal("Modifier les étapes de progression par branche", `
    <form onsubmit="savePedagoReferentiel(event)">
      <div class="form-group">
        <label>Branche</label>
        <select id="ref_branche" onchange="document.getElementById('ref_etapes').value = (db.settings.prog[this.value] || '')">
          ${BRANCHES.map((b) => `<option value="${b}" ${b === targetBr ? "selected" : ""}>${b}</option>`).join("")}
        </select>
      </div>
      <div class="form-group">
        <label>Étapes de progression (séparées par des virgules)</label>
        <textarea id="ref_etapes" required>${escapeHtml(currentVal)}</textarea>
      </div>
      <div class="actions-row">
        <button type="submit" class="btn btn-success">Enregistrer les étapes</button>
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Annuler</button>
      </div>
    </form>
  `);
}

async function savePedagoReferentiel(e) {
  e.preventDefault();
  const br = document.getElementById("ref_branche").value;
  const etapes = document.getElementById("ref_etapes").value.trim();
  if (!db.settings.prog || typeof db.settings.prog !== "object") {
    db.settings.prog = {};
  }
  db.settings.prog[br] = etapes;
  closeModal();
  await persistDb("Mise à jour référentiel progression", `${br} : ${etapes}`);
}

function openPedagoModal(scoutId) {
  const s = db.scouts.find((x) => x.id === scoutId);
  if (!s) return;
  const steps = getBranchStepsList(s.branche);
  const stepOptionsHtml = steps.length
    ? `<div class="form-group">
        <label>Choisir une étape du référentiel (${escapeHtml(s.branche)})</label>
        <select onchange="if(this.value) document.getElementById('pd_etape').value = this.value">
          <option value="">-- Sélectionner une étape --</option>
          ${steps.map((st) => `<option value="${escapeHtml(st)}" ${s.etape_pedago === st ? "selected" : ""}>${escapeHtml(st)}</option>`).join("")}
        </select>
      </div>`
    : "";

  openModal(`Progression — ${s.nom} ${s.prenom}`, `
    <form onsubmit="savePedago(event, '${s.id}')">
      ${stepOptionsHtml}
      <div class="form-group"><label>Étape actuelle</label><input type="text" id="pd_etape" value="${escapeHtml(s.etape_pedago || "")}"></div>
      <div class="form-group"><label>Notes</label><textarea id="pd_notes">${escapeHtml(s.notes_pedago || "")}</textarea></div>
      <div class="actions-row"><button type="submit" class="btn btn-success">Enregistrer</button><button type="button" class="btn btn-secondary" onclick="closeModal()">Annuler</button></div>
    </form>
  `);
}

async function savePedago(e, scoutId) {
  e.preventDefault();
  db.scouts = db.scouts.map((s) => s.id === scoutId ? {
    ...s,
    etape_pedago: document.getElementById("pd_etape").value.trim(),
    notes_pedago: document.getElementById("pd_notes").value.trim()
  } : s);
  closeModal();
  await persistDb("Mise à jour pédagogie", scoutId);
}
function renderMateriel() {
  document.getElementById("materielTableBody").innerHTML = db.materiel.length ? db.materiel.map((m) => `
    <tr>
      <td><strong>${escapeHtml(m.nom)}</strong></td>
      <td>${Number(m.quantite || 0)}</td>
      <td>${escapeHtml(m.etat || "Bon")}</td>
      <td>${escapeHtml(m.affectation || "Groupe")}</td>
      <td>
        <button type="button" class="btn btn-sm btn-secondary" onclick="openMaterielModal('${m.id}')">Modifier</button>
        <button type="button" class="btn btn-sm btn-danger" onclick="deleteMateriel('${m.id}')">Suppr.</button>
      </td>
    </tr>
  `).join("") : `<tr><td colspan="5" style="text-align:center; color:var(--muted);">Aucun matériel.</td></tr>`;
}

function openMaterielModal(id = null) {
  const existing = id ? db.materiel.find((m) => m.id === id) : null;
  openModal(existing ? "Modifier matériel" : "Ajouter matériel", `
    <form onsubmit="saveMateriel(event, '${existing ? existing.id : ""}')">
      <div class="form-row">
        <div class="form-group"><label>Désignation *</label><input type="text" id="mat_nom" value="${escapeHtml(existing ? existing.nom : "")}" required></div>
        <div class="form-group"><label>Quantité *</label><input type="number" id="mat_qte" min="0" value="${existing ? Number(existing.quantite || 0) : 1}" required></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>État</label><input type="text" id="mat_etat" value="${escapeHtml(existing ? existing.etat : "Bon état")}"></div>
        <div class="form-group"><label>Affectation</label><input type="text" id="mat_aff" value="${escapeHtml(existing ? existing.affectation : "Groupe")}"></div>
      </div>
      <div class="actions-row"><button type="submit" class="btn btn-success">Enregistrer</button><button type="button" class="btn btn-secondary" onclick="closeModal()">Annuler</button></div>
    </form>
  `);
}

async function saveMateriel(e, id) {
  e.preventDefault();
  const payload = {
    id: id || uid("mat"),
    nom: document.getElementById("mat_nom").value.trim(),
    quantite: Number(document.getElementById("mat_qte").value || 0),
    etat: document.getElementById("mat_etat").value.trim(),
    affectation: document.getElementById("mat_aff").value.trim()
  };
  if (id) db.materiel = db.materiel.map((m) => (m.id === id ? payload : m));
  else db.materiel.push(payload);
  closeModal();
  await persistDb(id ? "Modification matériel" : "Ajout matériel", payload.nom);
}

async function deleteMateriel(id) {
  db.materiel = db.materiel.filter((m) => m.id !== id);
  await persistDb("Suppression matériel", id);
}

/* 8. FINANCES, COTISATIONS, PAIEMENTS ACTIVITÉS/CAMPS, DONS & REÇUS */
function renderWaveTresorerieBox() {
  const box = document.getElementById("waveTresorerieBox");
  const url = String((db.settings && db.settings.wave_url) || "").trim();
  if (!box) return;
  if (!url) { box.style.display = "none"; return; }
  box.style.display = "flex";
  document.getElementById("waveTresorerieUrlLabel").textContent = url;
  document.getElementById("waveTresorerieLinkBtn").href = url;
}

function copyWavePaymentLink() {
  const url = String((db.settings && db.settings.wave_url) || "").trim();
  if (!url) return alert("Aucun lien configuré.");
  navigator.clipboard?.writeText(url);
  alert("Lien copié !");
}

function getAvailableCotisationsOptions() {
  const month = document.getElementById("financeMonthPicker")?.value || new Date().toISOString().slice(0, 7);
  const base = [
    { id: `mens_${month}`, label: `Cotisation mensuelle (${month})`, montant: Number(db.settings.cot_mens_j || 500) }
  ];
  const custom = (db.cotisationsCustom || []).map((c) => ({
    id: c.id,
    label: c.titre,
    montant: Number(c.montant || 0)
  }));
  return [...base, ...custom];
}

function openCreateCustomCotisationModal() {
  if (!canManageFinances()) return;
  openModal("Créer une cotisation mensuelle ou spéciale", `
    <form onsubmit="saveCustomCotisation(event)">
      <div class="form-group"><label>Titre / Nom de la cotisation *</label><input type="text" id="cc_titre" placeholder="Ex: Cotisation mensuelle Décembre ou Cotisation tenue" required></div>
      <div class="form-group"><label>Montant (FCFA) *</label><input type="number" id="cc_montant" min="0" value="${Number(db.settings.cot_mens_j || 500)}" required></div>
      <div class="actions-row"><button type="submit" class="btn btn-success">Créer</button><button type="button" class="btn btn-secondary" onclick="closeModal()">Annuler</button></div>
    </form>
  `);
}

async function saveCustomCotisation(e) {
  e.preventDefault();
  if (!canManageFinances()) return;
  const titre = document.getElementById("cc_titre").value.trim();
  const montant = Number(document.getElementById("cc_montant").value || 0);
  db.cotisationsCustom.push({ id: uid("cot"), titre, montant });
  closeModal();
  await persistDb("Création cotisation", `${titre} (${formatMoney(montant)})`);
}

function renderCotisationsSuivi() {
  if (!canManageFinances()) return;
  const sel = document.getElementById("cotTypeSelect");
  const prevVal = sel.value;
  const opts = getAvailableCotisationsOptions();
  sel.innerHTML = opts.map((o) => `<option value="${escapeHtml(o.id)}">${escapeHtml(o.label)} (${formatMoney(o.montant)})</option>`).join("");
  if (prevVal && opts.some((o) => o.id === prevVal)) sel.value = prevVal;

  const activeCot = opts.find((o) => o.id === sel.value) || opts[0];
  const brFilter = document.getElementById("cotFilterBranche").value;
  const list = db.scouts.filter((s) => brFilter === "Toutes" || s.branche === brFilter);

  document.getElementById("cotisationsSuiviBody").innerHTML = list.length ? list.map((s) => {
    const annPaye = s.cotisation_annuelle === "paye";
    const key = `${activeCot.id}__${s.id}`;
    const cotPaye = Boolean(db.cotisationPayments[key]);

    return `
      <tr>
        <td><strong>${escapeHtml(s.nom)} ${escapeHtml(s.prenom)}</strong></td>
        <td>${escapeHtml(s.branche)}</td>
        <td>
          <div class="actions-row">
            <button type="button" class="btn btn-sm ${annPaye ? "btn-success" : "btn-warning"}" onclick="toggleAnnuelleWithMatricule('${s.id}')">
              ${annPaye ? "✅ Payée" : "❌ Non payée"}
            </button>
            <input type="text" value="${escapeHtml(s.matricule || "")}" placeholder="Matricule..."
              style="min-height:32px; padding:4px 8px; width:125px;"
              onchange="confirmAnnuelleByMatricule('${s.id}', this.value)">
          </div>
        </td>
        <td>
          <button type="button" class="btn btn-sm ${cotPaye ? "btn-success" : "btn-secondary"}" onclick="toggleCustomCotPaymentByKey('${s.id}', '${activeCot.id}')">
            ${cotPaye ? "✅ Payée" : "❌ Non payée"}
          </button>
        </td>
        <td>
          <button type="button" class="btn btn-sm btn-accent" onclick="openReceiptForCot('${s.id}', '${activeCot.id}')">🧾 Reçu</button>
        </td>
      </tr>
    `;
  }).join("") : `<tr><td colspan="5" style="text-align:center; color:var(--muted);">Aucun jeune.</td></tr>`;
}

async function confirmAnnuelleByMatricule(scoutId, matVal) {
  if (!canManageFinances()) return;
  const scout = db.scouts.find((s) => s.id === scoutId);
  if (!scout) return;
  const cleanMat = String(matVal || "").trim();
  const wasUnpaid = scout.cotisation_annuelle !== "paye";
  scout.matricule = cleanMat;
  if (cleanMat) {
    scout.cotisation_annuelle = "paye";
    if (wasUnpaid && Number(db.settings.cot_j_total || 0) > 0) {
      db.finances.unshift({
        id: uid("fin"),
        date: new Date().toISOString().slice(0, 10),
        type: "entree",
        categorie: "Cotisation annuelle",
        libelle: `Cotisation annuelle (Mat. ${cleanMat}) — ${scout.nom} ${scout.prenom}`,
        montant: Number(db.settings.cot_j_total || 2500)
      });
    }
  }
  await persistDb("Matricule / Cotisation annuelle", `${scout.nom} ${scout.prenom} (${cleanMat || "effacé"})`);
}

async function toggleAnnuelleWithMatricule(scoutId) {
  if (!canManageFinances()) return;
  const scout = db.scouts.find((s) => s.id === scoutId);
  if (!scout) return;

  if (scout.cotisation_annuelle !== "paye") {
    const mat = prompt(`Saisir le numéro de matricule de ${scout.nom} ${scout.prenom} pour confirmer le paiement annuel :`, scout.matricule || "");
    if (!mat || !mat.trim()) {
      alert("Le numéro de matricule est requis pour confirmer la cotisation annuelle.");
      return;
    }
    scout.matricule = mat.trim();
    scout.cotisation_annuelle = "paye";
    db.finances.unshift({
      id: uid("fin"),
      date: new Date().toISOString().slice(0, 10),
      type: "entree",
      categorie: "Cotisation annuelle",
      libelle: `Cotisation annuelle (Mat. ${scout.matricule}) — ${scout.nom} ${scout.prenom}`,
      montant: Number(db.settings.cot_j_total || 2500)
    });
    await persistDb("Confirmation cotisation annuelle", `${scout.nom} ${scout.prenom} (Mat. ${scout.matricule})`);
  } else {
    if (!confirm(`Passer la cotisation annuelle de ${scout.nom} ${scout.prenom} en Non payée ?`)) return;
    scout.cotisation_annuelle = "en_attente";
    await persistDb("Annulation cotisation annuelle", `${scout.nom} ${scout.prenom}`);
  }
}

async function toggleCustomCotPaymentByKey(scoutId, cotId) {
  if (!canManageFinances()) return;
  const scout = db.scouts.find((s) => s.id === scoutId);
  const opts = getAvailableCotisationsOptions();
  const activeCot = opts.find((o) => o.id === cotId) || opts[0];
  if (!scout || !activeCot) return;

  const key = `${activeCot.id}__${scoutId}`;
  const nextState = !db.cotisationPayments[key];
  db.cotisationPayments[key] = nextState;

  if (nextState && Number(activeCot.montant || 0) > 0) {
    db.finances.unshift({
      id: uid("fin"),
      date: new Date().toISOString().slice(0, 10),
      type: "entree",
      categorie: "Cotisation",
      libelle: `${activeCot.label} — ${scout.nom} ${scout.prenom}`,
      montant: Number(activeCot.montant)
    });
  }
  await persistDb(nextState ? "Paiement cotisation" : "Retrait paiement cotisation", `${activeCot.label} — ${scout.nom} ${scout.prenom}`);
}

function openReceiptForCot(scoutId, cotId) {
  const opts = getAvailableCotisationsOptions();
  const activeCot = opts.find((o) => o.id === cotId) || opts[0];
  openReceiptForScout(scoutId, activeCot ? activeCot.label : "Cotisation", activeCot ? activeCot.montant : 500);
}

/* PAIEMENTS PAR ACTIVITÉ OU CAMP À PRIX FIXÉ */
function getPaidActivitiesList() {
  return [
    ...db.activites.filter((a) => Number(a.tarif || 0) > 0).map((a) => ({ id: a.id, title: `[Programme] ${a.titre}`, price: Number(a.tarif || 0) })),
    ...db.camps.filter((c) => Number(c.frais || 0) > 0).map((c) => ({ id: c.id, title: `[Camp] ${c.nom}`, price: Number(c.frais || 0) }))
  ];
}

function renderActivityPaymentsList() {
  if (!canManageFinances()) return;
  const paidActs = getPaidActivitiesList();
  const sel = document.getElementById("paidActivitySelect");
  const prev = sel.value;
  sel.innerHTML = paidActs.length
    ? paidActs.map((x) => `<option value="${escapeHtml(x.id)}">${escapeHtml(x.title)} (${formatMoney(x.price)})</option>`).join("")
    : `<option value="">Aucune activité / camp avec tarif fixé</option>`;

  if (prev && paidActs.some((x) => x.id === prev)) sel.value = prev;
  const current = paidActs.find((x) => x.id === sel.value) || paidActs[0];

  if (!current) {
    document.getElementById("activityPaymentSummary").textContent = "Ajoutez un tarif sur une activité ou un camp pour pointer qui a payé.";
    document.getElementById("activityPaymentsBody").innerHTML = "";
    return;
  }

  const paidCount = db.scouts.filter((s) => Boolean(db.activityPayments[`${current.id}__${s.id}`])).length;
  document.getElementById("activityPaymentSummary").innerHTML =
    `Tarif : <strong>${formatMoney(current.price)}</strong> · Payé : <strong>${paidCount}</strong> / ${db.scouts.length} jeune(s)`;

  document.getElementById("activityPaymentsBody").innerHTML = db.scouts.map((s) => {
    const isPaid = Boolean(db.activityPayments[`${current.id}__${s.id}`]);
    return `
      <tr>
        <td><strong>${escapeHtml(s.nom)} ${escapeHtml(s.prenom)}</strong></td>
        <td>${escapeHtml(s.branche)}</td>
        <td>
          <button type="button" class="btn btn-sm ${isPaid ? "btn-success" : "btn-warning"}" onclick="toggleActivityPaymentById('${current.id}', '${s.id}')">
            ${isPaid ? "✅ Payé" : "❌ Non payé"}
          </button>
        </td>
        <td>
          <button type="button" class="btn btn-sm btn-accent" onclick="openReceiptForActivity('${s.id}', '${current.id}')">🧾 Reçu</button>
        </td>
      </tr>
    `;
  }).join("");
}

async function toggleActivityPaymentById(actId, scoutId) {
  if (!canManageFinances()) return;
  const scout = db.scouts.find((s) => s.id === scoutId);
  const current = getPaidActivitiesList().find((x) => x.id === actId);
  if (!scout || !current) return;

  const key = `${current.id}__${scoutId}`;
  const nextPaid = !db.activityPayments[key];
  db.activityPayments[key] = nextPaid;

  if (nextPaid && Number(current.price || 0) > 0) {
    db.finances.unshift({
      id: uid("fin"),
      date: new Date().toISOString().slice(0, 10),
      type: "entree",
      categorie: "Activité / Camp",
      libelle: `${current.title} — ${scout.nom} ${scout.prenom}`,
      montant: Number(current.price)
    });
  }
  await persistDb(nextPaid ? "Paiement activité/camp" : "Annulation paiement activité/camp", `${current.title} — ${scout.nom} ${scout.prenom}`);
}

function openReceiptForActivity(scoutId, actId) {
  const current = getPaidActivitiesList().find((x) => x.id === actId);
  openReceiptForScout(scoutId, current ? current.title : "Activité", current ? current.price : 0);
}

function renderFinances() {
  if (!canManageFinances()) return;
  renderWaveTresorerieBox();
  renderCotisationsSuivi();
  renderActivityPaymentsList();

  const month = document.getElementById("financeMonthPicker").value || new Date().toISOString().slice(0, 7);
  const monthEntries = db.finances.filter((f) => String(f.date || "").startsWith(month));
  const entreesMois = monthEntries.filter((f) => f.type === "entree").reduce((a, b) => a + Number(b.montant || 0), 0);
  const sortiesMois = monthEntries.filter((f) => f.type === "sortie").reduce((a, b) => a + Number(b.montant || 0), 0);
  const soldeGlobal = db.finances.reduce((a, b) => a + (b.type === "entree" ? Number(b.montant || 0) : -Number(b.montant || 0)), 0);
  const partEccEstimee = db.scouts.filter((s) => s.cotisation_annuelle === "paye" && s.matricule).length * Number(db.settings.cot_j_ascci || 2085);

  document.getElementById("financeKpiGrid").innerHTML = `
    <div class="kpi-box"><div class="kpi-label">Entrées (${escapeHtml(month)})</div><div class="kpi-value" style="color:var(--success);">${formatMoney(entreesMois)}</div></div>
    <div class="kpi-box"><div class="kpi-label">Sorties (${escapeHtml(month)})</div><div class="kpi-value" style="color:var(--danger);">${formatMoney(sortiesMois)}</div></div>
    <div class="kpi-box"><div class="kpi-label">Solde global</div><div class="kpi-value">${formatMoney(soldeGlobal)}</div></div>
    <div class="kpi-box"><div class="kpi-label">Repère part ECC confirmée</div><div class="kpi-value">${formatMoney(partEccEstimee)}</div></div>
  `;

  document.getElementById("financesTableBody").innerHTML = db.finances.length ? db.finances.map((f) => `
    <tr>
      <td>${escapeHtml(f.date || "-")}</td>
      <td>${f.type === "entree" ? `<span class="badge badge-green">Entrée</span>` : `<span class="badge badge-red">Sortie</span>`}</td>
      <td>${escapeHtml(f.categorie || "Général")}</td>
      <td><strong>${escapeHtml(f.libelle)}</strong></td>
      <td><strong>${formatMoney(f.montant)}</strong></td>
      <td>
        <div class="actions-row">
          <button type="button" class="btn btn-sm btn-secondary" onclick="openFinanceModal('${f.id}')">Modifier</button>
          <button type="button" class="btn btn-sm btn-accent" onclick="openReceiptModal('${f.id}')">Reçu</button>
          <button type="button" class="btn btn-sm btn-danger" onclick="deleteFinanceEntry('${f.id}')">Suppr.</button>
        </div>
      </td>
    </tr>
  `).join("") : `<tr><td colspan="6" style="text-align:center; color:var(--muted);">Aucune écriture.</td></tr>`;

  document.getElementById("donsTableBody").innerHTML = db.dons.length ? db.dons.map((d) => `
    <tr>
      <td>${escapeHtml(d.date || "-")}</td>
      <td><strong>${escapeHtml(d.donateur)}</strong></td>
      <td><span class="badge badge-blue">${escapeHtml(d.nature)}</span></td>
      <td>${d.nature === "Financier" ? formatMoney(d.montant) : escapeHtml(d.description || "")}</td>
      <td><button type="button" class="btn btn-sm btn-danger" onclick="deleteDon('${d.id}')">Suppr.</button></td>
    </tr>
  `).join("") : `<tr><td colspan="5" style="text-align:center; color:var(--muted);">Aucun don.</td></tr>`;

  document.getElementById("auditLogTableBody").innerHTML = db.auditLog.length ? db.auditLog.slice(0, 30).map((l) => `
    <tr>
      <td>${escapeHtml(l.date)}</td>
      <td>${escapeHtml(l.auteur)}</td>
      <td>${escapeHtml(l.action)}</td>
      <td>${escapeHtml(l.detail)}</td>
    </tr>
  `).join("") : `<tr><td colspan="4" style="text-align:center; color:var(--muted);">Aucune trace.</td></tr>`;
}

function openFinanceModal(id = null) {
  if (!canManageFinances()) return;
  const existing = id ? db.finances.find((f) => f.id === id) : null;
  openModal(existing ? "Modifier écriture" : "Ajouter écriture", `
    <form onsubmit="saveFinanceEntry(event, '${existing ? existing.id : ""}')">
      <div class="form-row">
        <div class="form-group"><label>Date *</label><input type="date" id="fin_date" value="${escapeHtml(existing ? existing.date : new Date().toISOString().slice(0, 10))}" required></div>
        <div class="form-group">
          <label>Type *</label>
          <select id="fin_type">
            <option value="entree" ${!existing || existing.type === "entree" ? "selected" : ""}>Entrée</option>
            <option value="sortie" ${existing && existing.type === "sortie" ? "selected" : ""}>Sortie</option>
          </select>
        </div>
        <div class="form-group"><label>Montant (FCFA) *</label><input type="number" id="fin_montant" min="0" step="any" value="${existing ? Number(existing.montant || 0) : ""}" required></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Catégorie</label><input type="text" id="fin_cat" value="${escapeHtml(existing ? existing.categorie : "Trésorerie")}"></div>
        <div class="form-group"><label>Libellé *</label><input type="text" id="fin_libelle" value="${escapeHtml(existing ? existing.libelle : "")}" required></div>
      </div>
      <div class="actions-row"><button type="submit" class="btn btn-success">Enregistrer</button><button type="button" class="btn btn-secondary" onclick="closeModal()">Annuler</button></div>
    </form>
  `);
}

async function saveFinanceEntry(e, id) {
  e.preventDefault();
  if (!canManageFinances()) return;
  const payload = {
    id: id || uid("fin"),
    date: document.getElementById("fin_date").value,
    type: document.getElementById("fin_type").value,
    montant: Number(document.getElementById("fin_montant").value || 0),
    categorie: document.getElementById("fin_cat").value.trim() || "Trésorerie",
    libelle: document.getElementById("fin_libelle").value.trim()
  };
  if (id) db.finances = db.finances.map((f) => (f.id === id ? payload : f));
  else db.finances.unshift(payload);
  closeModal();
  await persistDb(id ? "Modification écriture" : "Ajout écriture", `${payload.libelle} (${formatMoney(payload.montant)})`);
}

async function deleteFinanceEntry(id) {
  if (!canManageFinances()) return;
  if (!confirm("Supprimer cette écriture ?")) return;
  const target = db.finances.find((f) => f.id === id);
  db.finances = db.finances.filter((f) => f.id !== id);
  await persistDb("Suppression écriture", target ? target.libelle : id);
}

function openDonModal() {
  if (!canManageFinances()) return;
  openModal("Enregistrer un don", `
    <form onsubmit="saveDon(event)">
      <div class="form-row">
        <div class="form-group"><label>Donateur *</label><input type="text" id="don_donateur" required></div>
        <div class="form-group">
          <label>Nature</label>
          <select id="don_nature" onchange="toggleDonMontant()">
            <option value="Financier">Financier</option>
            <option value="En nature">En nature</option>
          </select>
        </div>
        <div class="form-group"><label>Date</label><input type="date" id="don_date" value="${new Date().toISOString().slice(0, 10)}"></div>
      </div>
      <div class="form-row">
        <div class="form-group" id="don_montant_wrap"><label>Montant (FCFA)</label><input type="number" id="don_montant" min="0" value="0"></div>
        <div class="form-group"><label>Description</label><input type="text" id="don_desc"></div>
      </div>
      <div class="actions-row"><button type="submit" class="btn btn-success">Enregistrer</button><button type="button" class="btn btn-secondary" onclick="closeModal()">Annuler</button></div>
    </form>
  `);
}

function toggleDonMontant() {
  const wrap = document.getElementById("don_montant_wrap");
  if (wrap) wrap.style.display = document.getElementById("don_nature").value === "Financier" ? "block" : "none";
}

async function saveDon(e) {
  e.preventDefault();
  if (!canManageFinances()) return;
  const donateur = document.getElementById("don_donateur").value.trim();
  const nature = document.getElementById("don_nature").value;
  const date = document.getElementById("don_date").value;
  const montant = Number(document.getElementById("don_montant").value || 0);
  const description = document.getElementById("don_desc").value.trim();

  db.dons.unshift({ id: uid("don"), donateur, nature, date, montant, description });
  if (nature === "Financier" && montant > 0) {
    db.finances.unshift({
      id: uid("fin"),
      date,
      type: "entree",
      categorie: "Don",
      libelle: `Don de ${donateur}${description ? " — " + description : ""}`,
      montant
    });
  }
  closeModal();
  await persistDb("Enregistrement don", `${donateur} (${nature})`);
}

async function deleteDon(id) {
  if (!canManageFinances()) return;
  db.dons = db.dons.filter((d) => d.id !== id);
  await persistDb("Suppression don", id);
}

/* REÇUS AVEC LOGOS GAUCHE/DROITE + CACHET */
function openReceiptModal(financeId = null) {
  if (!canManageFinances()) return;
  const f = financeId ? db.finances.find((x) => x.id === financeId) : null;
  const scoutOptions = db.scouts.map((s) => `<option value="${s.id}">${escapeHtml(s.nom)} ${escapeHtml(s.prenom)} (${escapeHtml(s.branche)})</option>`).join("");

  openModal("Générer un reçu de paiement", `
    <form onsubmit="buildReceiptPreview(event)">
      <div class="form-row">
        <div class="form-group"><label>Jeune / Membre</label><select id="rc_scout">${scoutOptions}</select></div>
        <div class="form-group">
          <label>Motif</label>
          <select id="rc_motif">
            <option value="Cotisation mensuelle">Cotisation mensuelle</option>
            <option value="Paiement d'activité">Paiement d'activité</option>
            <option value="Participation camp">Participation camp</option>
            <option value="Autre cotisation">Autre cotisation</option>
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Montant (FCFA) *</label><input type="number" id="rc_montant" min="1" value="${f ? Number(f.montant || 0) : Number(db.settings.cot_mens_j || 500)}" required></div>
        <div class="form-group"><label>Date *</label><input type="date" id="rc_date" value="${escapeHtml(f && f.date ? f.date : new Date().toISOString().slice(0, 10))}" required></div>
        <div class="form-group"><label>Précision</label><input type="text" id="rc_detail" value="${escapeHtml(f ? f.libelle : "")}"></div>
      </div>
      <button type="submit" class="btn btn-accent">Prévisualiser le reçu</button>
    </form>
    <div id="receiptPreviewArea" style="margin-top:16px;"></div>
  `);
}

function openReceiptForScout(scoutId, motifLabel, montantVal) {
  openReceiptModal();
  setTimeout(() => {
    const sel = document.getElementById("rc_scout");
    const det = document.getElementById("rc_detail");
    const mnt = document.getElementById("rc_montant");
    if (sel) sel.value = scoutId;
    if (det) det.value = motifLabel;
    if (mnt) mnt.value = montantVal;
  }, 30);
}

function buildReceiptPreview(e) {
  e.preventDefault();
  const scout = db.scouts.find((s) => s.id === document.getElementById("rc_scout").value);
  const motif = document.getElementById("rc_motif").value;
  const montant = Number(document.getElementById("rc_montant").value || 0);
  const date = document.getElementById("rc_date").value;
  const detail = document.getElementById("rc_detail").value.trim();

  const nomJeune = scout ? `${scout.nom} ${scout.prenom}` : "Membre";
  const brancheJeune = scout ? scout.branche : "";

  lastReceiptText = [
    `REÇU DE PAIEMENT — GROUPE SCOUT OBION`,
    `Date : ${date}`,
    `Membre : ${nomJeune} (${brancheJeune})`,
    `Motif : ${motif}${detail ? " — " + detail : ""}`,
    `Montant : ${formatMoney(montant)}`
  ].join("\n");

  document.getElementById("receiptPreviewArea").innerHTML = `
    <div class="receipt-box" id="printableReceiptCard">
      ${getPrintHeaderWithSideLogos("REÇU DE PAIEMENT — GROUPE OBION", `Date : ${date}`)}
      <p><strong>Membre :</strong> ${escapeHtml(nomJeune)} ${brancheJeune ? `(${escapeHtml(brancheJeune)})` : ""}</p>
      <p><strong>Motif :</strong> ${escapeHtml(motif)} ${detail ? `— ${escapeHtml(detail)}` : ""}</p>
      <p style="margin-top:8px; font-size:1.05rem;"><strong>Montant :</strong> ${formatMoney(montant)}</p>
      ${getPrintCachetHtml("REÇU TRÉSORERIE VALIDÉ")}
    </div>
    <div class="actions-row" style="margin-top:12px;">
      <button type="button" class="btn btn-sm btn-success" onclick="copyLastReceipt()">📋 Copier le reçu</button>
      <button type="button" class="btn btn-sm btn-secondary" onclick="printReceiptCard()">🖨️ Imprimer / PDF</button>
    </div>
  `;
}

function copyLastReceipt() {
  if (!lastReceiptText) return;
  navigator.clipboard?.writeText(lastReceiptText);
  alert("Reçu copié !");
}

function printReceiptCard() {
  const card = document.getElementById("printableReceiptCard");
  if (!card) return;
  triggerPrintHtml(card.outerHTML);
}

function printPointMensuel() {
  const month = document.getElementById("financeMonthPicker").value || new Date().toISOString().slice(0, 7);
  const rows = db.finances.filter((f) => String(f.date || "").startsWith(month));
  const entrees = rows.filter((f) => f.type === "entree").reduce((a, b) => a + Number(b.montant || 0), 0);
  const sorties = rows.filter((f) => f.type === "sortie").reduce((a, b) => a + Number(b.montant || 0), 0);

  triggerPrintHtml(`
    ${getPrintHeaderWithSideLogos(`POINT FINANCIER MENSUEL (${month}) — GROUPE OBION`, `Entrées : ${formatMoney(entrees)} · Sorties : ${formatMoney(sorties)} · Solde : ${formatMoney(entrees - sorties)}`)}
    <table style="width:100%; border-collapse:collapse;">
      <thead>
        <tr>
          <th style="border:1px solid #999; padding:6px;">Date</th>
          <th style="border:1px solid #999; padding:6px;">Type</th>
          <th style="border:1px solid #999; padding:6px;">Libellé</th>
          <th style="border:1px solid #999; padding:6px;">Montant</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((r) => `
          <tr>
            <td style="border:1px solid #999; padding:6px;">${escapeHtml(r.date)}</td>
            <td style="border:1px solid #999; padding:6px;">${escapeHtml(r.type)}</td>
            <td style="border:1px solid #999; padding:6px;">${escapeHtml(r.libelle)}</td>
            <td style="border:1px solid #999; padding:6px;">${formatMoney(r.montant)}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
    ${getPrintCachetHtml("POINT MENSUEL VALIDÉ")}
  `);
}

/* 9. ANNONCES PARENTS */
function applyAnnonceTemplate() {
  const tpl = document.getElementById("annonceTemplate").value;
  const br = document.getElementById("annonceBrancheSelect").value;
  const scoutId = document.getElementById("annonceScoutSelect").value;
  const sc = db.scouts.find((x) => x.id === scoutId);
  const jeuneNom = sc ? `${sc.prenom} ${sc.nom}` : "votre enfant";
  const mensMontant = formatMoney(db.settings.cot_mens_j || 500);

  const presets = {
    cotisation_mensuelle: `Bonjour chers parents (Groupe OBION), nous vous informons de la mise en place / du suivi de la cotisation mensuelle des jeunes (${mensMontant}). Merci pour votre accompagnement.`,
    eglise_tenue: `Bonjour chers parents (Groupe OBION), lors de notre prochaine activité à l'église, tous les jeunes doivent impérativement être en tenue scoute complète. Merci de bien le préparer.`,
    tenue_manquante: `Bonjour chers parents (Groupe OBION), nous signalons que ${jeuneNom} n'a pas encore de tenue scoute complète. Merci de prévoir de régulariser cela afin qu'il/elle soit prêt(e) pour les activités.`,
    nouvelles_regles: `Bonjour chers parents (Groupe OBION), de nouvelles consignes de vie et d'organisation ont été arrêtées pour ${isCU() ? "la branche " + br : "le groupe"}. Merci de veiller à leur bonne application.`,
    libre: ""
  };

  const area = document.getElementById("annonceTextArea");
  if (area && tpl !== "libre") {
    area.value = presets[tpl] || "";
  }
}

function renderAnnonceRecipients() {
  const mode = document.getElementById("annonceTargetMode").value;
  const brWrap = document.getElementById("annonceBrancheWrap");
  const scWrap = document.getElementById("annonceScoutWrap");
  const scSelect = document.getElementById("annonceScoutSelect");

  const baseList = getScopedScouts();
  const prevScout = scSelect.value;
  scSelect.innerHTML = baseList.map((s) => `<option value="${s.id}">${escapeHtml(s.nom)} ${escapeHtml(s.prenom)} (${escapeHtml(s.branche)})</option>`).join("");
  if (prevScout && baseList.some((s) => s.id === prevScout)) scSelect.value = prevScout;

  if (isCU() && currentUser.branche) {
    brWrap.style.display = "none";
    document.getElementById("annonceBrancheSelect").value = currentUser.branche;
  } else {
    brWrap.style.display = mode === "branche" ? "block" : "none";
  }
  scWrap.style.display = mode === "jeune" ? "block" : "none";

  let filtered = baseList;
  if (mode === "branche") {
    const selectedBr = isCU() && currentUser.branche ? currentUser.branche : document.getElementById("annonceBrancheSelect").value;
    filtered = filtered.filter((s) => s.branche === selectedBr);
  } else if (mode === "jeune") {
    filtered = filtered.filter((s) => s.id === scSelect.value);
  }

  const msg = encodeURIComponent(document.getElementById("annonceTextArea").value || "");
  document.getElementById("annonceRecipientsBody").innerHTML = filtered.length ? filtered.map((s) => {
    const waPhone = normalizeWaPhone(s.parent_tel);
    return `
      <tr>
        <td><strong>${escapeHtml(s.nom)} ${escapeHtml(s.prenom)}</strong></td>
        <td>${escapeHtml(s.branche)}</td>
        <td>${escapeHtml(s.parent_nom || "Parent")} — ${escapeHtml(s.parent_tel || "Pas de numéro")}</td>
        <td>
          ${waPhone
            ? `<a href="https://wa.me/${waPhone}?text=${msg}" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-success">WhatsApp</a>`
            : `<span class="badge badge-gray">Numéro absent</span>`}
        </td>
      </tr>
    `;
  }).join("") : `<tr><td colspan="4" style="text-align:center; color:var(--muted);">Aucun destinataire.</td></tr>`;
}

function copyAnnonceMessage() {
  const txt = document.getElementById("annonceTextArea").value || "";
  if (!txt.trim()) return alert("Le message est vide.");
  navigator.clipboard?.writeText(txt);
  alert("Message copié !");
}

/* 10. PARAMÈTRES & EXPORTS */
function renderSettingsInputs() {
  if (!isCG()) return;
  const st = db.settings;
  document.getElementById("cfg_cg_nom").value = st.cg_nom || "";
  document.getElementById("cfg_cg_tel").value = st.cg_tel || "";
  document.getElementById("cfg_wave_url").value = st.wave_url || "";
  document.getElementById("cfg_cot_j_total").value = st.cot_j_total ?? 2500;
  document.getElementById("cfg_cot_j_ascci").value = st.cot_j_ascci ?? 2085;
  document.getElementById("cfg_cot_j_groupe").value = st.cot_j_groupe ?? 415;
  document.getElementById("cfg_cot_mens_j").value = st.cot_mens_j ?? 500;
  document.getElementById("cfg_pin_cg").value = (st.pins && st.pins.cg) || "1111";
  document.getElementById("cfg_pin_fin").value = (st.pins && st.pins.financier) || "2222";
  document.getElementById("cfg_pin_cu").value = (st.pins && st.pins.cu) || "3333";
  document.getElementById("cfg_cachet_actif").value = String(Boolean(st.cachet_actif));
}

async function saveSettings(e) {
  e.preventDefault();
  if (!isCG()) return;
  db.settings = {
    ...db.settings,
    cg_nom: document.getElementById("cfg_cg_nom").value.trim(),
    cg_tel: document.getElementById("cfg_cg_tel").value.trim(),
    wave_url: document.getElementById("cfg_wave_url").value.trim(),
    cot_j_total: Number(document.getElementById("cfg_cot_j_total").value || 0),
    cot_j_ascci: Number(document.getElementById("cfg_cot_j_ascci").value || 0),
    cot_j_groupe: Number(document.getElementById("cfg_cot_j_groupe").value || 0),
    cot_mens_j: Number(document.getElementById("cfg_cot_mens_j").value || 0),
    cachet_actif: document.getElementById("cfg_cachet_actif").value === "true",
    pins: {
      cg: document.getElementById("cfg_pin_cg").value.trim() || "1111",
      financier: document.getElementById("cfg_pin_fin").value.trim() || "2222",
      cu: document.getElementById("cfg_pin_cu").value.trim() || "3333"
    }
  };
  await persistDb("Mise à jour paramètres", "Configuration du groupe");
  alert("Paramètres enregistrés !");
}

function exportBackupJson() {
  const blob = new Blob([JSON.stringify(db, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `obion-erp-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

async function importBackupJson(e) {
  if (!isCG()) return;
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  try {
    db = normalizeDb(JSON.parse(await file.text()));
    await persistDb("Restauration sauvegarde JSON", file.name);
    alert("Sauvegarde restaurée !");
  } catch (err) {
    alert("Fichier JSON invalide.");
  }
}

function exportEffectifsCsv() {
  const list = getScopedScouts();
  const headers = ["Nom", "Prenoms", "Branche", "Sexe", "Tenue", "Parent", "Telephone", "Matricule"];
  const lines = [
    headers.join(";"),
    ...list.map((s) => [
      s.nom, s.prenom, s.branche, s.sexe,
      s.tenue_complete ? "Complete" : "Incomplete",
      s.parent_nom || "", s.parent_tel || "", s.matricule || ""
    ].map((v) => `"${String(v ?? "").replaceAll('"', '""')}"`).join(";"))
  ];
  const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `effectifs-obion-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function openModal(title, htmlContent) {
  document.getElementById("modalTitle").textContent = title;
  document.getElementById("modalBody").innerHTML = htmlContent;
  document.getElementById("genericModal").classList.add("open");
}

function closeModal() {
  document.getElementById("genericModal").classList.remove("open");
}

window.addEventListener("DOMContentLoaded", () => {
  startRealtimeSync();
  if (currentUser) showAppShell();
  else toggleLoginBranch();
});
