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
  programme: [],
  presences: [],
  finances: [],
  materiel: [],
  settings: {
    cg_nom: "Chef de Groupe Obion",
    cg_tel: "",
    logo_app: "logo-app.jpg",
    logo_district: "logo-district.jpg",
    logo_groupe: "logo.jpg",
    cachet_actif: true,
    cot_j_total: 2500,
    cot_j_ascci: 2085,
    cot_j_groupe: 415,
    cot_cu: 2600,
    cot_cg: 3000,
    cot_mens_j: 0,
    cot_mens_c: 0,
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
let currentProgChecklistId = null;
let tempChecklistTasks = [];
let currentWaBranche = "Toutes";
let currentAutoTarget = null;
let currentActiveTab = "dashboard";
let isSavingCloud = false;
let unsubscribeRealtime = null;

function setSyncBadge(text, bgColor) {
  const badge = document.getElementById("syncBadge");
  if (!badge) return;
  badge.textContent = text;
  badge.style.background = bgColor || "rgba(255,255,255,0.14)";
}

function withTimeout(promise, ms = 3500) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Délai Firebase dépassé")), ms)
    )
  ]);
}

function fPrix(n) {
  return Number(n || 0).toLocaleString("fr-FR") + " FCFA";
}

function getWaLink(tel, msg) {
  const digits = String(tel || "").replace(/\D/g, "");
  const fullNumber = digits.startsWith("225") ? digits : (digits ? "225" + digits : "");
  return "https://wa.me/" + fullNumber + "?text=" + encodeURIComponent(msg);
}

function getSmsLink(tel, msg) {
  const digits = String(tel || "").replace(/\D/g, "");
  return "sms:" + digits + "?body=" + encodeURIComponent(msg);
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
  db.programme = Array.isArray(db.programme) ? db.programme : [];
  db.presences = Array.isArray(db.presences) ? db.presences : [];
  db.finances = Array.isArray(db.finances) ? db.finances : [];
  db.materiel = Array.isArray(db.materiel) ? db.materiel : [];
  db.settings = Object.assign(structuredClone(defaultData.settings), db.settings || {});
  db.settings.cot_j_total = 2500;
  db.settings.cot_j_ascci = 2085;
  db.settings.cot_j_groupe = 415;
  db.settings.prog = Object.assign(
    structuredClone(defaultData.settings.prog),
    db.settings.prog || {}
  );
}

function applyAppAndBrandLogos() {
  const appLogo = (db.settings && db.settings.logo_app) || "logo-app.jpg";
  const grpLogo = (db.settings && db.settings.logo_groupe) || "logo.jpg";

  const favLink = document.getElementById("favIconLink");
  const appleLink = document.getElementById("appleIconLink");
  if (favLink) favLink.href = appLogo;
  if (appleLink) appleLink.href = appLogo;

  ["loaderLogoImg", "loginLogoImg", "headerLogoImg"].forEach((id) => {
    const img = document.getElementById(id);
    if (img) {
      img.style.display = "";
      img.src = grpLogo;
    }
  });
}

function renderDocumentHeader(title, subtitle) {
  const logoDistrict = (db.settings && db.settings.logo_district) || "logo-district.jpg";
  const logoGroupe = (db.settings && db.settings.logo_groupe) || "logo.jpg";
  return `
    <div class="doc-header-logos">
      <img src="${logoDistrict}" alt="Logo District" class="doc-logo" onerror="this.style.visibility='hidden'">
      <div class="doc-header-center">
        <h2>${title}</h2>
        <p>${subtitle || "Groupe Scout OBION — St Bernard d'Adiopodoumé KM17"}</p>
      </div>
      <img src="${logoGroupe}" alt="Logo Groupe OBION" class="doc-logo" onerror="this.style.visibility='hidden'">
    </div>
  `;
}

function renderCachetCG(forceInclude = true) {
  const activeSetting = db.settings ? db.settings.cachet_actif !== false : true;
  if (!forceInclude || !activeSetting) return "";
  const cgNom = (db.settings && db.settings.cg_nom) || "Chef de Groupe Obion";
  const cgTel = (db.settings && db.settings.cg_tel) || "";
  const todayFr = new Date().toLocaleDateString("fr-FR");
  return `
    <div class="cachet-cg">
      <strong>Cachet Numérique — Groupe OBION</strong>
      <small>Chef de Groupe : ${cgNom}</small>
      ${cgTel ? `<small>Contact : ${cgTel}</small>` : ""}
      <small>Validé le ${todayFr} • Adiopodoumé KM17</small>
    </div>
  `;
}

function findPrincipalCUForBranch(branche) {
  if (!branche || branche === "Toutes") return null;
  const titleByBranch = {
    Oisillon: "Micou",
    Meute: "Akela",
    Troupe: "Chef de Troupe",
    Chemin: "Safouin"
  };
  const expectedTitle = titleByBranch[branche];
  return (
    db.chefs.find(
      (c) =>
        (expectedTitle && c.titre === expectedTitle) ||
        (String(c.fonction || "").toLowerCase().includes("cu") &&
          String(c.titre || "").toLowerCase().includes(branche.toLowerCase()))
    ) || null
  );
}

function buildCotisationReminderMessage(scout) {
  return `Bonjour chers parents,\n\n${scout.nom} est bien enregistré(e) dans l'effectif (${scout.branche} — Groupe OBION). À ce jour, la cotisation annuelle de 2 500 FCFA n'a pas encore été réglée.\n\nNous vous rappelons que le paiement effectif de cette cotisation est indispensable pour que ${scout.nom} puisse participer à nos activités.\n\nMerci de régulariser au plus vite ou de contacter la maîtrise si vous avez une question. Fraternellement, la Maîtrise — Groupe OBION.`;
}

function buildActivityParentMessage(titre, branche, datesTxt, lieu, montant) {
  const fraisLine = Number(montant || 0) > 0
    ? `\n\nLe montant à payer pour cette activité est de ${fPrix(montant)}.`
    : "";
  return `Bonjour chers parents,\n\nNous vous informons de l'activité « ${titre} » (${branche}) prévue ${datesTxt} à ${lieu}.${fraisLine}\n\nNous vous rappelons que le paiement effectif est indispensable pour que le jeune puisse participer à nos activités.\n\nMerci de régulariser au plus vite ou de contacter la maîtrise. Fraternellement, la Maîtrise — Groupe OBION.`;
}

function buildAbsentParentMessage(scout, presence) {
  const dateFr = presence && presence.date
    ? new Date(presence.date).toLocaleDateString("fr-FR")
    : "";
  const titre = (presence && presence.titre) || "l'activité scoute";
  const branche = (presence && presence.branche) || (scout && scout.branche) || "";
  return `Bonjour chers parents,\n\nNous avons constaté l'absence de ${scout.nom} lors de « ${titre} » (${branche})${dateFr ? " du " + dateFr : ""}.\n\nLa régularité compte beaucoup dans la vie de l'unité, et nous vous rappelons que la participation aux activités suppose le respect de nos règles et le paiement effectif des cotisations.\n\nMerci de nous tenir informés si besoin. Fraternellement, la Maîtrise — Groupe OBION.`;
}

async function syncCloud(showAlertError = false) {
  normalizeDb();
  applyAppAndBrandLogos();
  localStorage.setItem(BACKUP_KEY, JSON.stringify(db));
  isSavingCloud = true;
  setSyncBadge("⏳ Sauvegarde cloud...", "#e67e22");
  try {
    await withTimeout(docRefObion.set(db, { merge: true }), 4000);
    setSyncBadge("☁️ Synchronisé en ligne", "#27ae60");
  } catch (err) {
    console.warn("Sauvegarde locale conservée, synchro cloud en attente :", err);
    setSyncBadge("💾 Mode local (en attente)", "#c0392b");
    if (showAlertError) {
      alert("Enregistré sur cet appareil. Vérifie la connexion internet pour partager avec les autres chefs.");
    }
  } finally {
    isSavingCloud = false;
  }
}

function startRealtimeListener() {
  if (unsubscribeRealtime) unsubscribeRealtime();
  unsubscribeRealtime = docRefObion.onSnapshot(
    (snap) => {
      if (isSavingCloud) return;
      if (snap && snap.exists) {
        db = snap.data();
        normalizeDb();
        applyAppAndBrandLogos();
        localStorage.setItem(BACKUP_KEY, JSON.stringify(db));
        populateLoginSelect();
        setSyncBadge("☁️ Synchronisé en ligne", "#27ae60");
        if (currentUser) {
          const refreshed = getUsersList().find((u) => u.id === currentUser.id);
          if (refreshed) {
            currentUser = refreshed;
            sessionStorage.setItem(SESSION_KEY, JSON.stringify(currentUser));
            applyRolePermissions();
          }
          renderAll();
        }
      }
    },
    (err) => {
      console.warn("Écoute temps réel indisponible :", err);
      setSyncBadge("💾 Mode local actif", "#7f8c8d");
    }
  );
}

function isChefTresorier(chef) {
  if (!chef) return false;
  if (chef.estTresorier) return true;
  const text = `${chef.titre || ""} ${chef.fonction || ""}`.toLowerCase();
  return text.includes("financier") || text.includes("trésorier") || text.includes("tresorier");
}

function isChefAdjoint(chef) {
  if (!chef) return false;
  const text = `${chef.titre || ""} ${chef.fonction || ""}`.toLowerCase();
  return text.includes("adjoint");
}

