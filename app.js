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
    cot_cu: 2600,
    cot_cg: 3000,
    cot_mens_j: 500,
    cot_mens_c: 0,
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
  const base = structuredClone(defaultData);
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

let db = normalizeDb(JSON.parse(localStorage.getItem(BACKUP_KEY) || "null"));
let currentUser = JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null");
let currentActiveTab = "dashboard";
let isSavingCloud = false;
let unsubscribeRealtime = null;
let quickAppelStates = {};

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
    .replaceAll('"', "&quot;");
}

function setSyncStatus(text, ok = true) {
  const el = document.getElementById("syncStatus");
  if (!el) return;
  el.textContent = text;
  el.style.background = ok ? "rgba(22, 163, 74, 0.25)" : "rgba(220, 38, 38, 0.28)";
}

async function persistDb(auditAction = "", auditDetail = "") {
  if (auditAction && currentUser) {
    db.auditLog = Array.isArray(db.auditLog) ? db.auditLog : [];
    db.auditLog.unshift({
      id: uid("log"),
      date: new Date().toLocaleString("fr-FR"),
      auteur: `${currentUser.role.toUpperCase()}${currentUser.branche ? " (" + currentUser.branche + ")" : ""}`,
      action: auditAction,
      detail: auditDetail
    });
    db.auditLog = db.auditLog.slice(0, 120);
  }

  db = normalizeDb(db);
  localStorage.setItem(BACKUP_KEY, JSON.stringify(db));
  renderAllViews();

  if (isSavingCloud) return;
  isSavingCloud = true;
  setSyncStatus("☁️ Synchronisation...", true);

  try {
    await docRefObion.set(db, { merge: true });
    setSyncStatus("☁️ Synchronisé", true);
  } catch (err) {
    console.error("Erreur Firestore set:", err);
    setSyncStatus("⚠️ Mode local (hors ligne)", false);
  } finally {
    isSavingCloud = false;
  }
}

function startRealtimeSync() {
  if (typeof unsubscribeRealtime === "function") {
    unsubscribeRealtime();
  }
  setSyncStatus("⏳ Connexion cloud...", true);
  unsubscribeRealtime = docRefObion.onSnapshot(
    (snap) => {
      if (snap.exists && !isSavingCloud) {
        db = normalizeDb(snap.data());
        localStorage.setItem(BACKUP_KEY, JSON.stringify(db));
        if (currentUser) renderAllViews();
      }
      setSyncStatus("☁️ Synchronisé", true);
    },
    (err) => {
      console.error("Erreur onSnapshot:", err);
      setSyncStatus("⚠️ Repli local actif", false);
    }
  );
}

/* AUTHENTIFICATION & RÔLES */
function toggleLoginBranch() {
  const role = document.getElementById("loginRole").value;
  document.getElementById("loginBranchGroup").style.display = role === "cu" ? "block" : "none";
}

function handleLogin(e) {
  e.preventDefault();
  const role = document.getElementById("loginRole").value;
  const branche = role === "cu" ? document.getElementById("loginBranch").value : null;
  const pin = document.getElementById("loginPin").value.trim();
  const expectedPin = (db.settings.pins && db.settings.pins[role]) || "1111";

  if (pin !== expectedPin) {
    alert("Code PIN incorrect pour ce rôle.");
    return;
  }

  currentUser = { role, branche, loginAt: Date.now() };
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(currentUser));
  showAppShell();
}

