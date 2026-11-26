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
const docRefObion = firestoreDb.collection("erp_obion").doc("groupe_principal");

const BACKUP_KEY = "obion_erp_backup_v1";
const SESSION_KEY = "obion_erp_session_v1";

const defaultData = {
  scouts: [],
  chefs: [],
  camps: [],
  presences: [],
  finances: [],
  materiel: [],
  settings: {
    cg_nom: "Chef de Groupe Obion",
    cg_tel: "",
    cot_j: 0,
    cot_c: 0,
    prog: {
      Oisillon: "Découverte, Petit pas, Aile déployée",
      Meute: "Patte tendre, 1re étoile, 2e étoile, 3e étoile",
      Troupe: "Aspirant, 2e classe, 1re classe, Brevet",
      Chemin: "En route, Compagnon de route, Engagement",
      Route: "Novice, Routier engagé, Service communautaire"
    }
  }
};

let db = JSON.parse(localStorage.getItem(BACKUP_KEY) || "null") || structuredClone(defaultData);
let currentUser = null;
let currentPedaScoutId = null;
let currentPresId = null;
let currentCampId = null;
let currentAutoTarget = null;
let currentActiveTab = "effectifs";

function fPrix(n) {
  return Number(n || 0).toLocaleString("fr-FR") + " FCFA";
}

function getWaLink(tel, msg) {
  const digits = String(tel || "").replace(/\D/g, "");
  const fullNumber = digits.startsWith("225") ? digits : (digits ? "225" + digits : "");
  return "https://wa.me/" + fullNumber + "?text=" + encodeURIComponent(msg);
}

function closeM(id) {
  const modal = document.getElementById(id);
  if (modal) modal.style.display = "none";
}

function openM(id) {
  const modal = document.getElementById(id);
  if (modal) modal.style.display = "flex";
}

function normalizeDb() {
  db = Object.assign(structuredClone(defaultData), db || {});
  db.scouts = Array.isArray(db.scouts) ? db.scouts : [];
  db.chefs = Array.isArray(db.chefs) ? db.chefs : [];
  db.camps = Array.isArray(db.camps) ? db.camps : [];
  db.presences = Array.isArray(db.presences) ? db.presences : [];
  db.finances = Array.isArray(db.finances) ? db.finances : [];
  db.materiel = Array.isArray(db.materiel) ? db.materiel : [];
  db.settings = Object.assign(structuredClone(defaultData.settings), db.settings || {});
  db.settings.prog = Object.assign(
    structuredClone(defaultData.settings.prog),
    db.settings.prog || {}
  );
}

async function syncCloud(showAlertError = false) {
  normalizeDb();
  localStorage.setItem(BACKUP_KEY, JSON.stringify(db));
  try {
    await docRefObion.set(db, { merge: true });
  } catch (err) {
    console.warn("Sauvegarde locale conservée, synchro cloud en attente :", err);
    if (showAlertError) {
      alert("Enregistré sur cet appareil. Vérifie la connexion internet pour partager avec les autres chefs.");
    }
  }
}

function getUsersList() {
  const list = [
    {
      id: "cg_default",
      nom: "Chef de Groupe (Admin)",
      titre: "Groupe et ressources adultes",
      fonction: "Chef de Groupe",
      pin: "1234",
      isAdmin: true,
      brancheAutorisee: "Toutes"
    }
  ];

  db.chefs.forEach((chef) => {
    const isAdmin =
      chef.titre === "Coordinateur" ||
      chef.titre === "Groupe et ressources adultes" ||
      chef.fonction === "Chef de Groupe" ||
      chef.fonction === "Membre du Comité";

    const brancheMap = {
      Micou: "Oisillon",
      Akela: "Meute",
      "Chef de Troupe": "Troupe",
      Safouin: "Chemin"
    };

    list.push({
      id: chef.id,
      nom: chef.nom,
      titre: chef.titre,
      fonction: chef.fonction,
      pin: String(chef.pin || "1234"),
      isAdmin: isAdmin,
      brancheAutorisee: isAdmin ? "Toutes" : (brancheMap[chef.titre] || "Toutes")
    });
  });

  return list;
}

function populateLoginSelect() {
  const select = document.getElementById("login_user");
  if (!select) return;
  const users = getUsersList();
  select.innerHTML = users
    .map((u) => `<option value="${u.id}">${u.nom} — ${u.titre}</option>`)
    .join("");
}

function login() {
  const userId = document.getElementById("login_user").value;
  const pin = document.getElementById("login_pin").value.trim();
  const errorEl = document.getElementById("login_error");
  const user = getUsersList().find((u) => u.id === userId);

  if (user && user.pin === pin) {
    currentUser = user;
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(user));
    errorEl.style.display = "none";
    document.getElementById("loginScreen").style.display = "none";
    document.getElementById("appContainer").style.display = "block";
    applyRolePermissions();
    renderAll();
  } else {
    errorEl.style.display = "block";
  }
}

function logout() {
  currentUser = null;
  sessionStorage.removeItem(SESSION_KEY);
  document.getElementById("login_pin").value = "";
  document.getElementById("appContainer").style.display = "none";
  document.getElementById("loginScreen").style.display = "flex";
}

function applyRolePermissions() {
  if (!currentUser) return;
  document.getElementById("current_user_display").textContent =
    `${currentUser.nom} (${currentUser.titre})`;
  document.getElementById("p_resp").value = currentUser.nom;

  document.querySelectorAll(".admin-only").forEach((el) => {
    if (currentUser.isAdmin) {
      el.classList.remove("hidden");
    } else {
      el.classList.add("hidden");
    }
  });

  if (!currentUser.isAdmin) {
    ["filterScout", "filterPeda", "camp_branche", "p_branche"].forEach((id) => {
      const sel = document.getElementById(id);
      if (sel && currentUser.brancheAutorisee !== "Toutes") {
        sel.value = currentUser.brancheAutorisee;
      }
    });
  }
}