function getUsersList() {
  const list = [
    {
      id: "cg_default",
      nom: "Chef de Groupe (CG)",
      titre: "Groupe et ressources adultes",
      fonction: "Chef de Groupe",
      pin: "1234",
      isCG: true,
      isAdjoint: false,
      isFinancier: true,
      canFullAdmin: true,
      hasOverview: true,
      brancheAutorisee: "Toutes"
    }
  ];

  db.chefs.forEach((chef) => {
    const adjoint = isChefAdjoint(chef);
    const tresorier = isChefTresorier(chef);
    const cgRole =
      !adjoint &&
      (chef.titre === "Groupe et ressources adultes" ||
        chef.fonction === "Chef de Groupe");
    const coordinateur = chef.titre === "Coordinateur" || chef.fonction === "Membre du Comité";

    const brancheMap = {
      Micou: "Oisillon",
      Akela: "Meute",
      "Chef de Troupe": "Troupe",
      Safouin: "Chemin"
    };

    const canFullAdmin = cgRole || coordinateur;
    const hasOverview = canFullAdmin || adjoint;
    const isFinancier = tresorier || cgRole;

    list.push({
      id: chef.id,
      nom: chef.nom,
      titre: chef.titre,
      fonction: chef.fonction,
      pin: String(chef.pin || "1234"),
      isCG: cgRole,
      isAdjoint: adjoint,
      isFinancier: isFinancier,
      hasOverview: hasOverview,
      canFullAdmin: canFullAdmin,
      brancheAutorisee: hasOverview ? "Toutes" : (brancheMap[chef.titre] || "Toutes")
    });
  });

  return list;
}

function canViewTab(tabName) {
  if (!currentUser) return false;
  if (currentUser.canFullAdmin) return true;
  if (currentUser.isAdjoint) {
    return ["dashboard", "programme", "effectifs", "pedagogie", "camps", "presences", "materiel", "parrains", "maitrise"].includes(tabName);
  }
  if (currentUser.isFinancier) {
    return ["dashboard", "programme", "effectifs", "camps", "maitrise", "finances"].includes(tabName);
  }
  return ["dashboard", "programme", "effectifs", "pedagogie", "camps", "presences", "materiel", "parrains"].includes(tabName);
}

function canManageFinancesAndMatricules() {
  return Boolean(currentUser && (currentUser.isFinancier || currentUser.canFullAdmin));
}

function canManageFullAdmin() {
  return Boolean(currentUser && currentUser.canFullAdmin);
}

function populateLoginSelect() {
  const select = document.getElementById("login_user");
  if (!select) return;
  const users = getUsersList();
  select.innerHTML = users
    .map((u) => {
      const tags = [];
      if (u.isAdjoint) tags.push("Adjoint");
      if (u.isFinancier) tags.push("Trésorier / Financier");
      const suffix = tags.length > 0 ? ` [${tags.join(" • ")}]` : "";
      return `<option value="${u.id}">${u.nom} — ${u.titre}${suffix}</option>`;
    })
    .join("");
}

function login() {
  const userId = document.getElementById("login_user").value;
  const pin = document.getElementById("login_pin").value.trim();
  const errorEl = document.getElementById("login_error");
  const user = getUsersList().find((u) => u.id === userId);

  if (user && user.pin === pin) {
    currentUser = user;
    currentActiveTab = "dashboard";
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(user));
    errorEl.style.display = "none";
    document.getElementById("loginScreen").style.display = "none";
    document.getElementById("appContainer").style.display = "block";
    applyRolePermissions();
    nav("dashboard");
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
  const roleBadges = [];
  if (currentUser.canFullAdmin) roleBadges.push("Direction");
  if (currentUser.isAdjoint) roleBadges.push("Adjoint - Vision globale");
  if (currentUser.isFinancier) roleBadges.push("Trésorier / Financier");
  const badgeText = roleBadges.length > 0 ? ` • ${roleBadges.join(" / ")}` : "";

  document.getElementById("current_user_display").textContent =
    `${currentUser.nom} (${currentUser.titre})${badgeText}`;
  document.getElementById("p_resp").value = currentUser.nom;

  ["dashboard", "programme", "effectifs", "pedagogie", "camps", "presences", "materiel", "parrains", "maitrise", "finances", "parametres"].forEach(
    (tab) => {
      const btn = document.getElementById("tab_" + tab);
      if (btn) {
        if (canViewTab(tab)) btn.classList.remove("hidden");
        else btn.classList.add("hidden");
      }
    }
  );

  const csvCard = document.getElementById("csvEffectifsCard");
  if (csvCard) {
    if (canManageFullAdmin()) csvCard.classList.remove("hidden");
    else csvCard.classList.add("hidden");
  }

  const maitriseForm = document.getElementById("maitriseFormCard");
  if (maitriseForm) {
    if (canManageFullAdmin()) maitriseForm.classList.remove("hidden");
    else maitriseForm.classList.add("hidden");
  }

  const btnCmd = document.getElementById("btnCmdInsignes");
  if (btnCmd) {
    if (canManageFullAdmin() || currentUser.isAdjoint) btnCmd.classList.remove("hidden");
    else btnCmd.classList.add("hidden");
  }

  if (!currentUser.hasOverview && currentUser.brancheAutorisee !== "Toutes") {
    ["filterScout", "filterPeda", "camp_branche", "p_branche", "prog_branche", "filterProgBranche"].forEach(
      (id) => {
        const sel = document.getElementById(id);
        if (sel) sel.value = currentUser.brancheAutorisee;
      }
    );
  }
}