function handleLogout() {
  currentUser = null;
  sessionStorage.removeItem(SESSION_KEY);
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

function getScopedActivites() {
  if (isCU()) {
    return db.activites.filter((a) => a.cible === "cu_only" || a.cible === "tous_chefs");
  }
  return db.activites;
}

function showAppShell() {
  document.getElementById("loginScreen").style.display = "none";
  document.getElementById("appShell").style.display = "block";

  const roleLabels = {
    cg: "Chef de Groupe",
    financier: "Financier / Trésorier",
    cu: "Chef d'Unité"
  };

  document.getElementById("activeUserLabel").textContent =
    currentUser.role === "cg" ? (db.settings.cg_nom || "Chef de Groupe") : roleLabels[currentUser.role];

  const roleBadge = document.getElementById("activeRoleBadge");
  roleBadge.textContent = roleLabels[currentUser.role];

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

  if (cuMode && currentActiveTab === "finances") {
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
  renderEffectifs();
  renderQuickAppel();
  renderPresencesHistory();
  renderActivites();
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

/* STATISTIQUES SEXE & POURCENTAGES */
function computeGenderStats(list) {
  const total = list.length;
  const garcons = list.filter((x) => x.sexe === "Garçon").length;
  const filles = list.filter((x) => x.sexe === "Fille").length;
  const pctG = total ? Math.round((garcons / total) * 100) : 0;
  const pctF = total ? Math.round((filles / total) * 100) : 0;
  return { total, garcons, filles, pctG, pctF };
}

/* 1. TABLEAU DE BORD & ALERTES */
function renderDashboard() {
  const scouts = getScopedScouts();
  const chefs = getScopedChefs();
  const sStats = computeGenderStats(scouts);
  const cStats = computeGenderStats(chefs);

  const kpiGrid = document.getElementById("dashKpiGrid");
  const solde = db.finances.reduce((acc, f) => {
    const amt = Number(f.montant || 0);
    return acc + (f.type === "entree" ? amt : -amt);
  }, 0);

  kpiGrid.innerHTML = `
    <div class="kpi-box">
      <div class="kpi-label">Total Jeunes (${isCU() ? currentUser.branche : "Groupe"})</div>
      <div class="kpi-value">${sStats.total}</div>
      <div class="kpi-sub">Garçons : ${sStats.garcons} (${sStats.pctG}%) · Filles : ${sStats.filles} (${sStats.pctF}%)</div>
    </div>
    <div class="kpi-box">
      <div class="kpi-label">Maîtrise / Chefs</div>
      <div class="kpi-value">${cStats.total}</div>
      <div class="kpi-sub">H : ${cStats.garcons} (${cStats.pctG}%) · F : ${cStats.filles} (${cStats.pctF}%)</div>
    </div>
    <div class="kpi-box">
      <div class="kpi-label">Activités visibles</div>
      <div class="kpi-value">${getScopedActivites().length}</div>
      <div class="kpi-sub">Camps visibles : ${getScopedCamps().length}</div>
    </div>
    ${canManageFinances() ? `
    <div class="kpi-box">
      <div class="kpi-label">Solde Trésorerie</div>
      <div class="kpi-value">${formatMoney(solde)}</div>
      <div class="kpi-sub">Dons enregistrés : ${db.dons.length}</div>
    </div>` : `
    <div class="kpi-box">
      <div class="kpi-label">Sans tenue scoute</div>
      <div class="kpi-value">${scouts.filter((s) => !s.tenue_complete).length}</div>
      <div class="kpi-sub">À signaler aux parents</div>
    </div>`}
  `;

  const tbody = document.getElementById("dashGenderTableBody");
  const branchesToShow = isCU() && currentUser.branche ? [currentUser.branche] : BRANCHES;
  tbody.innerHTML = branchesToShow.map((br) => {
    const bScouts = scouts.filter((s) => s.branche === br);
    const bChefs = chefs.filter((c) => c.branche === br);
    const st = computeGenderStats(bScouts);
    return `
      <tr>
        <td><strong>${escapeHtml(br)}</strong></td>
        <td>${st.total}</td>
        <td>${st.garcons} (${st.pctG}%)</td>
        <td>${st.filles} (${st.pctF}%)</td>
        <td>${bChefs.length}</td>
      </tr>
    `;
  }).join("");

  const alertsEl = document.getElementById("dashAlertsContainer");
  const alerts = [];
  const noPhone = scouts.filter((s) => !s.parent_tel || !s.parent_tel.trim());
  const noTenue = scouts.filter((s) => !s.tenue_complete);
  const paidNoMatricule = scouts.filter((s) => s.cotisation_annuelle === "paye" && (!s.matricule || !s.matricule.trim()));

  if (noPhone.length) {
    alerts.push(`<div class="alert-item"><span>📱 <strong>${noPhone.length}</strong> jeune(s) sans numéro de téléphone parent.</span><button class="btn btn-sm btn-secondary" onclick="switchTab('effectifs')">Compléter</button></div>`);
  }
  if (noTenue.length) {
    alerts.push(`<div class="alert-item info"><span>⚜️ <strong>${noTenue.length}</strong> jeune(s) sans tenue scoute complète.</span><button class="btn btn-sm btn-info" onclick="switchTab('annonces')">Prévenir parent</button></div>`);
  }
  if (canManageFinances() && paidNoMatricule.length) {
    alerts.push(`<div class="alert-item danger"><span>🆔 <strong>${paidNoMatricule.length}</strong> jeune(s) à jour de cotisation annuelle sans matricule enregistré.</span><button class="btn btn-sm btn-danger" onclick="switchTab('finances')">Vérifier</button></div>`);
  }

  alertsEl.innerHTML = alerts.length
    ? alerts.join("")
    : `<p style="color:var(--muted); font-size:0.88rem;">Aucune alerte bloquante pour le moment.</p>`;
}

/* 2. EFFECTIFS (JEUNES & CHEFS) */
function renderEffectifs() {
  const filterBr = document.getElementById("filterScoutBranche").value;
  const query = (document.getElementById("searchScoutInput").value || "").trim().toLowerCase();

  let list = getScopedScouts();
  if (filterBr && filterBr !== "Toutes") {
    list = list.filter((s) => s.branche === filterBr);
  }
  if (query) {
    list = list.filter((s) =>
      `${s.nom} ${s.prenom} ${s.matricule || ""} ${s.parent_nom || ""}`.toLowerCase().includes(query)
    );
  }

  const st = computeGenderStats(list);
  document.getElementById("scoutStatsBar").innerHTML = `
    <div class="kpi-box"><div class="kpi-label">Effectif filtré</div><div class="kpi-value">${st.total}</div></div>
    <div class="kpi-box"><div class="kpi-label">Garçons</div><div class="kpi-value">${st.garcons} <small>(${st.pctG}%)</small></div></div>
    <div class="kpi-box"><div class="kpi-label">Filles</div><div class="kpi-value">${st.filles} <small>(${st.pctF}%)</small></div></div>
    <div class="kpi-box"><div class="kpi-label">Avec matricule</div><div class="kpi-value">${list.filter((x) => x.matricule).length}</div></div>
  `;

  const tbody = document.getElementById("scoutsTableBody");
  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--muted);">Aucun jeune enregistré sur ce périmètre.</td></tr>`;
  } else {
    tbody.innerHTML = list.map((s) => `
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
    `).join("");
  }

  const chefs = getScopedChefs();
  const cSt = computeGenderStats(chefs);
  document.getElementById("chefsStatsBar").innerHTML =
    `Total maîtrise : <strong>${cSt.total}</strong> · Garçons : <strong>${cSt.garcons} (${cSt.pctG}%)</strong> · Filles : <strong>${cSt.filles} (${cSt.pctF}%)</strong>`;

  const chefsBody = document.getElementById("chefsTableBody");
  if (!chefs.length) {
    chefsBody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--muted);">Aucun chef enregistré.</td></tr>`;
  } else {
    chefsBody.innerHTML = chefs.map((c) => `
      <tr>
        <td><strong>${escapeHtml(c.nom)}</strong></td>
        <td>${escapeHtml(c.fonction || "Chef")}</td>
        <td>${escapeHtml(c.branche || "Groupe")}</td>
        <td>${escapeHtml(c.sexe || "-")}</td>
        <td>${escapeHtml(c.tel || "-")}</td>
        <td>
          ${canManageStructure() ? `
            <button type="button" class="btn btn-sm btn-secondary" onclick="openChefModal('${c.id}')">Modifier</button>
            <button type="button" class="btn btn-sm btn-danger" onclick="deleteChef('${c.id}')">Suppr.</button>
          ` : `<span class="badge badge-gray">Lecture</span>`}
        </td>
      </tr>
    `).join("");
  }
}