function nav(sectionName) {
  if (!currentUser) return;
  const adminTabs = ["maitrise", "finances", "parametres"];
  if (adminTabs.includes(sectionName) && !currentUser.isAdmin) {
    alert("Accès réservé à la direction du groupe.");
    return;
  }

  currentActiveTab = sectionName;
  document.querySelectorAll(".section").forEach((sec) => sec.classList.add("hidden"));
  const targetSec = document.getElementById("sec-" + sectionName);
  if (targetSec) targetSec.classList.remove("hidden");

  document.querySelectorAll(".tab-btn").forEach((btn) => btn.classList.remove("active"));
  const activeBtn = document.getElementById("tab_" + sectionName);
  if (activeBtn) activeBtn.classList.add("active");

  renderAll();
}

function autoBranch() {
  const ddnVal = document.getElementById("s_ddn").value;
  const hint = document.getElementById("s_age_hint");
  const branchInput = document.getElementById("s_branche");
  if (!ddnVal) {
    hint.textContent = "";
    branchInput.value = "";
    return;
  }

  const birth = new Date(ddnVal);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;

  let branche = "Oisillon";
  if (age < 7) branche = "Oisillon";
  else if (age <= 11) branche = "Meute";
  else if (age <= 15) branche = "Troupe";
  else if (age <= 18) branche = "Chemin";
  else branche = "Route";

  hint.textContent = `Âge : ${age} ans`;
  branchInput.value = branche;
}

function resetScoutForm() {
  document.getElementById("s_id").value = "";
  document.getElementById("formTitleScout").textContent = "➕ Inscrire un jeune";
  ["s_mat", "s_nom", "s_ddn", "s_branche", "s_sousunite", "s_role", "s_tel", "s_tel_perso", "s_parrain", "s_medical", "s_urgence"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  document.getElementById("s_sang").value = "Inconnu";
  document.getElementById("s_age_hint").textContent = "";
}

async function saveScout() {
  const id = document.getElementById("s_id").value;
  const mat = document.getElementById("s_mat").value.trim();
  const nom = document.getElementById("s_nom").value.trim();
  const ddn = document.getElementById("s_ddn").value;
  const branche = document.getElementById("s_branche").value.trim() || "Oisillon";
  const tel = document.getElementById("s_tel").value.trim();

  if (!mat || !nom || !ddn || !tel) {
    alert("Merci de renseigner au moins le matricule, le nom complet, la date de naissance et le contact parent.");
    return;
  }

  const existing = id ? db.scouts.find((s) => s.id === id) : null;
  const record = {
    id: id || "sc_" + Date.now(),
    mat,
    nom,
    ddn,
    branche,
    sousunite: document.getElementById("s_sousunite").value.trim(),
    role: document.getElementById("s_role").value.trim(),
    tel,
    tel_perso: document.getElementById("s_tel_perso").value.trim(),
    parrain: document.getElementById("s_parrain").value.trim(),
    sang: document.getElementById("s_sang").value,
    medical: document.getElementById("s_medical").value.trim(),
    urgence: document.getElementById("s_urgence").value.trim(),
    cotisation: existing ? Boolean(existing.cotisation) : false,
    totem: existing ? (existing.totem || "") : "",
    etapesValidees: existing ? (existing.etapesValidees || []) : [],
    obs: existing ? (existing.obs || "") : ""
  };

  if (existing) {
    db.scouts = db.scouts.map((s) => (s.id === id ? record : s));
  } else {
    db.scouts.push(record);
  }

  resetScoutForm();
  await syncCloud(true);
  renderAll();
}

function editScout(id) {
  const s = db.scouts.find((item) => item.id === id);
  if (!s) return;
  document.getElementById("s_id").value = s.id;
  document.getElementById("formTitleScout").textContent = "✏️ Modifier le dossier de " + s.nom;
  document.getElementById("s_mat").value = s.mat || "";
  document.getElementById("s_nom").value = s.nom || "";
  document.getElementById("s_ddn").value = s.ddn || "";
  document.getElementById("s_branche").value = s.branche || "";
  document.getElementById("s_sousunite").value = s.sousunite || "";
  document.getElementById("s_role").value = s.role || "";
  document.getElementById("s_tel").value = s.tel || "";
  document.getElementById("s_tel_perso").value = s.tel_perso || "";
  document.getElementById("s_parrain").value = s.parrain || "";
  document.getElementById("s_sang").value = s.sang || "Inconnu";
  document.getElementById("s_medical").value = s.medical || "";
  document.getElementById("s_urgence").value = s.urgence || "";
  autoBranch();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function deleteScout(id) {
  const s = db.scouts.find((item) => item.id === id);
  if (!s) return;
  if (!confirm("Supprimer le dossier de " + s.nom + " ?")) return;
  db.scouts = db.scouts.filter((item) => item.id !== id);
  await syncCloud(true);
  renderAll();
}

function downloadCsvTemplate() {
  const csv = "Matricule;Nom;DateNaissance;Branche;SousUnite;Role;ContactParent;ContactJeune;Parrain;Sang;Medical;Urgence\nOB-001;Kouassi Jean;2014-05-12;Troupe;Aigle;Chef de Patrouille;0700000000;;Koffi Paul;O+;Aucune;0500000000";
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "modele_effectifs_obion.csv";
  link.click();
}

async function importScoutsCSV(event) {
  const file = event.target.files[0];
  if (!file) return;
  const text = await file.text();
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length <= 1) return;

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(/[;,]/).map((c) => c.trim());
    if (!cols[1]) continue;
    db.scouts.push({
      id: "sc_" + Date.now() + "_" + i,
      mat: cols[0] || "MAT-" + i,
      nom: cols[1],
      ddn: cols[2] || "2015-01-01",
      branche: cols[3] || "Meute",
      sousunite: cols[4] || "",
      role: cols[5] || "",
      tel: cols[6] || "",
      tel_perso: cols[7] || "",
      parrain: cols[8] || "",
      sang: cols[9] || "Inconnu",
      medical: cols[10] || "",
      urgence: cols[11] || "",
      cotisation: false,
      totem: "",
      etapesValidees: [],
      obs: ""
    });
  }
  event.target.value = "";
  await syncCloud(true);
  renderAll();
}