function nav(sectionName) {
  if (!currentUser) return;
  if (!canViewTab(sectionName)) {
    alert("Accès non autorisé pour ce rôle.");
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

function getDaysUntil(dateStr) {
  if (!dateStr) return null;
  const target = new Date(dateStr + "T00:00:00");
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.ceil((target - now) / (1000 * 60 * 60 * 24));
}

function getAbsenceCountForScout(scoutNom, branche) {
  return db.presences.reduce((count, p) => {
    const sameScope = p.branche === "Toutes" || !branche || p.branche === branche;
    const abs = Array.isArray(p.absentsList) ? p.absentsList : [];
    return count + (sameScope && abs.includes(scoutNom) ? 1 : 0);
  }, 0);
}

function getDefaultChecklist(type) {
  const base = [
    { label: "Valider le programme / fiche technique", done: false },
    { label: "Préparer les frais / montant à payer", done: false },
    { label: "Informer les parents & recueillir autorisations", done: false },
    { label: "Vérifier l'intendance / matériel", done: false }
  ];
  if (type === "Camp / Week-end") {
    base.push({ label: "Confirmer l'hébergement & transport", done: false });
  }
  return base;
}

function toggleProgCampFields() {
  const typeVal = document.getElementById("prog_type").value;
  const fraisGroup = document.getElementById("prog_frais_group");
  if (fraisGroup) {
    fraisGroup.style.display = typeVal === "Camp / Week-end" ? "flex" : "none";
  }
}

function resetProgrammeForm() {
  document.getElementById("prog_id").value = "";
  document.getElementById("formTitleProg").textContent = "🗓️ Ajouter une activité au programme annuel";
  document.getElementById("prog_titre").value = "";
  document.getElementById("prog_type").value = "Réunion d'unité";
  document.getElementById("prog_debut").value = "";
  document.getElementById("prog_fin").value = "";
  document.getElementById("prog_lieu").value = "";
  document.getElementById("prog_branche").value =
    currentUser && !currentUser.hasOverview && currentUser.brancheAutorisee !== "Toutes"
      ? currentUser.brancheAutorisee
      : "Toutes";
  document.getElementById("prog_statut").value = "À préparer";
  document.getElementById("prog_frais").value = "0";
  document.getElementById("prog_notes").value = "";
  toggleProgCampFields();
}

async function saveProgrammeItem() {
  const id = document.getElementById("prog_id").value;
  const titre = document.getElementById("prog_titre").value.trim();
  const type = document.getElementById("prog_type").value;
  const debut = document.getElementById("prog_debut").value;
  const fin = document.getElementById("prog_fin").value || debut;
  const lieu = document.getElementById("prog_lieu").value.trim() || "Saint Bernard d'Adiopodoumé";
  const branche = currentUser.hasOverview
    ? document.getElementById("prog_branche").value
    : currentUser.brancheAutorisee;
  const statut = document.getElementById("prog_statut").value;
  const frais = Number(document.getElementById("prog_frais").value || 0);
  const notes = document.getElementById("prog_notes").value.trim();

  if (!titre || !debut) {
    alert("Merci d'indiquer au moins le titre et la date de début de l'activité.");
    return;
  }

  const existing = id ? db.programme.find((p) => p.id === id) : null;
  let linkedCampId = existing ? existing.linkedCampId : null;

  if (type === "Camp / Week-end") {
    if (linkedCampId && db.camps.some((c) => c.id === linkedCampId)) {
      db.camps = db.camps.map((c) =>
        c.id === linkedCampId
          ? { ...c, titre, lieu, debut, fin, branche, frais }
          : c
      );
    } else {
      linkedCampId = "camp_" + Date.now();
      db.camps.push({
        id: linkedCampId,
        titre,
        lieu,
        debut,
        fin,
        branche,
        frais,
        participants: []
      });
    }
  } else if (linkedCampId) {
    db.camps = db.camps.filter((c) => c.id !== linkedCampId);
    linkedCampId = null;
  }

  const itemData = {
    id: id || "prog_" + Date.now(),
    titre,
    type,
    debut,
    fin,
    lieu,
    branche,
    statut,
    frais,
    notes,
    linkedCampId,
    checklist: existing && Array.isArray(existing.checklist) && existing.checklist.length > 0
      ? existing.checklist
      : getDefaultChecklist(type)
  };

  if (existing) {
    db.programme = db.programme.map((p) => (p.id === id ? itemData : p));
  } else {
    db.programme.push(itemData);
  }

  resetProgrammeForm();
  await syncCloud(true);
  renderAll();
}

function editProgrammeItem(id) {
  const item = db.programme.find((p) => p.id === id);
  if (!item) return;
  document.getElementById("prog_id").value = item.id;
  document.getElementById("formTitleProg").textContent = "✏️ Modifier : " + item.titre;
  document.getElementById("prog_titre").value = item.titre || "";
  document.getElementById("prog_type").value = item.type || "Réunion d'unité";
  document.getElementById("prog_debut").value = item.debut || "";
  document.getElementById("prog_fin").value = item.fin || "";
  document.getElementById("prog_lieu").value = item.lieu || "";
  document.getElementById("prog_branche").value = item.branche || "Toutes";
  document.getElementById("prog_statut").value = item.statut || "À préparer";
  document.getElementById("prog_frais").value = item.frais || 0;
  document.getElementById("prog_notes").value = item.notes || "";
  toggleProgCampFields();
  nav("programme");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function deleteProgrammeItem(id) {
  const item = db.programme.find((p) => p.id === id);
  if (!item) return;
  if (!confirm("Supprimer cette activité du programme annuel ?")) return;
  if (item.linkedCampId) {
    db.camps = db.camps.filter((c) => c.id !== item.linkedCampId);
  }
  db.programme = db.programme.filter((p) => p.id !== id);
  await syncCloud(true);
  renderAll();
}

function printProgramme() {
  const filterBranche = currentUser && currentUser.hasOverview
    ? (document.getElementById("filterProgBranche")?.value || "Toutes")
    : (currentUser ? currentUser.brancheAutorisee : "Toutes");
  const filterStatut = document.getElementById("filterProgStatut")?.value || "Tous";

  const items = [...db.programme]
    .filter((p) => {
      const okB = filterBranche === "Toutes" || p.branche === "Toutes" || p.branche === filterBranche;
      const okS = filterStatut === "Tous" || p.statut === filterStatut;
      return okB && okS;
    })
    .sort((a, b) => String(a.debut || "").localeCompare(String(b.debut || "")));

  const rows = items.map((p) => {
    const periode = p.fin && p.fin !== p.debut ? `${p.debut} au ${p.fin}` : (p.debut || "-");
    return `
      <tr>
        <td>${periode}</td>
        <td><strong>${p.titre}</strong><br><small>${p.type}</small></td>
        <td>${p.branche}</td>
        <td>${p.lieu || "-"}</td>
        <td>${p.statut}</td>
      </tr>
    `;
  });

  document.getElementById("printArea").innerHTML = `
    ${renderDocumentHeader("Programme d'Activités Annuel", `Branche : ${filterBranche} • Statut : ${filterStatut}`)}
    <table>
      <thead><tr><th>Date(s)</th><th>Activité</th><th>Branche</th><th>Lieu</th><th>Statut</th></tr></thead>
      <tbody>${rows.join("") || "<tr><td colspan='5'>Aucune activité planifiée.</td></tr>"}</tbody>
    </table>
    ${renderCachetCG(true)}
  `;
  window.print();
}

function openProgChecklist(id) {
  const item = db.programme.find((p) => p.id === id);
  if (!item) return;
  currentProgChecklistId = id;
  tempChecklistTasks = (Array.isArray(item.checklist) && item.checklist.length > 0
    ? item.checklist
    : getDefaultChecklist(item.type)
  ).map((t) => ({ ...t }));

  document.getElementById("mpc_titre").textContent = `Suivi préparation : ${item.titre}`;
  document.getElementById("mpc_meta").textContent =
    `${item.type} • ${item.branche} • Date : ${item.debut}`;
  document.getElementById("mpc_new_task").value = "";
  renderChecklistModalRows();
  openM("modalProgChecklist");
}

function renderChecklistModalRows() {
  const box = document.getElementById("mpc_tasks");
  if (!box) return;
  box.innerHTML = tempChecklistTasks.length === 0
    ? "<p>Aucune tâche dans cette liste.</p>"
    : tempChecklistTasks
        .map((t, idx) => `
          <label style="display:flex; align-items:center; justify-content:space-between; gap:8px; padding:6px; background:white; border-radius:6px; border:1px solid #eee;">
            <span style="display:flex; align-items:center; gap:8px;">
              <input type="checkbox" ${t.done ? "checked" : ""} onchange="toggleTempTask(${idx})">
              <span style="${t.done ? "text-decoration:line-through; color:#888;" : ""}">${t.label}</span>
            </span>
            <button type="button" class="btn btn-danger" style="padding:3px 7px; font-size:0.75rem;" onclick="removeTempTask(${idx})">&times;</button>
          </label>
        `)
        .join("");
}

function toggleTempTask(idx) {
  if (!tempChecklistTasks[idx]) return;
  tempChecklistTasks[idx].done = !tempChecklistTasks[idx].done;
  renderChecklistModalRows();
}

function removeTempTask(idx) {
  tempChecklistTasks.splice(idx, 1);
  renderChecklistModalRows();
}

function addChecklistTaskToModal() {
  const input = document.getElementById("mpc_new_task");
  const label = input.value.trim();
  if (!label) return;
  tempChecklistTasks.push({ label, done: false });
  input.value = "";
  renderChecklistModalRows();
}

async function saveChecklistFromModal() {
  if (!currentProgChecklistId) return;
  db.programme = db.programme.map((p) => {
    if (p.id !== currentProgChecklistId) return p;
    const allDone = tempChecklistTasks.length > 0 && tempChecklistTasks.every((t) => t.done);
    const nextStatut = allDone && p.statut === "À préparer" ? "Prêt" : p.statut;
    return {
      ...p,
      checklist: tempChecklistTasks.map((t) => ({ ...t })),
      statut: nextStatut
    };
  });
  closeM("modalProgChecklist");
  await syncCloud(true);
  renderAll();
}

function openWaInfoForProgramme(progId) {
  const item = db.programme.find((p) => p.id === progId);
  if (!item) return;
  currentWaBranche = item.branche || "Toutes";
  const datesTxt = item.fin && item.fin !== item.debut
    ? `du ${item.debut} au ${item.fin}`
    : `le ${item.debut}`;

  document.getElementById("mwa_titre").textContent = `📱 Informer les parents — ${item.titre}`;
  document.getElementById("mwa_message").value = buildActivityParentMessage(
    item.titre,
    item.branche,
    datesTxt,
    item.lieu,
    item.type === "Camp / Week-end" ? item.frais : 0
  );
  refreshWaRecipientsList();
  openM("modalWaInfo");
}

function openWaInfoForCamp(campId) {
  const camp = db.camps.find((c) => c.id === campId);
  if (!camp) return;
  currentWaBranche = camp.branche || "Toutes";
  const datesTxt = camp.fin && camp.fin !== camp.debut
    ? `du ${camp.debut} au ${camp.fin}`
    : `le ${camp.debut}`;
  document.getElementById("mwa_titre").textContent = `📱 Informer les parents — ${camp.titre}`;
  document.getElementById("mwa_message").value = buildActivityParentMessage(
    camp.titre,
    camp.branche,
    datesTxt,
    camp.lieu,
    camp.frais
  );
  refreshWaRecipientsList();
  openM("modalWaInfo");
}

function refreshWaRecipientsList() {
  const container = document.getElementById("mwa_recipients");
  if (!container) return;
  const msg = document.getElementById("mwa_message").value;
  const targets = db.scouts.filter(
    (s) => currentWaBranche === "Toutes" || s.branche === currentWaBranche
  );

  if (targets.length === 0) {
    container.innerHTML = "<p>Aucun jeune trouvé dans cette branche.</p>";
    return;
  }

  container.innerHTML = targets
    .map((s) => {
      if (!s.tel) {
        return `<div style="padding:8px; border:1px solid #eee; border-radius:6px; display:flex; justify-content:space-between; align-items:center;"><span><strong>${s.nom}</strong> <small>(${s.branche})</small></span><small style="color:#888;">Pas de téléphone</small></div>`;
      }
      const waUrl = getWaLink(s.tel, msg);
      return `<div style="padding:8px; border:1px solid #eee; border-radius:6px; display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap;"><span><strong>${s.nom}</strong> <small>(${s.branche} • ${s.tel})</small></span><a href="${waUrl}" target="_blank" class="wa-btn">📱 WhatsApp</a></div>`;
    })
    .join("");
}

function renderProgramme() {
  const listEl = document.getElementById("programmeList");
  if (!listEl || !currentUser) return;

  const filterBranche = currentUser.hasOverview
    ? (document.getElementById("filterProgBranche")?.value || "Toutes")
    : currentUser.brancheAutorisee;
  const filterStatut = document.getElementById("filterProgStatut")?.value || "Tous";

  const items = [...db.programme]
    .filter((p) => {
      const okB = filterBranche === "Toutes" || p.branche === "Toutes" || p.branche === filterBranche;
      const okS = filterStatut === "Tous" || p.statut === filterStatut;
      return okB && okS;
    })
    .sort((a, b) => String(a.debut || "").localeCompare(String(b.debut || "")));

  if (items.length === 0) {
    listEl.innerHTML = "<div class='card'><p>Aucune activité enregistrée dans le programme annuel.</p></div>";
    return;
  }

  listEl.innerHTML = items
    .map((p) => {
      const tasks = Array.isArray(p.checklist) ? p.checklist : [];
      const doneCount = tasks.filter((t) => t.done).length;
      const pct = tasks.length > 0 ? Math.round((doneCount / tasks.length) * 100) : 0;
      const daysLeft = getDaysUntil(p.debut);
      let urgencyHtml = "";
      if (daysLeft !== null && p.statut !== "Réalisé") {
        if (daysLeft < 0) urgencyHtml = `<span style="color:#c0392b; font-weight:bold;">• Date passée (${Math.abs(daysLeft)} j)</span>`;
        else if (daysLeft <= 14) urgencyHtml = `<span style="color:#d35400; font-weight:bold;">• Dans ${daysLeft} j (Vérifier préparatifs)</span>`;
        else urgencyHtml = `<span>• Dans ${daysLeft} j</span>`;
      }

      return `
        <div class="item-card" style="border-left-color:#2980b9;">
          <span class="b-badge" style="background:#2980b9;">${p.branche}</span>
          <h3>${p.titre}</h3>
          <p><strong>Type :</strong> ${p.type} | <strong>Statut :</strong> <strong>${p.statut}</strong></p>
          <p>📅 ${p.debut}${p.fin && p.fin !== p.debut ? " au " + p.fin : ""} • 📍 ${p.lieu || "-"} ${urgencyHtml}</p>
          ${p.type === "Camp / Week-end" ? `<p>🏕️ Relié aux Camps • Montant à payer : ${fPrix(p.frais)}</p>` : ""}
          ${p.notes ? `<p style="font-style:italic; color:#444;">📝 ${p.notes}</p>` : ""}
          <div style="margin-top:8px;">
            <small>Préparation : ${pct}% (${doneCount}/${tasks.length} tâche(s))</small>
            <div class="progress-bg"><div class="progress-bar" style="width:${pct}%; background:${pct === 100 ? "#27ae60" : "#e67e22"};"></div></div>
          </div>
          <div class="item-actions no-print">
            <button class="btn btn-success" onclick="openProgChecklist('${p.id}')">✓ Suivi tâches</button>
            <button class="wa-btn" onclick="openWaInfoForProgramme('${p.id}')">📱 Informer parents</button>
            <button class="btn btn-edit" onclick="editProgrammeItem('${p.id}')">✏️ Éditer</button>
            <button class="btn btn-danger" onclick="deleteProgrammeItem('${p.id}')">❌</button>
          </div>
        </div>
      `;
    })
    .join("");
}

function getDashboardRole() {
  if (!currentUser) return "unite";
  if (currentUser.isFinancier && !currentUser.canFullAdmin && !currentUser.isAdjoint) return "financier";
  if (currentUser.canFullAdmin || currentUser.isAdjoint) return "cg";
  return "unite";
}

function renderDashboard() {
  const container = document.getElementById("dashboardContent");
  if (!container || !currentUser) return;

  const role = getDashboardRole();
  const branches = ["Oisillon", "Meute", "Troupe", "Chemin", "Route"];

  const totalEntrees = db.finances
    .filter((f) => f.type === "in")
    .reduce((sum, f) => sum + Number(f.montant || 0), 0);
  const totalSorties = db.finances
    .filter((f) => f.type === "out")
    .reduce((sum, f) => sum + Number(f.montant || 0), 0);
  const soldeCaisse = totalEntrees - totalSorties;

  const upcomingItems = [...db.programme]
    .filter((p) => p.statut !== "Réalisé" && p.statut !== "Reporté")
    .sort((a, b) => String(a.debut || "").localeCompare(String(b.debut || "")))
    .slice(0, 4);

  const upcomingHtml = upcomingItems.length === 0
    ? "<p style='color:#666;'>Aucune activité à venir dans le programme.</p>"
    : upcomingItems
        .map((p) => {
          const tasks = Array.isArray(p.checklist) ? p.checklist : [];
          const done = tasks.filter((t) => t.done).length;
          return `<div style="padding:8px 0; border-bottom:1px solid #f0f0f0; display:flex; justify-content:space-between; gap:8px; flex-wrap:wrap;"><span><strong>${p.debut}</strong> — ${p.titre} <small>(${p.branche})</small></span><small style="color:#d35400; font-weight:bold;">${p.statut} • ${done}/${tasks.length} tâches</small></div>`;
        })
        .join("");

  if (role === "cg") {
    const jeunesAJour = db.scouts.filter((s) => s.cotisation).length;
    const chefsAJour = db.chefs.filter((c) => c.cotisation).length;
    const parBrancheHtml = branches
      .map((b) => {
        const count = db.scouts.filter((s) => s.branche === b).length;
        return `<div class="card" style="margin-bottom:0; padding:14px;"><strong>${b}</strong><p style="font-size:1.3rem; margin-top:4px;">${count} <small style="font-size:0.8rem;">jeune(s)</small></p></div>`;
      })
      .join("");

    const roleTitle = currentUser.isAdjoint
      ? "📊 Tableau de bord — Chef de Groupe Adjoint (Vision globale)"
      : "📊 Tableau de bord — Chef de Groupe";

    const financeCardHtml = canManageFinancesAndMatricules()
      ? `<div class="card" style="margin-bottom:0; text-align:center;">
           <small>Solde de Caisse</small>
           <h2 style="color:${soldeCaisse >= 0 ? "#27ae60" : "#c0392b"}; margin-top:5px;">${fPrix(soldeCaisse)}</h2>
           <small>Entrées : ${fPrix(totalEntrees)} • Sorties : ${fPrix(totalSorties)}</small>
         </div>`
      : `<div class="card" style="margin-bottom:0; text-align:center;">
           <small>Matricules ASCCI attribués</small>
           <h2 style="color:#2980b9; margin-top:5px;">${db.scouts.filter((s) => Boolean(s.mat)).length} / ${db.scouts.length}</h2>
           <small>Après paiement cotisation annuelle</small>
         </div>`;

    container.innerHTML = `
      <div class="card" style="border-left: 5px solid var(--c-cg);">
        <h2 class="card-header">${roleTitle}</h2>
        <p style="color:#555; margin-bottom:15px;">Vue d'ensemble du Groupe OBION (Saint Bernard d'Adiopodoumé KM17).</p>
        <div class="grid-form">
          <div class="card" style="margin-bottom:0; text-align:center;">
            <small>Effectif Jeunes</small>
            <h2 style="color:var(--text-main); margin-top:5px;">${db.scouts.length}</h2>
            <small style="color:#27ae60;">${jeunesAJour} à jour de cotisation</small>
          </div>
          <div class="card" style="margin-bottom:0; text-align:center;">
            <small>Maîtrise</small>
            <h2 style="color:var(--c-cg); margin-top:5px;">${db.chefs.length}</h2>
            <small>${chefsAJour} chef(s) à jour</small>
          </div>
          ${financeCardHtml}
          <div class="card" style="margin-bottom:0; text-align:center;">
            <small>Programme & Camps</small>
            <h2 style="color:#2980b9; margin-top:5px;">${db.programme.length} / ${db.camps.length}</h2>
            <small>Activités annuelles / Camps</small>
          </div>
        </div>
      </div>

      <div class="card">
        <h3 class="card-header">🗓️ Prochaines échéances & préparation</h3>
        ${upcomingHtml}
        <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:15px;">
          <button class="btn btn-main" style="width:auto; margin-top:0; background:#2980b9;" onclick="nav('programme')">Ouvrir le programme annuel</button>
          ${canManageFinancesAndMatricules() ? `<button class="btn btn-warning" onclick="nav('finances')">Voir la caisse & matricules</button>` : ""}
          <button class="btn btn-secondary" onclick="nav('effectifs')">Effectifs</button>
        </div>
      </div>

      <div class="card">
        <h3 class="card-header">⚜️ Répartition par branche</h3>
        <div class="grid-form">${parBrancheHtml}</div>
      </div>
    `;
    return;
  }

  if (role === "financier") {
    const scoutsImpayes = db.scouts.filter((s) => !s.cotisation).length;
    const sansMatricule = db.scouts.filter((s) => s.cotisation && !s.mat).length;

    container.innerHTML = `
      <div class="card" style="border-left: 5px solid #27ae60;">
        <h2 class="card-header">💰 Tableau de bord — Trésorier / Financier</h2>
        <p style="color:#555; margin-bottom:15px;">Gestion des cotisations (annuelles et mensuelles), de la caisse et des matricules ASCCI après paiement.</p>
        <div class="grid-form">
          <div class="card" style="margin-bottom:0; text-align:center; border-bottom:4px solid #27ae60;">
            <small>Total Entrées</small>
            <h2 style="color:#27ae60; margin-top:5px;">${fPrix(totalEntrees)}</h2>
          </div>
          <div class="card" style="margin-bottom:0; text-align:center; border-bottom:4px solid #c0392b;">
            <small>Total Sorties</small>
            <h2 style="color:#c0392b; margin-top:5px;">${fPrix(totalSorties)}</h2>
          </div>
          <div class="card" style="margin-bottom:0; text-align:center; border-bottom:4px solid var(--text-main);">
            <small>Solde Caisse</small>
            <h2 style="color:var(--text-main); margin-top:5px;">${fPrix(soldeCaisse)}</h2>
          </div>
          <div class="card" style="margin-bottom:0; text-align:center; border-bottom:4px solid #2980b9;">
            <small>Matricules à attribuer</small>
            <h2 style="color:#2980b9; margin-top:5px;">${sansMatricule}</h2>
            <small>${scoutsImpayes} jeune(s) en attente de cotisation</small>
          </div>
        </div>
        <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:18px;">
          <button class="btn btn-warning" onclick="nav('finances')">Caisse, Cotisations & Matricules</button>
          <button class="btn btn-secondary" onclick="nav('effectifs')">Voir les effectifs</button>
        </div>
      </div>
    `;
    return;
  }

  const maBranche =
    currentUser.brancheAutorisee && currentUser.brancheAutorisee !== "Toutes"
      ? currentUser.brancheAutorisee
      : "Toutes";
  const mesScouts = db.scouts.filter((s) => maBranche === "Toutes" || s.branche === maBranche);
  const mesAJour = mesScouts.filter((s) => s.cotisation).length;
  const mesAppels = db.presences.filter(
    (p) => maBranche === "Toutes" || p.branche === "Toutes" || p.branche === maBranche
  );
  const dernierAppel = mesAppels.length > 0 ? mesAppels[mesAppels.length - 1] : null;

  const moyProg =
    mesScouts.length > 0
      ? Math.round(
          mesScouts.reduce((acc, s) => {
            const etapes = getEtapesBranche(s.branche);
            const valid = Array.isArray(s.etapesValidees) ? s.etapesValidees : [];
            return acc + (valid.length / Math.max(1, etapes.length)) * 100;
          }, 0) / mesScouts.length
        )
      : 0;

  container.innerHTML = `
    <div class="card" style="border-left: 5px solid #3498db;">
      <h2 class="card-header">🏕️ Tableau de bord — Chef d'Unité (${maBranche})</h2>
      <p style="color:#555; margin-bottom:15px;">Suivi quotidien de votre unité : effectifs, progression pédagogique, programme et appels.</p>
      <div class="grid-form">
        <div class="card" style="margin-bottom:0; text-align:center;">
          <small>Jeunes de l'unité</small>
          <h2 style="color:var(--text-main); margin-top:5px;">${mesScouts.length}</h2>
          <small style="color:#27ae60;">${mesAJour} à jour de cotisation</small>
        </div>
        <div class="card" style="margin-bottom:0; text-align:center;">
          <small>Progression moyenne</small>
          <h2 style="color:#27ae60; margin-top:5px;">${moyProg}%</h2>
          <div class="progress-bg"><div class="progress-bar" style="width:${moyProg}%;"></div></div>
        </div>
        <div class="card" style="margin-bottom:0; text-align:center;">
          <small>Dernier appel</small>
          <h3 style="color:#3498db; margin-top:6px;">${dernierAppel ? `${dernierAppel.presents}/${dernierAppel.total} présents` : "Aucun appel"}</h3>
          <small>${dernierAppel ? `${dernierAppel.titre} (${dernierAppel.date})` : "Prêt pour le prochain appel"}</small>
        </div>
      </div>
      <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:18px;">
        <button class="btn btn-main" style="width:auto; margin-top:0; background:#2980b9;" onclick="nav('programme')">Programme de l'unité</button>
        <button class="btn btn-main" style="width:auto; margin-top:0;" onclick="nav('effectifs')">Effectifs</button>
        <button class="btn btn-success" onclick="nav('pedagogie')">Pédagogie</button>
        <button class="btn btn-secondary" onclick="nav('presences')">Faire l'appel</button>
      </div>
    </div>
  `;
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
  ["s_nom", "s_ddn", "s_branche", "s_sousunite", "s_role", "s_tel", "s_tel_perso", "s_parrain", "s_parrain_tel", "s_medical", "s_urgence"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  document.getElementById("s_sang").value = "Inconnu";
  document.getElementById("s_age_hint").textContent = "";
}

async function saveScout() {
  const id = document.getElementById("s_id").value;
  const nom = document.getElementById("s_nom").value.trim();
  const ddn = document.getElementById("s_ddn").value;
  const branche = document.getElementById("s_branche").value.trim() || "Oisillon";
  const tel = document.getElementById("s_tel").value.trim();

  if (!nom || !ddn || !tel) {
    alert("Merci de renseigner au moins le nom complet, la date de naissance et le contact parent.");
    return;
  }

  const existing = id ? db.scouts.find((s) => s.id === id) : null;
  const record = {
    id: id || "sc_" + Date.now(),
    mat: existing ? (existing.mat || "") : "",
    nom,
    ddn,
    branche,
    sousunite: document.getElementById("s_sousunite").value.trim(),
    role: document.getElementById("s_role").value.trim(),
    tel,
    tel_perso: document.getElementById("s_tel_perso").value.trim(),
    parrain: document.getElementById("s_parrain").value.trim(),
    parrain_tel: document.getElementById("s_parrain_tel").value.trim(),
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
  document.getElementById("s_nom").value = s.nom || "";
  document.getElementById("s_ddn").value = s.ddn || "";
  document.getElementById("s_branche").value = s.branche || "";
  document.getElementById("s_sousunite").value = s.sousunite || "";
  document.getElementById("s_role").value = s.role || "";
  document.getElementById("s_tel").value = s.tel || "";
  document.getElementById("s_tel_perso").value = s.tel_perso || "";
  document.getElementById("s_parrain").value = s.parrain || "";
  document.getElementById("s_parrain_tel").value = s.parrain_tel || "";
  document.getElementById("s_sang").value = s.sang || "Inconnu";
  document.getElementById("s_medical").value = s.medical || "";
  document.getElementById("s_urgence").value = s.urgence || "";
  autoBranch();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function deleteScout(id) {
  if (!canManageFullAdmin()) {
    alert("Seul le Chef de Groupe peut supprimer un dossier.");
    return;
  }
  const s = db.scouts.find((item) => item.id === id);
  if (!s) return;
  if (!confirm("Supprimer le dossier de " + s.nom + " ?")) return;
  db.scouts = db.scouts.filter((item) => item.id !== id);
  await syncCloud(true);
  renderAll();
}

function downloadCsvTemplate() {
  const csv = "Nom;DateNaissance;Branche;SousUnite;Role;ContactParent;ContactJeune;Parrain;ContactParrain;Sang;Medical;Urgence\nKouassi Jean;2014-05-12;Troupe;Aigle;Chef de Patrouille;0700000000;;Koffi Paul;0100000000;O+;Aucune;0500000000";
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
    if (!cols[0]) continue;
    db.scouts.push({
      id: "sc_" + Date.now() + "_" + i,
      mat: "",
      nom: cols[0],
      ddn: cols[1] || "2015-01-01",
      branche: cols[2] || "Meute",
      sousunite: cols[3] || "",
      role: cols[4] || "",
      tel: cols[5] || "",
      tel_perso: cols[6] || "",
      parrain: cols[7] || "",
      parrain_tel: cols[8] || "",
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

function exportScoutsCSV() {
  const header = "MatriculeASCCI;Nom;Branche;SousUnite;ContactParent;Parrain;ContactParrain;CotisationAnnuelle;PartASCCI;PartCaisseGroupe;Absences";
  const rows = db.scouts.map((s) => {
    const abs = getAbsenceCountForScout(s.nom, s.branche);
    const partAscci = s.cotisation ? 2085 : 0;
    const partGroupe = s.cotisation ? 415 : 0;
    return [
      s.mat || "En attente",
      s.nom || "",
      s.branche || "",
      s.sousunite || "",
      s.tel || "",
      s.parrain || "",
      s.parrain_tel || "",
      s.cotisation ? "A jour (2500)" : "Impaye",
      partAscci,
      partGroupe,
      abs
    ]
      .map((v) => String(v).replace(/;/g, ","))
      .join(";");
  });
  const blob = new Blob(["\uFEFF" + [header, ...rows].join("\n")], {
    type: "text/csv;charset=utf-8;"
  });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "effectifs_obion.csv";
  link.click();
}

function exportFinancesCSV() {
  const header = "Date;Type;Categorie;Motif;MontantTotal;PartASCCI;PartCaisseGroupe";
  const rows = db.finances.map((f) => {
    const amt = Number(f.montant || 0);
    const isCotiJeune = f.type === "in" && f.cat === "Cotisation Annuelle" && amt === 2500;
    const partAscci = isCotiJeune ? 2085 : "";
    const partGroupe = isCotiJeune ? 415 : "";
    return [
      f.date || "",
      f.type === "in" ? "Entree" : "Sortie",
      f.cat || "",
      String(f.motif || "").replace(/;/g, ","),
      amt,
      partAscci,
      partGroupe
    ].join(";");
  });
  const blob = new Blob(["\uFEFF" + [header, ...rows].join("\n")], {
    type: "text/csv;charset=utf-8;"
  });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "finances_obion.csv";
  link.click();
}

function exportBackupJSON() {
  const blob = new Blob([JSON.stringify(db, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `sauvegarde_obion_${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
}

async function importBackupJSON(event) {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    db = parsed;
    normalizeDb();
    applyAppAndBrandLogos();
    populateLoginSelect();
    await syncCloud(true);
    renderAll();
    alert("Sauvegarde JSON restaurée avec succès.");
  } catch (err) {
    alert("Fichier JSON invalide.");
  }
  event.target.value = "";
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
  document.getElementById("mp_info").textContent = `${s.branche} • Matricule ASCCI : ${s.mat || "En attente"} • ${s.sousunite || "Unité"}`;
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
    return `<tr><td>${s.mat || "En attente"}</td><td>${s.nom}</td><td>${s.branche}</td><td>${nextStep}</td></tr>`;
  });

  document.getElementById("printArea").innerHTML = `
    ${renderDocumentHeader("Commande d'Insignes", "Suivi pédagogique des jeunes")}
    <table>
      <thead><tr><th>Matricule ASCCI</th><th>Nom</th><th>Branche</th><th>Prochain insigne / étape</th></tr></thead>
      <tbody>${rows.join("") || "<tr><td colspan='4'>Aucun jeune enregistré.</td></tr>"}</tbody>
    </table>
    ${renderCachetCG(true)}
  `;
  window.print();
}

function openAutoConfig(targetType, targetId) {
  currentAutoTarget = { targetType, targetId };
  let label = "Groupe Obion";
  let targetBranche = "Toutes";
  if (targetType === "scout") {
    const s = db.scouts.find((x) => x.id === targetId);
    if (s) {
      targetBranche = s.branche;
      label = `${s.nom} (${s.branche}${s.mat ? " • Mat: " + s.mat : ""})`;
    }
  } else if (targetType === "camp") {
    const c = db.camps.find((x) => x.id === targetId);
    if (c) {
      targetBranche = c.branche;
      label = `${c.titre} (${c.branche})`;
      document.getElementById("ma_custom_text").value =
        `à participer au camp « ${c.titre} » à ${c.lieu} du ${c.debut} au ${c.fin}.`;
    }
  }
  currentAutoTarget.branche = targetBranche;
  document.getElementById("ma_target_name").textContent = label;
  document.getElementById("ma_include_cachet").checked =
    db.settings ? db.settings.cachet_actif !== false : true;
  openM("modalAutoConfig");
}

function printAutoRun() {
  const customText = document.getElementById("ma_custom_text").value.trim();
  const includeCachet = document.getElementById("ma_include_cachet").checked;
  const targetLabel = document.getElementById("ma_target_name").textContent || "Groupe Obion";
  const cgNom = db.settings.cg_nom || "Le Chef de Groupe";
  const cgTel = db.settings.cg_tel || "";

  let branchName = currentAutoTarget && currentAutoTarget.branche ? currentAutoTarget.branche : "";
  let detailsHtml = `<p><strong>Concerné :</strong> ${targetLabel}</p>`;
  if (currentAutoTarget && currentAutoTarget.targetType === "scout") {
    const s = db.scouts.find((x) => x.id === currentAutoTarget.targetId);
    if (s) {
      branchName = s.branche;
      detailsHtml = `
        <p><strong>Jeune :</strong> ${s.nom} | <strong>Branche :</strong> ${s.branche} | <strong>Matricule ASCCI :</strong> ${s.mat || "En attente"}</p>
        <p><strong>Contact parent :</strong> ${s.tel || "-"} | <strong>Urgence :</strong> ${s.urgence || "-"}</p>
      `;
    }
  }

  const cuPrincipal = findPrincipalCUForBranch(branchName);
  const cuLine = cuPrincipal
    ? `<p><strong>CU principal (${branchName}) :</strong> ${cuPrincipal.nom}${cuPrincipal.tel ? " • Tél : " + cuPrincipal.tel : ""}</p>`
    : (branchName && branchName !== "Toutes" ? `<p><strong>CU principal (${branchName}) :</strong> Numéro non renseigné dans Maîtrise</p>` : "");

  document.getElementById("printArea").innerHTML = `
    ${renderDocumentHeader("Autorisation Parentale", "Groupe Scout OBION — St Bernard d'Adiopodoumé KM17")}
    <div style="background:#f8f9fa; border:1px solid #ddd; border-radius:8px; padding:10px 14px; margin-bottom:14px;">
      ${detailsHtml}
      <p><strong>Chef de Groupe :</strong> ${cgNom}${cgTel ? " • Tél : " + cgTel : ""}</p>
      ${cuLine}
    </div>
    <p style="margin:14px 0; line-height:1.6;">
      Je soussigné(e), parent / tuteur légal, autorise le jeune concerné <strong>${customText}</strong>
    </p>
    <p style="margin-top:20px;"><strong>Nom & Signature du parent / tuteur :</strong> ___________________________________</p>
    ${renderCachetCG(includeCachet)}
  `;
  closeM("modalAutoConfig");
  window.print();
}

async function saveCamp() {
  const titre = document.getElementById("camp_titre").value.trim();
  const lieu = document.getElementById("camp_lieu").value.trim();
  const debut = document.getElementById("camp_debut").value;
  const fin = document.getElementById("camp_fin").value;
  const branche = currentUser.hasOverview
    ? document.getElementById("camp_branche").value
    : currentUser.brancheAutorisee;
  const frais = Number(document.getElementById("camp_frais").value || 0);

  if (!titre || !lieu || !debut || !fin) {
    alert("Merci de remplir le titre, le lieu et les dates du camp.");
    return;
  }

  const campId = "camp_" + Date.now();
  db.camps.push({
    id: campId,
    titre,
    lieu,
    debut,
    fin,
    branche,
    frais,
    participants: []
  });

  db.programme.push({
    id: "prog_" + Date.now(),
    titre,
    type: "Camp / Week-end",
    debut,
    fin,
    lieu,
    branche,
    statut: "À préparer",
    frais,
    notes: "Créé depuis Camps & WE",
    linkedCampId: campId,
    checklist: getDefaultChecklist("Camp / Week-end")
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
  if (!canManageFullAdmin()) {
    alert("Seul le Chef de Groupe peut supprimer un camp.");
    return;
  }
  if (!confirm("Supprimer ce camp / week-end ?")) return;
  db.camps = db.camps.filter((c) => c.id !== campId);
  db.programme = db.programme.filter((p) => p.linkedCampId !== campId);
  await syncCloud(true);
  renderAll();
}

function genAppel() {
  const branche = currentUser && !currentUser.hasOverview
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
  const branche = currentUser.hasOverview
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

  if (aList.length === 0) {
    document.getElementById("list_a").innerHTML = "<li>Aucun absent</li>";
  } else {
    document.getElementById("list_a").innerHTML = aList
      .map((nomAbsent) => {
        const scout =
          db.scouts.find((s) => s.nom === nomAbsent && (p.branche === "Toutes" || s.branche === p.branche)) ||
          db.scouts.find((s) => s.nom === nomAbsent);
        const totalAbs = getAbsenceCountForScout(nomAbsent, p.branche);
        const absBadge = totalAbs >= 2 ? `<small style="color:#c0392b; font-weight:bold;">(${totalAbs} absences)</small>` : "";

        if (!scout || !scout.tel) {
          return `<li style="margin-bottom:8px;">• ${nomAbsent} ${absBadge} <small style="color:#888;">(Pas de n° parent)</small></li>`;
        }

        const msg = buildAbsentParentMessage(scout, p);
        const waUrl = getWaLink(scout.tel, msg);
        const smsUrl = getSmsLink(scout.tel, msg);

        return `
          <li style="margin-bottom:10px; padding-bottom:8px; border-bottom:1px dashed #eee;">
            <div><strong>${scout.nom}</strong> <small>(${scout.tel})</small> ${absBadge}</div>
            <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:4px;">
              <a href="${waUrl}" target="_blank" class="wa-btn">📱 WhatsApp</a>
              <a href="${smsUrl}" class="btn btn-secondary" style="padding:3px 8px; border-radius:12px; font-size:0.75rem;">✉️ SMS</a>
            </div>
          </li>
        `;
      })
      .join("");
  }

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
    ${renderDocumentHeader("Fiche d'Appel", `${p.titre} • ${p.branche}`)}
    <p><strong>Date :</strong> ${p.date} | <strong>Responsable :</strong> ${p.resp}</p>
    <p><strong>Présents :</strong> ${p.presents} / ${p.total}</p>
    <p><strong>Absents :</strong> ${(p.absentsList || []).join(", ") || "Aucun"}</p>
    ${renderCachetCG(true)}
  `;
  window.print();
}

async function delPres(id) {
  if (!canManageFullAdmin()) {
    alert("Seul le Chef de Groupe peut supprimer un appel.");
    return;
  }
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
  if (!canManageFullAdmin()) {
    alert("Seul le Chef de Groupe peut retirer du matériel.");
    return;
  }
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
  document.getElementById("c_est_tresorier").checked = false;
}

async function saveChef() {
  if (!canManageFullAdmin()) {
    alert("Seul le Chef de Groupe peut gérer la maîtrise.");
    return;
  }
  const id = document.getElementById("c_id").value;
  const nom = document.getElementById("c_nom").value.trim();
  const titre = document.getElementById("c_titre").value;
  const fonction = document.getElementById("c_fonction").value;
  const tel = document.getElementById("c_tel").value.trim();
  const pin = document.getElementById("c_pin").value.trim();
  const estTresorier =
    Boolean(document.getElementById("c_est_tresorier").checked) ||
    fonction.toLowerCase().includes("trésorier") ||
    fonction.toLowerCase().includes("financier");

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
    estTresorier,
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
  if (!canManageFullAdmin()) return;
  const c = db.chefs.find((item) => item.id === id);
  if (!c) return;
  document.getElementById("c_id").value = c.id;
  document.getElementById("c_nom").value = c.nom || "";
  document.getElementById("c_titre").value = c.titre || "Micou";
  document.getElementById("c_fonction").value = c.fonction || "Chef d'Unité (CU)";
  document.getElementById("c_tel").value = c.tel || "";
  document.getElementById("c_pin").value = c.pin || "";
  document.getElementById("c_est_tresorier").checked = isChefTresorier(c);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function deleteChef(id) {
  if (!canManageFullAdmin()) {
    alert("Seul le Chef de Groupe peut retirer un membre de la maîtrise.");
    return;
  }
  if (!confirm("Retirer ce responsable de la maîtrise ?")) return;
  db.chefs = db.chefs.filter((c) => c.id !== id);
  populateLoginSelect();
  await syncCloud(true);
  renderAll();
}

function getCotisationAnnuelleChefMontant(chef) {
  const isCG =
    chef.titre === "Groupe et ressources adultes" ||
    chef.fonction === "Chef de Groupe";
  return isCG ? Number(db.settings.cot_cg || 3000) : Number(db.settings.cot_cu || 2600);
}

function checkCotisation() {
  const cat = document.getElementById("f_cat").value;
  const linkBox = document.getElementById("f_scout_link");
  const select = document.getElementById("f_scout_select");
  const matBox = document.getElementById("f_matricule_box");
  if (cat === "Cotisation Annuelle" || cat === "Cotisation Mensuelle") {
    linkBox.style.display = "block";
    const options = ['<option value="">Sélectionner le membre qui vient de payer...</option>'];
    db.scouts.forEach((s) => {
      options.push(`<option value="scout:${s.id}">Jeune : ${s.nom} (${s.branche})</option>`);
    });
    db.chefs.forEach((c) => {
      options.push(`<option value="chef:${c.id}">Chef : ${c.nom} (${c.titre})</option>`);
    });
    select.innerHTML = options.join("");
    matBox.style.display = cat === "Cotisation Annuelle" ? "block" : "none";
  } else {
    linkBox.style.display = "none";
    matBox.style.display = "none";
  }
}

async function saveTarifsFinancier() {
  if (!canManageFinancesAndMatricules()) {
    alert("Accès réservé au Trésorier / Financier.");
    return;
  }
  db.settings.cot_mens_j = Number(document.getElementById("fin_cot_mens_j").value || 0);
  db.settings.cot_mens_c = Number(document.getElementById("fin_cot_mens_c").value || 0);
  await syncCloud(true);
  renderAll();
  alert("Cotisations mensuelles enregistrées.");
}

async function assignScoutMatricule(scoutId) {
  if (!canManageFinancesAndMatricules()) {
    alert("Seul le Financier / Trésorier peut attribuer ou modifier un matricule ASCCI.");
    return;
  }
  const scout = db.scouts.find((s) => s.id === scoutId);
  if (!scout) return;
  if (!scout.cotisation) {
    alert("La cotisation annuelle du jeune doit d'abord être payée avant d'attribuer son matricule ASCCI.");
    return;
  }
  const input = document.getElementById("mat_input_" + scoutId);
  const newMat = input ? input.value.trim() : "";
  if (!newMat) {
    alert("Merci de saisir le numéro de matricule ASCCI.");
    return;
  }

  db.scouts = db.scouts.map((s) => (s.id === scoutId ? { ...s, mat: newMat } : s));
  await syncCloud(true);
  renderAll();
  alert(`Matricule ASCCI attribué à ${scout.nom} : ${newMat}`);
}

async function saveFinance() {
  if (!canManageFinancesAndMatricules()) {
    alert("Accès réservé au Trésorier / Financier.");
    return;
  }
  const type = document.getElementById("f_type").value;
  const cat = document.getElementById("f_cat").value;
  const montant = Number(document.getElementById("f_montant").value || 0);
  const date = document.getElementById("f_date").value || new Date().toISOString().slice(0, 10);
  const motif = document.getElementById("f_motif").value.trim();
  const linked = document.getElementById("f_scout_select").value;
  const newMat = (document.getElementById("f_new_matricule")?.value || "").trim();

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
      db.scouts = db.scouts.map((s) =>
        s.id === targetId ? { ...s, cotisation: true, mat: newMat || s.mat || "" } : s
      );
    } else if (kind === "chef") {
      db.chefs = db.chefs.map((c) => (c.id === targetId ? { ...c, cotisation: true } : c));
    }
  }

  document.getElementById("f_montant").value = "";
  document.getElementById("f_motif").value = "";
  if (document.getElementById("f_new_matricule")) {
    document.getElementById("f_new_matricule").value = "";
  }

  await syncCloud(true);
  renderAll();
}

async function delFin(id) {
  if (!canManageFinancesAndMatricules()) {
    alert("Accès réservé au Trésorier / Financier.");
    return;
  }
  if (!confirm("Supprimer cette opération financière ?")) return;
  db.finances = db.finances.filter((f) => f.id !== id);
  await syncCloud(true);
  renderAll();
}

function printCaisse() {
  const totalAscci = db.scouts.filter((s) => s.cotisation).length * 2085;
  const totalGroupePart = db.scouts.filter((s) => s.cotisation).length * 415;

  const rows = [...db.finances]
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .map((f) => {
      const sign = f.type === "in" ? "+" : "-";
      const isCotiJeune = f.type === "in" && f.cat === "Cotisation Annuelle" && Number(f.montant) === 2500;
      const motifDetail = isCotiJeune
        ? `${f.motif} <br><small>(Répartition : 2 085 FCFA ASCCI + 415 FCFA Caisse Groupe)</small>`
        : f.motif;
      return `<tr><td>${f.date}</td><td>${f.type.toUpperCase()}</td><td>${f.cat}</td><td>${motifDetail}</td><td>${sign} ${fPrix(f.montant)}</td></tr>`;
    });

  document.getElementById("printArea").innerHTML = `
    ${renderDocumentHeader("Livre de Caisse", "Bilan financier du groupe")}
    <p>Entrées : ${document.getElementById("f_tot_in").textContent} | Sorties : ${document.getElementById("f_tot_out").textContent} | Solde : ${document.getElementById("f_solde").textContent}</p>
    <p style="margin-top:6px;"><strong>Ventilation cotisations annuelles jeunes payées :</strong> Part ASCCI : ${fPrix(totalAscci)} | Part Caisse Groupe : ${fPrix(totalGroupePart)}</p>
    <table>
      <thead><tr><th>Date</th><th>Type</th><th>Catégorie</th><th>Motif</th><th>Montant</th></tr></thead>
      <tbody>${rows.join("") || "<tr><td colspan='5'>Aucune opération.</td></tr>"}</tbody>
    </table>
    ${renderCachetCG(true)}
  `;
  window.print();
}

async function saveSettings() {
  if (!canManageFullAdmin()) {
    alert("Seul le Chef de Groupe peut modifier les paramètres généraux.");
    return;
  }
  db.settings.cg_nom = document.getElementById("cfg_cg_nom").value.trim() || "Chef de Groupe Obion";
  db.settings.cg_tel = document.getElementById("cfg_cg_tel").value.trim();
  db.settings.logo_app = document.getElementById("cfg_logo_app").value.trim() || "logo-app.jpg";
  db.settings.logo_district = document.getElementById("cfg_logo_district").value.trim() || "logo-district.jpg";
  db.settings.logo_groupe = document.getElementById("cfg_logo_groupe").value.trim() || "logo.jpg";
  db.settings.cachet_actif = Boolean(document.getElementById("cfg_cachet_actif").checked);
  db.settings.cot_j_total = 2500;
  db.settings.cot_j_ascci = 2085;
  db.settings.cot_j_groupe = 415;
  db.settings.cot_cu = Number(document.getElementById("cfg_cot_cu").value || 2600);
  db.settings.cot_cg = Number(document.getElementById("cfg_cot_cg").value || 3000);
  applyAppAndBrandLogos();
  await syncCloud(true);
  renderAll();
  alert("Paramètres du groupe enregistrés.");
}

async function saveProgSettings() {
  if (!canManageFullAdmin()) {
    alert("Seul le Chef de Groupe peut modifier les progressions.");
    return;
  }
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
  if (!canManageFullAdmin()) {
    alert("Seul le Chef de Groupe peut clôturer l'année.");
    return;
  }
  if (!confirm("Remettre toutes les cotisations annuelles (jeunes et chefs) à Impayé pour la nouvelle année ?")) return;
  db.scouts = db.scouts.map((s) => ({ ...s, cotisation: false }));
  db.chefs = db.chefs.map((c) => ({ ...c, cotisation: false }));
  await syncCloud(true);
  renderAll();
  alert("Nouvelle année préparée : cotisations remises à Impayé.");
}

function renderSettingsInputs() {
  if (!currentUser || !canManageFullAdmin()) return;
  document.getElementById("cfg_cg_nom").value = db.settings.cg_nom || "";
  document.getElementById("cfg_cg_tel").value = db.settings.cg_tel || "";
  document.getElementById("cfg_logo_app").value = db.settings.logo_app || "logo-app.jpg";
  document.getElementById("cfg_logo_district").value = db.settings.logo_district || "logo-district.jpg";
  document.getElementById("cfg_logo_groupe").value = db.settings.logo_groupe || "logo.jpg";
  document.getElementById("cfg_cachet_actif").checked = db.settings.cachet_actif !== false;
  document.getElementById("cfg_cot_cu").value = db.settings.cot_cu || 2600;
  document.getElementById("cfg_cot_cg").value = db.settings.cot_cg || 3000;
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
  const filterBranche = currentUser.hasOverview
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
        ? `<a href="${getWaLink(s.tel, buildCotisationReminderMessage(s))}" target="_blank" class="wa-btn">📱 Relancer (2 500 FCFA)</a>`
        : "";
      const cotiStatus = s.cotisation
        ? `<span class="status-dot status-green"></span> Cotisation annuelle : À jour`
        : `<span class="status-dot status-red"></span> Cotisation annuelle : Impayé ${waBtn}`;
      const matDisplay = s.mat
        ? `<strong>Matricule ASCCI :</strong> ${s.mat}`
        : `<strong>Matricule ASCCI :</strong> <span style="color:#888;">${s.cotisation ? "En attente d'attribution (Financier)" : "Après paiement annuel"}</span>`;
      const absCount = getAbsenceCountForScout(s.nom, s.branche);
      const parrainLine = s.parrain
        ? `<p><strong>Parrain :</strong> ${s.parrain}${s.parrain_tel ? ` (${s.parrain_tel})` : ""}</p>`
        : "";

      return `
        <div class="item-card ${branchClassMap[s.branche] || ""}">
          <span class="b-badge">${s.branche}</span>
          <h3>${s.nom}</h3>
          <p>${matDisplay} | <strong>Unité :</strong> ${s.sousunite || "Non précisée"}</p>
          <p><strong>Parent :</strong> ${s.tel || "-"} | <strong>Sang :</strong> ${s.sang || "Inconnu"}</p>
          ${parrainLine}
          <p><strong>Absences enregistrées :</strong> ${absCount}</p>
          <p style="margin-top:6px;">${cotiStatus}</p>
          <div class="item-actions no-print">
            <button class="btn btn-edit" onclick="editScout('${s.id}')">✏️ Modifier</button>
            <button class="btn btn-secondary" onclick="openAutoConfig('scout', '${s.id}')">📄 Autorisation</button>
            ${canManageFullAdmin() ? `<button class="btn btn-danger" onclick="deleteScout('${s.id}')">❌ Supprimer</button>` : ""}
          </div>
        </div>
      `;
    })
    .join("");
}

function renderPedagogie() {
  const tbody = document.getElementById("pedaList");
  if (!tbody || !currentUser) return;
  const filterBranche = currentUser.hasOverview
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
          <td>${s.mat || "<small style='color:#888;'>En attente</small>"}</td>
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
    (c) => currentUser.hasOverview || c.branche === "Toutes" || c.branche === currentUser.brancheAutorisee
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
          <p><strong>Montant à payer :</strong> ${fPrix(c.frais)} | <strong>Inscrits :</strong> ${partList.length}</p>
          <p><strong>Encaissé :</strong> ${fPrix(totalPaye)}</p>
          <div class="item-actions no-print">
            <button class="btn btn-success" onclick="openCampPart('${c.id}')">👥 Inscrits & Paiements</button>
            <button class="wa-btn" onclick="openWaInfoForCamp('${c.id}')">📱 Informer parents</button>
            <button class="btn btn-secondary" onclick="openAutoConfig('camp', '${c.id}')">📄 Autorisation</button>
            ${canManageFullAdmin() ? `<button class="btn btn-danger" onclick="deleteCamp('${c.id}')">❌ Supprimer</button>` : ""}
          </div>
        </div>
      `;
    })
    .join("");
}

function renderChefs() {
  if (!currentUser) return;
  const cList = document.getElementById("chefList");
  if (!cList) return;

  if (db.chefs.length === 0) {
    cList.innerHTML = "<div class='card'><p>Aucun chef enregistré dans la maîtrise.</p></div>";
    return;
  }

  cList.innerHTML = db.chefs
    .map((c) => {
      const montantAnnuel = getCotisationAnnuelleChefMontant(c);
      const tresoBadge = isChefTresorier(c) ? " • Trésorier" : "";
      let waBtn = "";
      if (!c.cotisation && c.tel && canManageFinancesAndMatricules()) {
        const msg = `Bonjour ${c.nom}, rappel de la maîtrise du Groupe Obion : ta cotisation annuelle (${fPrix(montantAnnuel)}) est en attente.`;
        waBtn = `<a href="${getWaLink(c.tel, msg)}" target="_blank" class="wa-btn">📱 Relancer (${fPrix(montantAnnuel)})</a>`;
      }
      const cotiC = c.cotisation
        ? `<span class="status-dot status-green"></span> Cotisation annuelle (${fPrix(montantAnnuel)}) : À jour`
        : `<span class="status-dot status-red"></span> Cotisation annuelle (${fPrix(montantAnnuel)}) : Impayé ${waBtn}`;

      return `
        <div class="item-card b-CG">
          <span class="b-badge" style="background:var(--c-cg);">${c.fonction}${tresoBadge}</span>
          <h3>${c.nom}</h3>
          <p><strong>Titre :</strong> ${c.titre}</p>
          <p><strong>Téléphone :</strong> <a href="tel:${c.tel}">${c.tel}</a></p>
          <p style="margin-top:8px;">${cotiC}</p>
          ${canManageFullAdmin() ? `<p style="color:#e74c3c; margin-top:4px;"><strong>PIN :</strong> ${c.pin}</p>` : ""}
          ${canManageFullAdmin() ? `
            <div class="item-actions no-print">
              <button class="btn btn-edit" onclick="editChef('${c.id}')">✏️ Éditer</button>
              <button class="btn btn-danger" onclick="deleteChef('${c.id}')">❌ Retirer</button>
            </div>
          ` : ""}
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
    .filter((p) => currentUser.hasOverview || p.branche === "Toutes" || p.branche === currentUser.brancheAutorisee);

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
            <button class="btn btn-secondary" onclick="openPresDetails('${p.id}')">📄 Détails & Absents</button>
            ${canManageFullAdmin() ? `<button class="btn btn-danger" onclick="delPres('${p.id}')">❌</button>` : ""}
          </div>
        </div>
      `
    )
    .join("");
}

function renderMatriculeAssignTable() {
  const tbody = document.getElementById("matriculeAssignList");
  if (!tbody) return;

  if (db.scouts.length === 0) {
    tbody.innerHTML = "<tr><td colspan='4'>Aucun jeune inscrit.</td></tr>";
    return;
  }

  tbody.innerHTML = db.scouts
    .map((s) => {
      const statusHtml = s.cotisation
        ? `<span class="status-dot status-green"></span> Payée (2 500 FCFA)`
        : `<span class="status-dot status-red"></span> Non payée`;
      return `
        <tr>
          <td><strong>${s.nom}</strong> <small>(${s.branche})</small></td>
          <td>${statusHtml}</td>
          <td>
            <input type="text" id="mat_input_${s.id}" value="${s.mat || ""}" placeholder="${s.cotisation ? "Saisir matricule ASCCI" : "Cotisation requise"}" ${s.cotisation ? "" : "disabled"} style="width:190px;">
          </td>
          <td>
            <button class="btn btn-success" onclick="assignScoutMatricule('${s.id}')" ${s.cotisation ? "" : "disabled"}>Valider matricule</button>
          </td>
        </tr>
      `;
    })
    .join("");
}

function renderFinances() {
  if (!currentUser || !canManageFinancesAndMatricules()) return;
  const fList = document.getElementById("financeList");
  if (!fList) return;

  document.getElementById("fin_cot_mens_j").value = db.settings.cot_mens_j || 0;
  document.getElementById("fin_cot_mens_c").value = db.settings.cot_mens_c || 0;

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
      const isCotiJeune = f.type === "in" && f.cat === "Cotisation Annuelle" && amt === 2500;
      const motifCell = isCotiJeune
        ? `${f.motif}<br><small style="color:#555;">Part ASCCI : 2 085 FCFA • Part Caisse Groupe : 415 FCFA</small>`
        : f.motif;
      return `
        <tr>
          <td>${new Date(f.date).toLocaleDateString("fr-FR")}</td>
          <td class="${cColor}">${f.type === "in" ? "Entrée" : "Sortie"}</td>
          <td>${f.cat}</td>
          <td>${motifCell}</td>
          <td class="${cColor}">${sign} ${fPrix(amt)}</td>
          <td class="no-print"><button class="btn btn-danger" style="padding:4px 8px;" onclick="delFin('${f.id}')">❌</button></td>
        </tr>
      `;
    })
    .join("");

  const paidScoutsCount = db.scouts.filter((s) => s.cotisation).length;
  document.getElementById("f_tot_in").textContent = fPrix(tIn);
  document.getElementById("f_tot_out").textContent = fPrix(tOut);
  document.getElementById("f_solde").textContent = fPrix(tIn - tOut);
  document.getElementById("f_split_coti").innerHTML =
    `ASCCI : ${fPrix(paidScoutsCount * 2085)}<br>Caisse : ${fPrix(paidScoutsCount * 415)}`;

  renderMatriculeAssignTable();
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
            ${canManageFullAdmin() ? `<button class="btn btn-danger" onclick="delMat('${m.id}')">❌ Retirer</button>` : ""}
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
    if (s.parrain && (currentUser.hasOverview || s.branche === currentUser.brancheAutorisee)) {
      if (!mapP[s.parrain]) {
        mapP[s.parrain] = { tel: s.parrain_tel || "", scouts: [] };
      } else if (!mapP[s.parrain].tel && s.parrain_tel) {
        mapP[s.parrain].tel = s.parrain_tel;
      }
      mapP[s.parrain].scouts.push(s);
    }
  });

  const keys = Object.keys(mapP).sort();
  if (keys.length === 0) {
    paList.innerHTML = "<div class='card'><p>Aucun parrain ou marraine renseigné.</p></div>";
    return;
  }

  paList.innerHTML = keys
    .map((p) => {
      const entry = mapP[p];
      const lis = entry.scouts.map((s) => `<li>${s.nom} <small>(${s.branche})</small></li>`).join("");
      const contactHtml = entry.tel
        ? `<p><strong>Contact :</strong> <a href="tel:${entry.tel}">${entry.tel}</a> <a href="${getWaLink(entry.tel, `Bonjour ${p}, Groupe OBION — Saint Bernard d'Adiopodoumé.`)}" target="_blank" class="wa-btn">📱 WhatsApp</a></p>`
        : `<p><small style="color:#888;">Contact non renseigné</small></p>`;
      return `
        <div class="item-card" style="border-left-color:#e67e22;">
          <h3 style="color:#e67e22;">🤝 ${p}</h3>
          ${contactHtml}
          <p><strong>Filleul(s) :</strong></p>
          <ul style="margin-left:20px; font-size:0.9rem;">${lis}</ul>
        </div>
      `;
    })
    .join("");
}

function renderAll() {
  if (!currentUser) return;
  renderDashboard();
  renderProgramme();
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

function finishInitUI() {
  applyAppAndBrandLogos();
  populateLoginSelect();
  toggleProgCampFields();
  const loader = document.getElementById("loaderScreen");
  if (loader) loader.style.display = "none";

  const savedSession = sessionStorage.getItem(SESSION_KEY);
  if (savedSession) {
    try {
      const parsed = JSON.parse(savedSession);
      const match = getUsersList().find((u) => u.id === parsed.id);
      if (match) {
        currentUser = match;
        document.getElementById("appContainer").style.display = "block";
        applyRolePermissions();
        nav(currentActiveTab || "dashboard");
        return;
      }
    } catch (_) {}
  }

  document.getElementById("loginScreen").style.display = "flex";
}

async function initApp() {
  const todayStr = new Date().toISOString().slice(0, 10);
  const pDate = document.getElementById("p_date");
  const fDate = document.getElementById("f_date");
  if (pDate && !pDate.value) pDate.value = todayStr;
  if (fDate && !fDate.value) fDate.value = todayStr;

  normalizeDb();
  finishInitUI();

  try {
    const snap = await withTimeout(docRefObion.get(), 4000);
    if (snap && snap.exists) {
      db = snap.data();
      normalizeDb();
      applyAppAndBrandLogos();
      localStorage.setItem(BACKUP_KEY, JSON.stringify(db));
      populateLoginSelect();
      setSyncBadge("☁️ Synchronisé en ligne", "#27ae60");
      if (currentUser) {
        const refreshed = getUsersList().find((u) => u.id === currentUser.id);
        if (refreshed) {
          currentUser = refreshed;
          sessionStorage.setItem(SESSION_KEY, JSON.stringify(currentUser));
          applyRolePermissions();
        }
        renderAll();
      }
    } else {
      withTimeout(docRefObion.set(db, { merge: true }), 4000).catch(() => {});
    }
  } catch (err) {
    console.warn("Synchro cloud différée, mode local actif :", err);
    setSyncBadge("💾 Mode local actif", "#7f8c8d");
  }

  startRealtimeListener();
}

window.addEventListener("DOMContentLoaded", initApp);