function openScoutModal(scoutId = null) {
  const existing = scoutId ? db.scouts.find((s) => s.id === scoutId) : null;
  const defaultBr = isCU() && currentUser.branche ? currentUser.branche : (existing ? existing.branche : "Meute");

  openModal(existing ? "Modifier la fiche jeune" : "Ajouter un jeune", `
    <form onsubmit="saveScout(event, '${existing ? existing.id : ""}')">
      <div class="form-row">
        <div class="form-group">
          <label>Nom *</label>
          <input type="text" id="sc_nom" value="${escapeHtml(existing ? existing.nom : "")}" required>
        </div>
        <div class="form-group">
          <label>Prénoms *</label>
          <input type="text" id="sc_prenom" value="${escapeHtml(existing ? existing.prenom : "")}" required>
        </div>
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
        <div class="form-group">
          <label>Nom du parent / tuteur</label>
          <input type="text" id="sc_parent_nom" value="${escapeHtml(existing ? existing.parent_nom : "")}">
        </div>
        <div class="form-group">
          <label>Téléphone parent (WhatsApp)</label>
          <input type="text" id="sc_parent_tel" value="${escapeHtml(existing ? existing.parent_tel : "")}" placeholder="+22507...">
        </div>
        <div class="form-group">
          <label>Contact d'urgence secondaire</label>
          <input type="text" id="sc_urgence_tel" value="${escapeHtml(existing ? existing.urgence_tel : "")}">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Cotisation annuelle</label>
          <select id="sc_cot_annuelle">
            <option value="en_attente" ${!existing || existing.cotisation_annuelle !== "paye" ? "selected" : ""}>En attente</option>
            <option value="paye" ${existing && existing.cotisation_annuelle === "paye" ? "selected" : ""}>Payée</option>
          </select>
        </div>
        <div class="form-group">
          <label>Matricule national / ECC</label>
          <input type="text" id="sc_matricule" value="${escapeHtml(existing ? existing.matricule : "")}">
        </div>
      </div>
      <div class="form-group">
        <label>Allergies / Infos médicales utiles en camp</label>
        <input type="text" id="sc_allergies" value="${escapeHtml(existing ? existing.allergies : "")}">
      </div>
      <div class="actions-row">
        <button type="submit" class="btn btn-success">Enregistrer</button>
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Annuler</button>
      </div>
    </form>
  `);
}

async function saveScout(e, id) {
  e.preventDefault();
  const brancheVal = isCU() && currentUser.branche
    ? currentUser.branche
    : document.getElementById("sc_branche").value;

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
    cotisation_annuelle: document.getElementById("sc_cot_annuelle").value,
    matricule: document.getElementById("sc_matricule").value.trim(),
    allergies: document.getElementById("sc_allergies").value.trim()
  };

  if (id) {
    db.scouts = db.scouts.map((s) => (s.id === id ? { ...s, ...payload } : s));
  } else {
    db.scouts.push({ ...payload, etape_pedago: "Début", notes_pedago: "" });
  }
  closeModal();
  await persistDb(id ? "Modification jeune" : "Ajout jeune", `${payload.nom} ${payload.prenom} (${payload.branche})`);
}

async function deleteScout(id) {
  if (!canManageStructure()) return;
  if (!confirm("Supprimer cette fiche jeune ?")) return;
  db.scouts = db.scouts.filter((s) => s.id !== id);
  await persistDb("Suppression jeune", id);
}

function openChefModal(chefId = null) {
  if (!canManageStructure()) return;
  const existing = chefId ? db.chefs.find((c) => c.id === chefId) : null;
  openModal(existing ? "Modifier un chef" : "Ajouter un chef", `
    <form onsubmit="saveChef(event, '${existing ? existing.id : ""}')">
      <div class="form-row">
        <div class="form-group">
          <label>Nom & Prénoms *</label>
          <input type="text" id="ch_nom" value="${escapeHtml(existing ? existing.nom : "")}" required>
        </div>
        <div class="form-group">
          <label>Fonction</label>
          <input type="text" id="ch_fonction" value="${escapeHtml(existing ? existing.fonction : "Chef d'Unité")}">
        </div>
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
        <div class="form-group">
          <label>Téléphone</label>
          <input type="text" id="ch_tel" value="${escapeHtml(existing ? existing.tel : "")}">
        </div>
      </div>
      <div class="actions-row">
        <button type="submit" class="btn btn-success">Enregistrer</button>
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Annuler</button>
      </div>
    </form>
  `);
}

async function saveChef(e, id) {
  e.preventDefault();
  const payload = {
    id: id || uid("chef"),
    nom: document.getElementById("ch_nom").value.trim(),
    fonction: document.getElementById("ch_fonction").value.trim(),
    branche: document.getElementById("ch_branche").value,
    sexe: document.getElementById("ch_sexe").value,
    tel: document.getElementById("ch_tel").value.trim()
  };
  if (id) {
    db.chefs = db.chefs.map((c) => (c.id === id ? payload : c));
  } else {
    db.chefs.push(payload);
  }
  closeModal();
  await persistDb(id ? "Modification chef" : "Ajout chef", payload.nom);
}