function getEtapesBranche(branche) {
  const raw = (db.settings.prog && db.settings.prog[branche]) || "";
  const list = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return list.length > 0 ? list : ["Étape 1", "Étape 2", "Étape 3"];
}

function openPedaModal(id) {
  const s = db.scouts.find((item) => item.id === id);
  if (!s) return;
  currentPedaScoutId = id;
  document.getElementById("mp_nom").textContent = s.nom;
  document.getElementById("mp_info").textContent = `${s.branche} • Matricule : ${s.mat} • ${s.sousunite || "Unité"}`;
  document.getElementById("mp_totem").value = s.totem || "";
  document.getElementById("mp_obs").value = s.obs || "";

  const etapes = getEtapesBranche(s.branche);
  const valid = Array.isArray(s.etapesValidees) ? s.etapesValidees : [];
  document.getElementById("mp_etapes").innerHTML = etapes
    .map((etape, idx) => `
      <label style="display:flex; align-items:center; gap:8px; font-weight:500;">
        <input type="checkbox" class="peda-step-chk" value="${idx}" ${valid.includes(idx) ? "checked" : ""}>
        ${etape}
      </label>
    `)
    .join("");

  openM("modalPeda");
}

async function savePeda() {
  if (!currentPedaScoutId) return;
  const checkedIndices = Array.from(document.querySelectorAll(".peda-step-chk:checked")).map((el) =>
    Number(el.value)
  );
  db.scouts = db.scouts.map((s) => {
    if (s.id !== currentPedaScoutId) return s;
    return {
      ...s,
      totem: document.getElementById("mp_totem").value.trim(),
      obs: document.getElementById("mp_obs").value.trim(),
      etapesValidees: checkedIndices
    };
  });
  closeM("modalPeda");
  await syncCloud(true);
  renderAll();
}

function generateCommandes() {
  const rows = db.scouts.map((s) => {
    const etapes = getEtapesBranche(s.branche);
    const valid = Array.isArray(s.etapesValidees) ? s.etapesValidees : [];
    const nextIdx = etapes.findIndex((_, i) => !valid.includes(i));
    const nextStep = nextIdx === -1 ? "Progression complète" : etapes[nextIdx];
    return `<tr><td>${s.mat}</td><td>${s.nom}</td><td>${s.branche}</td><td>${nextStep}</td></tr>`;
  });

  document.getElementById("printArea").innerHTML = `
    <h2>Commande d'Insignes — Groupe OBION</h2>
    <p>St Bernard d'Adiopodoumé KM17</p>
    <table>
      <thead><tr><th>Matricule</th><th>Nom</th><th>Branche</th><th>Prochain insigne / étape</th></tr></thead>
      <tbody>${rows.join("") || "<tr><td colspan='4'>Aucun jeune enregistré.</td></tr>"}</tbody>
    </table>
  `;
  window.print();
}

function openAutoConfig(targetType, targetId) {
  currentAutoTarget = { targetType, targetId };
  let label = "Groupe Obion";
  if (targetType === "scout") {
    const s = db.scouts.find((x) => x.id === targetId);
    if (s) label = `${s.nom} (${s.branche})`;
  } else if (targetType === "camp") {
    const c = db.camps.find((x) => x.id === targetId);
    if (c) {
      label = c.titre;
      document.getElementById("ma_custom_text").value =
        `à participer au camp « ${c.titre} » à ${c.lieu} du ${c.debut} au ${c.fin}.`;
    }
  }
  document.getElementById("ma_target_name").textContent = label;
  openM("modalAutoConfig");
}

function printAutoRun() {
  const customText = document.getElementById("ma_custom_text").value.trim();
  const cgNom = db.settings.cg_nom || "Le Chef de Groupe";
  const cgTel = db.settings.cg_tel || "";
  document.getElementById("printArea").innerHTML = `
    <h2>Autorisation Parentale — Groupe OBION</h2>
    <p><strong>Lieu :</strong> Saint Bernard d'Adiopodoumé KM17</p>
    <p style="margin:20px 0; line-height:1.6;">
      Je soussigné(e), parent / tuteur légal, autorise le jeune concerné <strong>${customText}</strong>
    </p>
    <p><strong>Responsable du groupe :</strong> ${cgNom} ${cgTel ? "• Tél : " + cgTel : ""}</p>
    <p style="margin-top:30px;">Signature du parent : ___________________________</p>
  `;
  closeM("modalAutoConfig");
  window.print();
}

async function saveCamp() {
  const titre = document.getElementById("camp_titre").value.trim();
  const lieu = document.getElementById("camp_lieu").value.trim();
  const debut = document.getElementById("camp_debut").value;
  const fin = document.getElementById("camp_fin").value;
  const branche = currentUser.isAdmin
    ? document.getElementById("camp_branche").value
    : currentUser.brancheAutorisee;
  const frais = Number(document.getElementById("camp_frais").value || 0);

  if (!titre || !lieu || !debut || !fin) {
    alert("Merci de remplir le titre, le lieu et les dates du camp.");
    return;
  }

  db.camps.push({
    id: "camp_" + Date.now(),
    titre,
    lieu,
    debut,
    fin,
    branche,
    frais,
    participants: []
  });

  document.getElementById("camp_titre").value = "";
  document.getElementById("camp_lieu").value = "";
  document.getElementById("camp_debut").value = "";
  document.getElementById("camp_fin").value = "";
  document.getElementById("camp_frais").value = "0";

  await syncCloud(true);
  renderAll();
}