async function deleteChef(id) {
  if (!canManageStructure()) return;
  if (!confirm("Retirer ce chef de la liste ?")) return;
  db.chefs = db.chefs.filter((c) => c.id !== id);
  await persistDb("Suppression chef", id);
}

/* 3. APPELS & PRÉSENCES (SIMPLIFIÉ POUR LE CU) */
function renderQuickAppel() {
  const br = document.getElementById("appelBrancheSelect").value;
  const list = db.scouts.filter((s) => br === "Toutes" || s.branche === br);
  const container = document.getElementById("quickAppelList");

  if (!list.length) {
    container.innerHTML = `<p style="color:var(--muted); font-size:0.88rem;">Aucun jeune dans cette branche pour faire l'appel.</p>`;
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
  db.scouts
    .filter((s) => br === "Toutes" || s.branche === br)
    .forEach((s) => { quickAppelStates[s.id] = state; });
  renderQuickAppel();
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

  const presents = targets.filter((s) => (quickAppelStates[s.id] || "Présent") === "Présent").map((s) => s.id);
  const absents = targets.filter((s) => quickAppelStates[s.id] === "Absent").map((s) => s.id);

  db.presences.unshift({
    id: uid("pres"),
    date,
    branche: br,
    theme,
    presents,
    absents
  });

  document.getElementById("appelThemeInput").value = "";
  await persistDb("Enregistrement appel", `${br} — ${date} (${presents.length} présents)`);
  alert("Appel enregistré !");
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
        ${canManageStructure() ? `<button type="button" class="btn btn-sm btn-danger" onclick="deletePresence('${p.id}')">Suppr.</button>` : "-"}
      </td>
    </tr>
  `).join("");
}

async function deletePresence(id) {
  if (!canManageStructure()) return;
  db.presences = db.presences.filter((p) => p.id !== id);
  await persistDb("Suppression appel", id);
}

/* 4. ACTIVITÉS DE MAÎTRISE (CG SEUL, CU SEUL, TOUS LES CHEFS) */
function renderActivites() {
  const cibleFilter = document.getElementById("filterActiviteCible").value;
  let list = getScopedActivites();
  if (cibleFilter !== "all") {
    list = list.filter((a) => a.cible === cibleFilter);
  }

  const labels = {
    cg_only: `<span class="badge badge-purple">CG uniquement</span>`,
    cu_only: `<span class="badge badge-amber">CU uniquement</span>`,
    tous_chefs: `<span class="badge badge-green">Tous les chefs</span>`
  };

  const tbody = document.getElementById("activitesTableBody");
  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--muted);">Aucune activité de maîtrise à afficher.</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map((a) => `
    <tr>
      <td>${escapeHtml(a.date || "-")}</td>
      <td><strong>${escapeHtml(a.titre)}</strong></td>
      <td>${labels[a.cible] || escapeHtml(a.cible)}</td>
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
  openModal(existing ? "Modifier l'activité de maîtrise" : "Nouvelle activité de maîtrise", `
    <form onsubmit="saveActivite(event, '${existing ? existing.id : ""}')">
      <div class="form-group">
        <label>Titre de la réunion / formation *</label>
        <input type="text" id="act_titre" value="${escapeHtml(existing ? existing.titre : "")}" required>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Date</label>
          <input type="date" id="act_date" value="${escapeHtml(existing ? existing.date : new Date().toISOString().slice(0, 10))}">
        </div>
        <div class="form-group">
          <label>Public concerné *</label>
          <select id="act_cible">
            <option value="tous_chefs" ${!existing || existing.cible === "tous_chefs" ? "selected" : ""}>Tous les chefs</option>
            <option value="cu_only" ${existing && existing.cible === "cu_only" ? "selected" : ""}>CU uniquement</option>
            <option value="cg_only" ${existing && existing.cible === "cg_only" ? "selected" : ""}>CG uniquement</option>
          </select>
        </div>
      </div>
      <div class="form-group">
        <label>Lieu / Ordre du jour / Notes</label>
        <textarea id="act_notes">${escapeHtml(existing ? existing.notes : "")}</textarea>
      </div>
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
    notes: document.getElementById("act_notes").value.trim()
  };
  if (id) {
    db.activites = db.activites.map((a) => (a.id === id ? payload : a));
  } else {
    db.activites.unshift(payload);
  }
  closeModal();
  await persistDb(id ? "Modification activité maîtrise" : "Création activité maîtrise", payload.titre);
}

async function deleteActivite(id) {
  if (!canManageStructure()) return;
  db.activites = db.activites.filter((a) => a.id !== id);
  await persistDb("Suppression activité maîtrise", id);
}

/* 5. CAMPS & AUTORISATION PARENTALE */
function renderCamps() {
  const scope = document.getElementById("filterCampScope").value;
  let list = getScopedCamps();
  if (scope !== "all") {
    list = list.filter((c) => c.type === scope);
  }

  const tbody = document.getElementById("campsTableBody");
  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--muted);">Aucun camp visible sur votre périmètre.</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map((c) => {
    const supLabel = c.type === "branche"
      ? `Superviseurs branche (${escapeHtml(c.branche || "")})`
      : "Superviseurs du groupe";
    return `
      <tr>
        <td><strong>${escapeHtml(c.nom)}</strong></td>
        <td>
          <span class="badge badge-blue">${escapeHtml(c.type)}</span>
          ${c.branche ? `<span class="badge badge-gray">${escapeHtml(c.branche)}</span>` : ""}
        </td>
        <td>${escapeHtml(c.dates || "-")}<br><small>${escapeHtml(c.lieu || "")}</small></td>
        <td>${supLabel}<br><small>${escapeHtml(c.superviseurs || "Chefs désignés")}</small></td>
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
    `;
  }).join("");
}

function openCampModal(id = null) {
  if (!canManageStructure()) return;
  const existing = id ? db.camps.find((c) => c.id === id) : null;
  openModal(existing ? "Modifier le camp" : "Nouveau camp", `
    <form onsubmit="saveCamp(event, '${existing ? existing.id : ""}')">
      <div class="form-group">
        <label>Nom du camp *</label>
        <input type="text" id="cp_nom" value="${escapeHtml(existing ? existing.nom : "")}" required>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Type de camp</label>
          <select id="cp_type" onchange="toggleCampBrancheInput()">
            <option value="branche" ${!existing || existing.type === "branche" ? "selected" : ""}>Camp de branche</option>
            <option value="groupe" ${existing && existing.type === "groupe" ? "selected" : ""}>Camp de groupe</option>
            <option value="national" ${existing && existing.type === "national" ? "selected" : ""}>Camp national</option>
          </select>
        </div>
        <div class="form-group" id="cp_branche_wrap">
          <label>Branche concernée</label>
          <select id="cp_branche">
            ${BRANCHES.map((b) => `<option value="${b}" ${existing && existing.branche === b ? "selected" : ""}>${b}</option>`).join("")}
          </select>
        </div>
        <div class="form-group">
          <label>Participation / Frais (FCFA)</label>
          <input type="number" id="cp_frais" min="0" value="${existing ? Number(existing.frais || 0) : 0}">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Dates</label>
          <input type="text" id="cp_dates" value="${escapeHtml(existing ? existing.dates : "")}" placeholder="Ex: 12 au 15 août">
        </div>
        <div class="form-group">
          <label>Lieu</label>
          <input type="text" id="cp_lieu" value="${escapeHtml(existing ? existing.lieu : "")}">
        </div>
      </div>
      <div class="form-group">
        <label>Chefs superviseurs</label>
        <input type="text" id="cp_superviseurs" value="${escapeHtml(existing ? existing.superviseurs : "")}" placeholder="Noms des chefs superviseurs">
      </div>
      <div class="actions-row">
        <button type="submit" class="btn btn-success">Enregistrer</button>
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Annuler</button>
      </div>
    </form>
  `);
  toggleCampBrancheInput();
}

function toggleCampBrancheInput() {
  const type = document.getElementById("cp_type").value;
  const wrap = document.getElementById("cp_branche_wrap");
  if (wrap) wrap.style.display = type === "branche" ? "block" : "none";
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
  if (id) {
    db.camps = db.camps.map((c) => (c.id === id ? payload : c));
  } else {
    db.camps.unshift(payload);
  }
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
  const pz = document.getElementById("printZone");
  pz.innerHTML = `
    <div style="font-family:sans-serif; padding:16px;">
      <h2>AUTORISATION PARENTALE DE CAMP — GROUPE OBION</h2>
      <p style="margin:12px 0;">Je soussigné(e), parent / tuteur légal, autorise mon enfant à participer au camp :</p>
      <p><strong>Camp :</strong> ${escapeHtml(camp.nom)}</p>
      <p><strong>Type / Branche :</strong> ${escapeHtml(camp.type)} ${camp.branche ? "— " + escapeHtml(camp.branche) : ""}</p>
      <p><strong>Dates :</strong> ${escapeHtml(camp.dates || "À préciser")}</p>
      <p><strong>Lieu :</strong> ${escapeHtml(camp.lieu || "À préciser")}</p>
      <p><strong>Supervision :</strong> ${escapeHtml(camp.superviseurs || "Chefs du Groupe OBION")}</p>
      <div style="margin-top:36px; display:flex; justify-content:space-between;">
        <div>Signature du parent / tuteur</div>
        <div>Pour le Groupe OBION : ${escapeHtml(db.settings.cg_nom || "Chef de Groupe")}</div>
      </div>
    </div>
  `;
  window.print();
}

/* 6. PÉDAGOGIE */
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
  if (br && br !== "Toutes") {
    list = list.filter((s) => s.branche === br);
  }

  const tbody = document.getElementById("pedagoTableBody");
  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--muted);">Aucun jeune à afficher.</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map((s) => `
    <tr>
      <td><strong>${escapeHtml(s.nom)} ${escapeHtml(s.prenom)}</strong></td>
      <td>${escapeHtml(s.branche)}</td>
      <td><span class="badge badge-green">${escapeHtml(s.etape_pedago || "Début")}</span></td>
      <td>${escapeHtml(s.notes_pedago || "-")}</td>
      <td><button type="button" class="btn btn-sm btn-secondary" onclick="openPedagoModal('${s.id}')">Mettre à jour</button></td>
    </tr>
  `).join("");
}

function openPedagoModal(scoutId) {
  const s = db.scouts.find((x) => x.id === scoutId);
  if (!s) return;
  openModal(`Progression pédagogique — ${s.nom} ${s.prenom}`, `
    <form onsubmit="savePedago(event, '${s.id}')">
      <div class="form-group">
        <label>Étape / Badge / Progression</label>
        <input type="text" id="pd_etape" value="${escapeHtml(s.etape_pedago || "")}">
      </div>
      <div class="form-group">
        <label>Observations / Notes</label>
        <textarea id="pd_notes">${escapeHtml(s.notes_pedago || "")}</textarea>
      </div>
      <div class="actions-row">
        <button type="submit" class="btn btn-success">Enregistrer</button>
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Annuler</button>
      </div>
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

/* 7. MATÉRIEL */
function renderMateriel() {
  const tbody = document.getElementById("materielTableBody");
  if (!db.materiel.length) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--muted);">Aucun matériel enregistré.</td></tr>`;
    return;
  }
  tbody.innerHTML = db.materiel.map((m) => `
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
  `).join("");
}

function openMaterielModal(id = null) {
  const existing = id ? db.materiel.find((m) => m.id === id) : null;
  openModal(existing ? "Modifier le matériel" : "Ajouter du matériel", `
    <form onsubmit="saveMateriel(event, '${existing ? existing.id : ""}')">
      <div class="form-row">
        <div class="form-group">
          <label>Désignation *</label>
          <input type="text" id="mat_nom" value="${escapeHtml(existing ? existing.nom : "")}" required>
        </div>
        <div class="form-group">
          <label>Quantité *</label>
          <input type="number" id="mat_qte" min="0" value="${existing ? Number(existing.quantite || 0) : 1}" required>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>État</label>
          <input type="text" id="mat_etat" value="${escapeHtml(existing ? existing.etat : "Bon état")}">
        </div>
        <div class="form-group">
          <label>Affectation / Branche</label>
          <input type="text" id="mat_aff" value="${escapeHtml(existing ? existing.affectation : "Groupe")}">
        </div>
      </div>
      <div class="actions-row">
        <button type="submit" class="btn btn-success">Enregistrer</button>
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Annuler</button>
      </div>
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
  if (id) {
    db.materiel = db.materiel.map((m) => (m.id === id ? payload : m));
  } else {
    db.materiel.push(payload);
  }
  closeModal();
  await persistDb(id ? "Modification matériel" : "Ajout matériel", payload.nom);
}

async function deleteMateriel(id) {
  db.materiel = db.materiel.filter((m) => m.id !== id);
  await persistDb("Suppression matériel", id);
}

/* 8. FINANCES, WAVE RACCOURCI, DONS, JOURNAL & REÇUS */
function renderWaveTresorerieBox() {
  const box = document.getElementById("waveTresorerieBox");
  const linkBtn = document.getElementById("waveTresorerieLinkBtn");
  const label = document.getElementById("waveTresorerieUrlLabel");
  if (!box || !linkBtn || !label) return;

  const url = String((db.settings && db.settings.wave_url) || "").trim();
  if (!url) {
    box.style.display = "none";
    return;
  }
  box.style.display = "flex";
  label.textContent = url;
  linkBtn.href = url;
}

function copyWavePaymentLink() {
  const url = String((db.settings && db.settings.wave_url) || "").trim();
  if (!url) {
    alert("Aucun lien configuré dans Paramètres.");
    return;
  }
  navigator.clipboard?.writeText(url);
  alert("Lien copié !");
}

function renderFinances() {
  if (!canManageFinances()) return;
  renderWaveTresorerieBox();

  const month = document.getElementById("financeMonthPicker").value || new Date().toISOString().slice(0, 7);
  const monthEntries = db.finances.filter((f) => String(f.date || "").startsWith(month));

  const entreesMois = monthEntries.filter((f) => f.type === "entree").reduce((a, b) => a + Number(b.montant || 0), 0);
  const sortiesMois = monthEntries.filter((f) => f.type === "sortie").reduce((a, b) => a + Number(b.montant || 0), 0);
  const soldeGlobal = db.finances.reduce((a, b) => a + (b.type === "entree" ? Number(b.montant || 0) : -Number(b.montant || 0)), 0);
  const partEccEstimee = db.scouts.filter((s) => s.cotisation_annuelle === "paye").length * Number(db.settings.cot_j_ascci || 2085);

  document.getElementById("financeKpiGrid").innerHTML = `
    <div class="kpi-box"><div class="kpi-label">Entrées (${escapeHtml(month)})</div><div class="kpi-value" style="color:var(--success);">${formatMoney(entreesMois)}</div></div>
    <div class="kpi-box"><div class="kpi-label">Sorties (${escapeHtml(month)})</div><div class="kpi-value" style="color:var(--danger);">${formatMoney(sortiesMois)}</div></div>
    <div class="kpi-box"><div class="kpi-label">Solde global caisse</div><div class="kpi-value">${formatMoney(soldeGlobal)}</div></div>
    <div class="kpi-box"><div class="kpi-label">Repère part ECC / annuelles</div><div class="kpi-value">${formatMoney(partEccEstimee)}</div><div class="kpi-sub">Unité : ${formatMoney(db.settings.cot_j_ascci || 2085)}</div></div>
  `;

  const tbody = document.getElementById("financesTableBody");
  if (!db.finances.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--muted);">Aucune écriture enregistrée.</td></tr>`;
  } else {
    tbody.innerHTML = db.finances.map((f) => `
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
    `).join("");
  }

  const donsBody = document.getElementById("donsTableBody");
  if (!db.dons.length) {
    donsBody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--muted);">Aucun don enregistré.</td></tr>`;
  } else {
    donsBody.innerHTML = db.dons.map((d) => `
      <tr>
        <td>${escapeHtml(d.date || "-")}</td>
        <td><strong>${escapeHtml(d.donateur)}</strong></td>
        <td><span class="badge badge-blue">${escapeHtml(d.nature)}</span></td>
        <td>${d.nature === "Financier" ? formatMoney(d.montant) : escapeHtml(d.description || "")}</td>
        <td><button type="button" class="btn btn-sm btn-danger" onclick="deleteDon('${d.id}')">Suppr.</button></td>
      </tr>
    `).join("");
  }

  const logBody = document.getElementById("auditLogTableBody");
  if (!db.auditLog.length) {
    logBody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--muted);">Aucune trace enregistrée.</td></tr>`;
  } else {
    logBody.innerHTML = db.auditLog.slice(0, 25).map((l) => `
      <tr>
        <td>${escapeHtml(l.date)}</td>
        <td>${escapeHtml(l.auteur)}</td>
        <td>${escapeHtml(l.action)}</td>
        <td>${escapeHtml(l.detail)}</td>
      </tr>
    `).join("");
  }
}

function openFinanceModal(id = null) {
  if (!canManageFinances()) return;
  const existing = id ? db.finances.find((f) => f.id === id) : null;
  openModal(existing ? "Modifier l'écriture financière" : "Ajouter une écriture financière", `
    <form onsubmit="saveFinanceEntry(event, '${existing ? existing.id : ""}')">
      <div class="form-row">
        <div class="form-group">
          <label>Date *</label>
          <input type="date" id="fin_date" value="${escapeHtml(existing ? existing.date : new Date().toISOString().slice(0, 10))}" required>
        </div>
        <div class="form-group">
          <label>Type *</label>
          <select id="fin_type">
            <option value="entree" ${!existing || existing.type === "entree" ? "selected" : ""}>Entrée</option>
            <option value="sortie" ${existing && existing.type === "sortie" ? "selected" : ""}>Sortie</option>
          </select>
        </div>
        <div class="form-group">
          <label>Montant (FCFA) *</label>
          <input type="number" id="fin_montant" min="0" step="any" value="${existing ? Number(existing.montant || 0) : ""}" required>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Catégorie</label>
          <input type="text" id="fin_cat" value="${escapeHtml(existing ? existing.categorie : "Cotisation / Activité")}">
        </div>
        <div class="form-group">
          <label>Libellé / Description *</label>
          <input type="text" id="fin_libelle" value="${escapeHtml(existing ? existing.libelle : "")}" required>
        </div>
      </div>
      <div class="actions-row">
        <button type="submit" class="btn btn-success">Enregistrer</button>
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Annuler</button>
      </div>
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
    categorie: document.getElementById("fin_cat").value.trim() || "Général",
    libelle: document.getElementById("fin_libelle").value.trim()
  };
  if (id) {
    db.finances = db.finances.map((f) => (f.id === id ? payload : f));
  } else {
    db.finances.unshift(payload);
  }
  closeModal();
  await persistDb(id ? "Modification écriture financière" : "Ajout écriture financière", `${payload.libelle} (${formatMoney(payload.montant)})`);
}

async function deleteFinanceEntry(id) {
  if (!canManageFinances()) return;
  if (!confirm("Supprimer cette écriture ?")) return;
  const target = db.finances.find((f) => f.id === id);
  db.finances = db.finances.filter((f) => f.id !== id);
  await persistDb("Suppression écriture financière", target ? target.libelle : id);
}

function openDonModal() {
  if (!canManageFinances()) return;
  openModal("Enregistrer un don", `
    <form onsubmit="saveDon(event)">
      <div class="form-row">
        <div class="form-group">
          <label>Donateur *</label>
          <input type="text" id="don_donateur" required>
        </div>
        <div class="form-group">
          <label>Nature du don</label>
          <select id="don_nature" onchange="toggleDonMontant()">
            <option value="Financier">Financier</option>
            <option value="En nature">En nature</option>
          </select>
        </div>
        <div class="form-group">
          <label>Date</label>
          <input type="date" id="don_date" value="${new Date().toISOString().slice(0, 10)}">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group" id="don_montant_wrap">
          <label>Montant (FCFA)</label>
          <input type="number" id="don_montant" min="0" value="0">
        </div>
        <div class="form-group">
          <label>Description / Détails</label>
          <input type="text" id="don_desc" placeholder="Ex: Don matériel, soutien activité...">
        </div>
      </div>
      <div class="actions-row">
        <button type="submit" class="btn btn-success">Enregistrer le don</button>
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Annuler</button>
      </div>
    </form>
  `);
}

function toggleDonMontant() {
  const nat = document.getElementById("don_nature").value;
  document.getElementById("don_montant_wrap").style.display = nat === "Financier" ? "block" : "none";
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

/* GÉNÉRATION DE REÇUS (ACTIVITÉS & COTISATIONS MENSUELLES) */
function openReceiptModal(financeId = null) {
  if (!canManageFinances()) return;
  const f = financeId ? db.finances.find((x) => x.id === financeId) : null;
  const scoutOptions = db.scouts.map((s) => `<option value="${s.id}">${escapeHtml(s.nom)} ${escapeHtml(s.prenom)} (${escapeHtml(s.branche)})</option>`).join("");

  openModal("Générer un reçu de paiement", `
    <form onsubmit="buildReceiptPreview(event)">
      <div class="form-row">
        <div class="form-group">
          <label>Jeune / Membre</label>
          <select id="rc_scout">${scoutOptions}</select>
        </div>
        <div class="form-group">
          <label>Motif du paiement</label>
          <select id="rc_motif">
            <option value="Cotisation mensuelle">Cotisation mensuelle</option>
            <option value="Paiement d'activité">Paiement d'activité</option>
            <option value="Participation camp">Participation camp</option>
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Montant payé (FCFA) *</label>
          <input type="number" id="rc_montant" min="1" value="${f ? Number(f.montant || 0) : Number(db.settings.cot_mens_j || 500)}" required>
        </div>
        <div class="form-group">
          <label>Date *</label>
          <input type="date" id="rc_date" value="${escapeHtml(f && f.date ? f.date : new Date().toISOString().slice(0, 10))}" required>
        </div>
        <div class="form-group">
          <label>Précision (mois ou activité)</label>
          <input type="text" id="rc_detail" value="${escapeHtml(f ? f.libelle : "")}" placeholder="Ex: Novembre 2026 ou Sortie">
        </div>
      </div>
      <button type="submit" class="btn btn-accent">Prévisualiser le reçu</button>
    </form>
    <div id="receiptPreviewArea" style="margin-top:16px;"></div>
  `);
}

function buildReceiptPreview(e) {
  e.preventDefault();
  const scoutId = document.getElementById("rc_scout").value;
  const scout = db.scouts.find((s) => s.id === scoutId);
  const motif = document.getElementById("rc_motif").value;
  const montant = Number(document.getElementById("rc_montant").value || 0);
  const date = document.getElementById("rc_date").value;
  const detail = document.getElementById("rc_detail").value.trim();

  const nomJeune = scout ? `${scout.nom} ${scout.prenom}` : "Membre";
  const brancheJeune = scout ? scout.branche : "";
  const recuText = [
    `REÇU DE PAIEMENT — GROUPE SCOUT OBION`,
    `Date : ${date}`,
    `Membre : ${nomJeune} (${brancheJeune})`,
    `Motif : ${motif}${detail ? " — " + detail : ""}`,
    `Montant encaissé : ${formatMoney(montant)}`,
    `Merci pour votre confiance.`
  ].join("\n");

  const cachetHtml = db.settings.cachet_actif
    ? `<div class="cachet-box">GROUPE OBION · TRÉSORERIE VALIDÉE</div>`
    : "";

  document.getElementById("receiptPreviewArea").innerHTML = `
    <div class="receipt-box" id="printableReceiptCard">
      <div class="receipt-header">
        <div>
          <h4 style="color:var(--primary);">REÇU DE PAIEMENT — GROUPE OBION</h4>
          <small>Date : ${escapeHtml(date)}</small>
        </div>
        <span class="badge badge-green">Payé</span>
      </div>
      <p><strong>Membre :</strong> ${escapeHtml(nomJeune)} ${brancheJeune ? `(${escapeHtml(brancheJeune)})` : ""}</p>
      <p><strong>Motif :</strong> ${escapeHtml(motif)} ${detail ? `— ${escapeHtml(detail)}` : ""}</p>
      <p style="margin-top:8px; font-size:1.05rem;"><strong>Montant :</strong> ${formatMoney(montant)}</p>
      ${cachetHtml}
    </div>
    <div class="actions-row" style="margin-top:12px;">
      <button type="button" class="btn btn-sm btn-success" onclick="copyReceiptText(${JSON.stringify(recuText)})">📋 Copier le reçu</button>
      <button type="button" class="btn btn-sm btn-secondary" onclick="printReceiptCard()">🖨️ Imprimer / PDF</button>
    </div>
  `;
}

function copyReceiptText(text) {
  navigator.clipboard?.writeText(text);
  alert("Reçu copié dans le presse-papiers !");
}

function printReceiptCard() {
  const card = document.getElementById("printableReceiptCard");
  if (!card) return;
  const pz = document.getElementById("printZone");
  pz.innerHTML = card.outerHTML;
  window.print();
}

function printPointMensuel() {
  const month = document.getElementById("financeMonthPicker").value || new Date().toISOString().slice(0, 7);
  const rows = db.finances.filter((f) => String(f.date || "").startsWith(month));
  const entrees = rows.filter((f) => f.type === "entree").reduce((a, b) => a + Number(b.montant || 0), 0);
  const sorties = rows.filter((f) => f.type === "sortie").reduce((a, b) => a + Number(b.montant || 0), 0);

  const pz = document.getElementById("printZone");
  pz.innerHTML = `
    <div style="font-family:sans-serif; padding:12px;">
      <h2>POINT FINANCIER MENSUEL (${escapeHtml(month)}) — GROUPE OBION</h2>
      <p style="margin:8px 0;">Entrées : <strong>${formatMoney(entrees)}</strong> · Sorties : <strong>${formatMoney(sorties)}</strong> · Solde du mois : <strong>${formatMoney(entrees - sorties)}</strong></p>
      <table style="width:100%; border-collapse:collapse; margin-top:12px;">
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
    </div>
  `;
  window.print();
}

/* 9. ANNONCES & COMMUNICATION PARENTS */
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

  let baseList = getScopedScouts();
  scSelect.innerHTML = baseList.map((s) => `<option value="${s.id}">${escapeHtml(s.nom)} ${escapeHtml(s.prenom)} (${escapeHtml(s.branche)})</option>`).join("");

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
    const selectedId = scSelect.value;
    filtered = filtered.filter((s) => s.id === selectedId);
  }

  const msg = encodeURIComponent(document.getElementById("annonceTextArea").value || "");
  const tbody = document.getElementById("annonceRecipientsBody");

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--muted);">Aucun destinataire trouvé.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map((s) => {
    const cleanPhone = String(s.parent_tel || "").replace(/[^0-9]/g, "");
    const intlPhone = cleanPhone.startsWith("225") ? cleanPhone : (cleanPhone ? `225${cleanPhone}` : "");
    const waHref = intlPhone ? `https://wa.me/${intlPhone}?text=${msg}` : "";

    return `
      <tr>
        <td><strong>${escapeHtml(s.nom)} ${escapeHtml(s.prenom)}</strong></td>
        <td>${escapeHtml(s.branche)}</td>
        <td>${escapeHtml(s.parent_nom || "Parent")} — ${escapeHtml(s.parent_tel || "Pas de numéro")}</td>
        <td>
          ${waHref
            ? `<a href="${waHref}" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-success">WhatsApp</a>`
            : `<span class="badge badge-gray">Numéro absent</span>`}
        </td>
      </tr>
    `;
  }).join("");
}

function copyAnnonceMessage() {
  const txt = document.getElementById("annonceTextArea").value || "";
  if (!txt.trim()) {
    alert("Le message est vide.");
    return;
  }
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
  const text = await file.text();
  try {
    const parsed = JSON.parse(text);
    db = normalizeDb(parsed);
    await persistDb("Restauration sauvegarde JSON", file.name);
    alert("Sauvegarde restaurée avec succès !");
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

/* MODALE */
function openModal(title, htmlContent) {
  document.getElementById("modalTitle").textContent = title;
  document.getElementById("modalBody").innerHTML = htmlContent;
  document.getElementById("genericModal").classList.add("open");
}

function closeModal() {
  document.getElementById("genericModal").classList.remove("open");
}

/* DÉMARRAGE */
window.addEventListener("DOMContentLoaded", () => {
  startRealtimeSync();
  if (currentUser) {
    showAppShell();
  } else {
    toggleLoginBranch();
  }
});