function openCampPart(campId) {
  const camp = db.camps.find((c) => c.id === campId);
  if (!camp) return;
  currentCampId = campId;
  const eligibleScouts = db.scouts.filter(
    (s) => camp.branche === "Toutes" || s.branche === camp.branche
  );
  const currentPart = Array.isArray(camp.participants) ? camp.participants : [];

  document.getElementById("campPartList").innerHTML = eligibleScouts.length === 0
    ? "<p>Aucun jeune dans cette branche.</p>"
    : eligibleScouts
        .map((s) => {
          const found = currentPart.find((p) => p.scoutId === s.id);
          const checked = Boolean(found);
          const paye = found ? Number(found.paye || 0) : 0;
          return `
            <div style="border:1px solid #eee; padding:8px; border-radius:6px; display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap;">
              <label style="display:flex; align-items:center; gap:8px;">
                <input type="checkbox" class="camp-part-chk" data-scout-id="${s.id}" ${checked ? "checked" : ""}>
                <span><strong>${s.nom}</strong> <small>(${s.branche})</small></span>
              </label>
              <div>
                <small>Payé (FCFA) :</small>
                <input type="number" min="0" class="camp-part-paye" data-scout-id="${s.id}" value="${paye}" style="width:110px;">
              </div>
            </div>
          `;
        })
        .join("");

  openM("modalCampPart");
}

async function saveCampPart() {
  if (!currentCampId) return;
  const checkedIds = Array.from(document.querySelectorAll(".camp-part-chk:checked")).map(
    (el) => el.dataset.scoutId
  );
  const participants = checkedIds.map((scoutId) => {
    const payeInput = document.querySelector(`.camp-part-paye[data-scout-id="${scoutId}"]`);
    return {
      scoutId,
      paye: Number(payeInput ? payeInput.value : 0)
    };
  });

  db.camps = db.camps.map((c) => (c.id === currentCampId ? { ...c, participants } : c));
  closeM("modalCampPart");
  await syncCloud(true);
  renderAll();
}

async function deleteCamp(campId) {
  if (!confirm("Supprimer ce camp / week-end ?")) return;
  db.camps = db.camps.filter((c) => c.id !== campId);
  await syncCloud(true);
  renderAll();
}

function genAppel() {
  const branche = currentUser && !currentUser.isAdmin
    ? currentUser.brancheAutorisee
    : document.getElementById("p_branche").value;
  const box = document.getElementById("appelBox");
  if (!branche) {
    box.style.display = "none";
    return;
  }

  const list = db.scouts.filter((s) => branche === "Toutes" || s.branche === branche);
  box.style.display = "block";
  box.innerHTML = list.length === 0
    ? "<p>Aucun jeune trouvé pour cette branche.</p>"
    : list
        .map((s) => `
          <label style="display:flex; justify-content:space-between; align-items:center; padding:6px 0; border-bottom:1px solid #f0f0f0;">
            <span><strong>${s.nom}</strong> <small>(${s.branche})</small></span>
            <span>
              <input type="checkbox" class="appel-chk" data-nom="${s.nom}" checked> Présent
            </span>
          </label>
        `)
        .join("");
}

async function savePresence() {
  const date = document.getElementById("p_date").value;
  const titre = document.getElementById("p_titre").value.trim();
  const branche = currentUser.isAdmin
    ? document.getElementById("p_branche").value
    : currentUser.brancheAutorisee;
  const resp = document.getElementById("p_resp").value || currentUser.nom;

  if (!date || !titre || !branche) {
    alert("Merci d'indiquer la date, le titre et la branche.");
    return;
  }

  const checks = Array.from(document.querySelectorAll(".appel-chk"));
  if (checks.length === 0) {
    alert("Clique d'abord sur 'Lister les scouts pour l'appel'.");
    return;
  }

  const presentsList = checks.filter((c) => c.checked).map((c) => c.dataset.nom);
  const absentsList = checks.filter((c) => !c.checked).map((c) => c.dataset.nom);

  db.presences.push({
    id: "pr_" + Date.now(),
    date,
    titre,
    branche,
    resp,
    presents: presentsList.length,
    total: checks.length,
    presentsList,
    absentsList
  });

  document.getElementById("p_titre").value = "";
  document.getElementById("appelBox").style.display = "none";

  await syncCloud(true);
  renderAll();
}

function openPresDetails(id) {
  const p = db.presences.find((item) => item.id === id);
  if (!p) return;
  currentPresId = id;
  document.getElementById("mpres_titre").textContent = `${p.titre} (${p.branche})`;
  document.getElementById("mpres_date").textContent = "Date : " + new Date(p.date).toLocaleDateString("fr-FR");
  document.getElementById("mpres_resp").textContent = "Responsable : " + p.resp;

  const pList = p.presentsList || [];
  const aList = p.absentsList || [];
  document.getElementById("count_p").textContent = pList.length;
  document.getElementById("count_a").textContent = aList.length;
  document.getElementById("list_p").innerHTML = pList.map((n) => `<li>• ${n}</li>`).join("") || "<li>Aucun</li>";
  document.getElementById("list_a").innerHTML = aList.map((n) => `<li>• ${n}</li>`).join("") || "<li>Aucun</li>";

  openM("modalPresDetails");
}

function copyWhatsApp() {
  const p = db.presences.find((item) => item.id === currentPresId);
  if (!p) return;
  const text = `📋 *Appel - Groupe OBION*\nActivité : ${p.titre} (${p.branche})\nDate : ${p.date}\n✅ Présents : ${p.presents}/${p.total}\n❌ Absents : ${(p.absentsList || []).join(", ") || "Aucun"}`;
  navigator.clipboard?.writeText(text);
  alert("Rapport copié pour WhatsApp !");
}

function printPresence() {
  const p = db.presences.find((item) => item.id === currentPresId);
  if (!p) return;
  document.getElementById("printArea").innerHTML = `
    <h2>Fiche d'Appel — Groupe OBION</h2>
    <p><strong>Activité :</strong> ${p.titre} | <strong>Branche :</strong> ${p.branche} | <strong>Date :</strong> ${p.date}</p>
    <p><strong>Responsable :</strong> ${p.resp} | <strong>Présents :</strong> ${p.presents} / ${p.total}</p>
    <p><strong>Absents :</strong> ${(p.absentsList || []).join(", ") || "Aucun"}</p>
  `;
  window.print();
}

async function delPres(id) {
  if (!confirm("Supprimer cet appel ?")) return;
  db.presences = db.presences.filter((p) => p.id !== id);
  await syncCloud(true);
  renderAll();
}

async function saveMateriel() {
  const nom = document.getElementById("m_nom").value.trim();
  const cat = document.getElementById("m_cat").value;
  const qte = Number(document.getElementById("m_qte").value || 1);
  const etat = document.getElementById("m_etat").value;
  const resp = document.getElementById("m_resp").value.trim();

  if (!nom || !resp) {
    alert("Merci de renseigner le nom de l'article et le lieu / responsable.");
    return;
  }

  db.materiel.push({
    id: "mat_" + Date.now(),
    nom,
    cat,
    qte,
    etat,
    resp
  });

  document.getElementById("m_nom").value = "";
  document.getElementById("m_qte").value = "1";
  document.getElementById("m_resp").value = "";

  await syncCloud(true);
  renderAll();
}

async function delMat(id) {
  if (!confirm("Retirer cet article de l'inventaire ?")) return;
  db.materiel = db.materiel.filter((m) => m.id !== id);
  await syncCloud(true);
  renderAll();
}

function resetChefForm() {
  document.getElementById("c_id").value = "";
  ["c_nom", "c_tel", "c_pin"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
}

async function saveChef() {
  const id = document.getElementById("c_id").value;
  const nom = document.getElementById("c_nom").value.trim();
  const titre = document.getElementById("c_titre").value;
  const fonction = document.getElementById("c_fonction").value;
  const tel = document.getElementById("c_tel").value.trim();
  const pin = document.getElementById("c_pin").value.trim();

  if (!nom || !tel || pin.length !== 4) {
    alert("Merci de saisir le nom, le téléphone et un code PIN à 4 chiffres.");
    return;
  }

  const existing = id ? db.chefs.find((c) => c.id === id) : null;
  const chefData = {
    id: id || "ch_" + Date.now(),
    nom,
    titre,
    fonction,
    tel,
    pin,
    cotisation: existing ? Boolean(existing.cotisation) : false
  };

  if (existing) {
    db.chefs = db.chefs.map((c) => (c.id === id ? chefData : c));
  } else {
    db.chefs.push(chefData);
  }

  resetChefForm();
  populateLoginSelect();
  await syncCloud(true);
  renderAll();
}

function editChef(id) {
  const c = db.chefs.find((item) => item.id === id);
  if (!c) return;
  document.getElementById("c_id").value = c.id;
  document.getElementById("c_nom").value = c.nom || "";
  document.getElementById("c_titre").value = c.titre || "Micou";
  document.getElementById("c_fonction").value = c.fonction || "Chef d'Unité (CU)";
  document.getElementById("c_tel").value = c.tel || "";
  document.getElementById("c_pin").value = c.pin || "";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function deleteChef(id) {
  if (!confirm("Retirer ce responsable de la maîtrise ?")) return;
  db.chefs = db.chefs.filter((c) => c.id !== id);
  populateLoginSelect();
  await syncCloud(true);
  renderAll();
}

function checkCotisation() {
  const cat = document.getElementById("f_cat").value;
  const linkBox = document.getElementById("f_scout_link");
  const select = document.getElementById("f_scout_select");
  if (cat === "Cotisation Annuelle") {
    linkBox.style.display = "block";
    const options = ['<option value="">Sélectionner le membre qui vient de payer...</option>'];
    db.scouts.forEach((s) => {
      options.push(`<option value="scout:${s.id}">Jeune : ${s.nom} (${s.branche})</option>`);
    });
    db.chefs.forEach((c) => {
      options.push(`<option value="chef:${c.id}">Chef : ${c.nom} (${c.titre})</option>`);
    });
    select.innerHTML = options.join("");
  } else {
    linkBox.style.display = "none";
  }
}

async function saveFinance() {
  const type = document.getElementById("f_type").value;
  const cat = document.getElementById("f_cat").value;
  const montant = Number(document.getElementById("f_montant").value || 0);
  const date = document.getElementById("f_date").value || new Date().toISOString().slice(0, 10);
  const motif = document.getElementById("f_motif").value.trim();
  const linked = document.getElementById("f_scout_select").value;

  if (!montant || montant <= 0 || !motif) {
    alert("Merci d'indiquer un montant supérieur à 0 et un motif.");
    return;
  }

  db.finances.push({
    id: "fin_" + Date.now(),
    type,
    cat,
    montant,
    date,
    motif
  });

  if (type === "in" && cat === "Cotisation Annuelle" && linked) {
    const [kind, targetId] = linked.split(":");
    if (kind === "scout") {
      db.scouts = db.scouts.map((s) => (s.id === targetId ? { ...s, cotisation: true } : s));
    } else if (kind === "chef") {
      db.chefs = db.chefs.map((c) => (c.id === targetId ? { ...c, cotisation: true } : c));
    }
  }

  document.getElementById("f_montant").value = "";
  document.getElementById("f_motif").value = "";

  await syncCloud(true);
  renderAll();
}

async function delFin(id) {
  if (!confirm("Supprimer cette opération financière ?")) return;
  db.finances = db.finances.filter((f) => f.id !== id);
  await syncCloud(true);
  renderAll();
}

function printCaisse() {
  const rows = [...db.finances]
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .map((f) => {
      const sign = f.type === "in" ? "+" : "-";
      return `<tr><td>${f.date}</td><td>${f.type.toUpperCase()}</td><td>${f.cat}</td><td>${f.motif}</td><td>${sign} ${fPrix(f.montant)}</td></tr>`;
    });

  document.getElementById("printArea").innerHTML = `
    <h2>Livre de Caisse — Groupe OBION</h2>
    <p>Entrées : ${document.getElementById("f_tot_in").textContent} | Sorties : ${document.getElementById("f_tot_out").textContent} | Solde : ${document.getElementById("f_solde").textContent}</p>
    <table>
      <thead><tr><th>Date</th><th>Type</th><th>Catégorie</th><th>Motif</th><th>Montant</th></tr></thead>
      <tbody>${rows.join("") || "<tr><td colspan='5'>Aucune opération.</td></tr>"}</tbody>
    </table>
  `;
  window.print();
}

async function saveSettings() {
  db.settings.cg_nom = document.getElementById("cfg_cg_nom").value.trim() || "Chef de Groupe Obion";
  db.settings.cg_tel = document.getElementById("cfg_cg_tel").value.trim();
  db.settings.cot_j = Number(document.getElementById("cfg_cot_j").value || 0);
  db.settings.cot_c = Number(document.getElementById("cfg_cot_c").value || 0);
  await syncCloud(true);
  renderAll();
  alert("Paramètres du groupe enregistrés.");
}

async function saveProgSettings() {
  db.settings.prog = {
    Oisillon: document.getElementById("cfg_prog_oisillon").value.trim(),
    Meute: document.getElementById("cfg_prog_meute").value.trim(),
    Troupe: document.getElementById("cfg_prog_troupe").value.trim(),
    Chemin: document.getElementById("cfg_prog_chemin").value.trim(),
    Route: document.getElementById("cfg_prog_route").value.trim()
  };
  await syncCloud(true);
  renderAll();
  alert("Progressions ASCCI mises à jour.");
}

async function cloturerAnnee() {
  if (!confirm("Remettre toutes les cotisations annuelles (jeunes et chefs) à Impayé pour la nouvelle année ?")) return;
  db.scouts = db.scouts.map((s) => ({ ...s, cotisation: false }));
  db.chefs = db.chefs.map((c) => ({ ...c, cotisation: false }));
  await syncCloud(true);
  renderAll();
  alert("Nouvelle année préparée : cotisations remises à Impayé.");
}

function renderSettingsInputs() {
  if (!currentUser || !currentUser.isAdmin) return;
  document.getElementById("cfg_cg_nom").value = db.settings.cg_nom || "";
  document.getElementById("cfg_cg_tel").value = db.settings.cg_tel || "";
  document.getElementById("cfg_cot_j").value = db.settings.cot_j || 0;
  document.getElementById("cfg_cot_c").value = db.settings.cot_c || 0;
  document.getElementById("cfg_prog_oisillon").value = db.settings.prog.Oisillon || "";
  document.getElementById("cfg_prog_meute").value = db.settings.prog.Meute || "";
  document.getElementById("cfg_prog_troupe").value = db.settings.prog.Troupe || "";
  document.getElementById("cfg_prog_chemin").value = db.settings.prog.Chemin || "";
  document.getElementById("cfg_prog_route").value = db.settings.prog.Route || "";
}

function renderScouts() {
  const listEl = document.getElementById("scoutList");
  if (!listEl || !currentUser) return;
  const q = (document.getElementById("searchScout")?.value || "").toLowerCase().trim();
  const filterBranche = currentUser.isAdmin
    ? (document.getElementById("filterScout")?.value || "Tous")
    : currentUser.brancheAutorisee;

  const filtered = db.scouts.filter((s) => {
    const matchBranch = filterBranche === "Tous" || s.branche === filterBranche;
    const matchName = !q || String(s.nom || "").toLowerCase().includes(q);
    return matchBranch && matchName;
  });

  if (filtered.length === 0) {
    listEl.innerHTML = "<div class='card'><p>Aucun dossier jeune trouvé.</p></div>";
    return;
  }

  const branchClassMap = {
    Oisillon: "b-Oisillon",
    Meute: "b-Meute",
    Troupe: "b-Troupe",
    Chemin: "b-Chemin",
    Route: "b-Route"
  };

  listEl.innerHTML = filtered
    .map((s) => {
      const waBtn = !s.cotisation && s.tel
        ? `<a href="${getWaLink(s.tel, `Bonjour parent de ${s.nom}, rappel de cotisation annuelle (${fPrix(db.settings.cot_j)}) pour le Groupe Obion.`)}" target="_blank" class="wa-btn">📱 Relancer</a>`
        : "";
      const cotiStatus = s.cotisation
        ? `<span class="status-dot status-green"></span> Cotisation : À jour`
        : `<span class="status-dot status-red"></span> Cotisation : Impayé ${waBtn}`;

      return `
        <div class="item-card ${branchClassMap[s.branche] || ""}">
          <span class="b-badge">${s.branche}</span>
          <h3>${s.nom}</h3>
          <p><strong>Matricule :</strong> ${s.mat} | <strong>Unité :</strong> ${s.sousunite || "Non précisée"}</p>
          <p><strong>Parent :</strong> ${s.tel || "-"} | <strong>Sang :</strong> ${s.sang || "Inconnu"}</p>
          <p style="margin-top:6px;">${cotiStatus}</p>
          <div class="item-actions no-print">
            <button class="btn btn-edit" onclick="editScout('${s.id}')">✏️ Modifier</button>
            <button class="btn btn-secondary" onclick="openAutoConfig('scout', '${s.id}')">📄 Autorisation</button>
            <button class="btn btn-danger" onclick="deleteScout('${s.id}')">❌ Supprimer</button>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderPedagogie() {
  const tbody = document.getElementById("pedaList");
  if (!tbody || !currentUser) return;
  const filterBranche = currentUser.isAdmin
    ? (document.getElementById("filterPeda")?.value || "Toutes")
    : currentUser.brancheAutorisee;

  const filtered = db.scouts.filter(
    (s) => filterBranche === "Toutes" || filterBranche === "Vue Globale" || s.branche === filterBranche
  );

  if (filtered.length === 0) {
    tbody.innerHTML = "<tr><td colspan='6'>Aucun jeune à afficher.</td></tr>";
    return;
  }

  tbody.innerHTML = filtered
    .map((s) => {
      const etapes = getEtapesBranche(s.branche);
      const valid = Array.isArray(s.etapesValidees) ? s.etapesValidees : [];
      const pct = Math.round((valid.length / Math.max(1, etapes.length)) * 100);
      const nextIdx = etapes.findIndex((_, i) => !valid.includes(i));
      const objectif = nextIdx === -1 ? "Validé" : etapes[nextIdx];

      return `
        <tr>
          <td>${s.mat}</td>
          <td><strong>${s.nom}</strong><br><small>${s.branche}</small></td>
          <td>${s.totem || "-"}</td>
          <td style="min-width:150px;">
            <small>${pct}% (${valid.length}/${etapes.length})</small>
            <div class="progress-bg"><div class="progress-bar" style="width:${pct}%;"></div></div>
          </td>
          <td>${objectif}</td>
          <td><button class="btn btn-success" onclick="openPedaModal('${s.id}')">🎓 Suivre</button></td>
        </tr>
      `;
    })
    .join("");
}

function renderCamps() {
  const listEl = document.getElementById("campList");
  if (!listEl || !currentUser) return;
  const visibleCamps = db.camps.filter(
    (c) => currentUser.isAdmin || c.branche === "Toutes" || c.branche === currentUser.brancheAutorisee
  );

  if (visibleCamps.length === 0) {
    listEl.innerHTML = "<div class='card'><p>Aucun camp ou week-end planifié.</p></div>";
    return;
  }

  listEl.innerHTML = visibleCamps
    .map((c) => {
      const partList = Array.isArray(c.participants) ? c.participants : [];
      const totalPaye = partList.reduce((acc, p) => acc + Number(p.paye || 0), 0);
      return `
        <div class="item-card" style="border-left-color:#d35400;">
          <span class="b-badge" style="background:#d35400;">${c.branche}</span>
          <h3>${c.titre}</h3>
          <p><strong>Lieu :</strong> ${c.lieu}</p>
          <p><strong>Dates :</strong> ${c.debut} au ${c.fin}</p>
          <p><strong>Frais :</strong> ${fPrix(c.frais)} | <strong>Inscrits :</strong> ${partList.length}</p>
          <p><strong>Encaissé :</strong> ${fPrix(totalPaye)}</p>
          <div class="item-actions no-print">
            <button class="btn btn-success" onclick="openCampPart('${c.id}')">👥 Inscrits & Paiements</button>
            <button class="btn btn-secondary" onclick="openAutoConfig('camp', '${c.id}')">📄 Autorisation</button>
            <button class="btn btn-danger" onclick="deleteCamp('${c.id}')">❌ Supprimer</button>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderChefs() {
  if (!currentUser || !currentUser.isAdmin) return;
  const cList = document.getElementById("chefList");
  if (!cList) return;

  if (db.chefs.length === 0) {
    cList.innerHTML = "<div class='card'><p>Aucun chef enregistré dans la maîtrise.</p></div>";
    return;
  }

  cList.innerHTML = db.chefs
    .map((c) => {
      let waBtn = "";
      if (!c.cotisation && c.tel) {
        const msg = `Bonjour ${c.nom}, rappel de la maîtrise du Groupe Obion : ta cotisation annuelle (${fPrix(db.settings.cot_c)}) est en attente.`;
        waBtn = `<a href="${getWaLink(c.tel, msg)}" target="_blank" class="wa-btn">📱 Relancer</a>`;
      }
      const cotiC = c.cotisation
        ? `<span class="status-dot status-green"></span> Cotisation : À jour`
        : `<span class="status-dot status-red"></span> Cotisation : Impayé ${waBtn}`;

      return `
        <div class="item-card b-CG">
          <span class="b-badge" style="background:var(--c-cg);">${c.fonction}</span>
          <h3>${c.nom}</h3>
          <p><strong>Titre :</strong> ${c.titre}</p>
          <p><strong>Téléphone :</strong> <a href="tel:${c.tel}">${c.tel}</a></p>
          <p style="margin-top:8px;">${cotiC}</p>
          <p style="color:#e74c3c; margin-top:4px;"><strong>PIN :</strong> ${c.pin}</p>
          <div class="item-actions no-print">
            <button class="btn btn-edit" onclick="editChef('${c.id}')">✏️ Éditer</button>
            <button class="btn btn-danger" onclick="deleteChef('${c.id}')">❌ Retirer</button>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderPresences() {
  const prList = document.getElementById("presenceList");
  if (!prList || !currentUser) return;
  const items = [...db.presences]
    .reverse()
    .filter((p) => currentUser.isAdmin || p.branche === "Toutes" || p.branche === currentUser.brancheAutorisee);

  if (items.length === 0) {
    prList.innerHTML = "<div class='card'><p>Aucun appel enregistré.</p></div>";
    return;
  }

  prList.innerHTML = items
    .map(
      (p) => `
        <div class="item-card" style="border-left-color:#3498db;">
          <span class="b-badge" style="background:#3498db;">${p.branche}</span>
          <h3 style="color:#3498db;">${p.titre}</h3>
          <p>📅 ${new Date(p.date).toLocaleDateString("fr-FR")} | 👨‍✈️ ${p.resp}</p>
          <p>✅ Présents : ${p.presents} / ${p.total}</p>
          <div class="item-actions no-print">
            <button class="btn btn-secondary" onclick="openPresDetails('${p.id}')">📄 Détails & Rapports</button>
            <button class="btn btn-danger" onclick="delPres('${p.id}')">❌</button>
          </div>
        </div>
      `
    )
    .join("");
}

function renderFinances() {
  if (!currentUser || !currentUser.isAdmin) return;
  const fList = document.getElementById("financeList");
  if (!fList) return;

  let tIn = 0;
  let tOut = 0;
  const sorted = [...db.finances].sort((a, b) => new Date(b.date) - new Date(a.date));

  fList.innerHTML = sorted
    .map((f) => {
      const amt = Number(f.montant || 0);
      if (f.type === "in") tIn += amt;
      else tOut += amt;
      const cColor = f.type === "in" ? "td-entree" : "td-sortie";
      const sign = f.type === "in" ? "+" : "-";
      return `
        <tr>
          <td>${new Date(f.date).toLocaleDateString("fr-FR")}</td>
          <td class="${cColor}">${f.type === "in" ? "Entrée" : "Sortie"}</td>
          <td>${f.cat}</td>
          <td>${f.motif}</td>
          <td class="${cColor}">${sign} ${fPrix(amt)}</td>
          <td class="no-print"><button class="btn btn-danger" style="padding:4px 8px;" onclick="delFin('${f.id}')">❌</button></td>
        </tr>
      `;
    })
    .join("");

  document.getElementById("f_tot_in").textContent = fPrix(tIn);
  document.getElementById("f_tot_out").textContent = fPrix(tOut);
  document.getElementById("f_solde").textContent = fPrix(tIn - tOut);
}

function renderMateriel() {
  const mList = document.getElementById("materielList");
  if (!mList) return;
  if (db.materiel.length === 0) {
    mList.innerHTML = "<div class='card'><p>Aucun matériel enregistré.</p></div>";
    return;
  }
  mList.innerHTML = db.materiel
    .map(
      (m) => `
        <div class="item-card" style="border-left-color:#8e44ad;">
          <span class="b-badge" style="background:#8e44ad;">${m.cat}</span>
          <h3 style="color:#8e44ad;">${m.nom}</h3>
          <p>📦 Qté : ${m.qte} | 🛠️ État : ${m.etat}</p>
          <p>👤 Lieu / Resp : ${m.resp}</p>
          <div class="item-actions no-print">
            <button class="btn btn-danger" onclick="delMat('${m.id}')">❌ Retirer</button>
          </div>
        </div>
      `
    )
    .join("");
}

function renderParrains() {
  const paList = document.getElementById("parrainList");
  if (!paList || !currentUser) return;
  const mapP = {};
  db.scouts.forEach((s) => {
    if (s.parrain && (currentUser.isAdmin || s.branche === currentUser.brancheAutorisee)) {
      if (!mapP[s.parrain]) mapP[s.parrain] = [];
      mapP[s.parrain].push(s);
    }
  });

  const keys = Object.keys(mapP).sort();
  if (keys.length === 0) {
    paList.innerHTML = "<div class='card'><p>Aucun parrain ou marraine renseigné.</p></div>";
    return;
  }

  paList.innerHTML = keys
    .map((p) => {
      const lis = mapP[p].map((s) => `<li>${s.nom} <small>(${s.branche})</small></li>`).join("");
      return `
        <div class="item-card" style="border-left-color:#e67e22;">
          <h3 style="color:#e67e22;">🤝 ${p}</h3>
          <p><strong>Filleul(s) :</strong></p>
          <ul style="margin-left:20px; font-size:0.9rem;">${lis}</ul>
        </div>
      `;
    })
    .join("");
}

function renderAll() {
  if (!currentUser) return;
  renderScouts();
  renderPedagogie();
  renderCamps();
  renderPresences();
  renderMateriel();
  renderParrains();
  renderChefs();
  renderFinances();
  renderSettingsInputs();
}

async function initApp() {
  const todayStr = new Date().toISOString().slice(0, 10);
  const pDate = document.getElementById("p_date");
  const fDate = document.getElementById("f_date");
  if (pDate && !pDate.value) pDate.value = todayStr;
  if (fDate && !fDate.value) fDate.value = todayStr;

  try {
    const snap = await docRefObion.get();
    if (snap.exists) {
      db = snap.data();
      normalizeDb();
      localStorage.setItem(BACKUP_KEY, JSON.stringify(db));
    } else {
      normalizeDb();
      await docRefObion.set(db, { merge: true });
    }
  } catch (err) {
    console.warn("Chargement hors ligne / secours local :", err);
    normalizeDb();
  }

  populateLoginSelect();
  document.getElementById("loaderScreen").style.display = "none";

  const savedSession = sessionStorage.getItem(SESSION_KEY);
  if (savedSession) {
    try {
      const parsed = JSON.parse(savedSession);
      const match = getUsersList().find((u) => u.id === parsed.id);
      if (match) {
        currentUser = match;
        document.getElementById("appContainer").style.display = "block";
        applyRolePermissions();
        renderAll();
        return;
      }
    } catch (_) {}
  }

  document.getElementById("loginScreen").style.display = "flex";
}

window.addEventListener("DOMContentLoaded", initApp);
