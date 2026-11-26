const message = document.getElementById("message");

let jeunes = JSON.parse(localStorage.getItem("obion_jeunes") || "[]");
let jeuneEnModification = null;

const progressionsParBranche = {
  "Oisillons": [
    "Découverte",
    "Petit pas",
    "Aile déployée"
  ],
  "Louveteau": [
    "Patte tendre",
    "1re étoile",
    "2e étoile",
    "3e étoile"
  ],
  "Troupier": [
    "Aspirant / Pied tendre",
    "2e classe",
    "1re classe",
    "Brevet / Badge"
  ],
  "Cheminot": [
    "En route",
    "Compagnon de route",
    "Route / Engagement"
  ],
  "Routier": [
    "Novice / Aspirant",
    "Routier engagé",
    "Service communautaire"
  ]
};

function sauvegarder() {
  localStorage.setItem("obion_jeunes", JSON.stringify(jeunes));
}

function afficherJeunes() {
  const jeune = jeuneEnModification !== null
    ? jeunes[jeuneEnModification]
    : null;

  const valeur = (champ) => jeune ? (jeune[champ] || "") : "";
  const brancheActive = valeur("branche");
  const etapesBranche = progressionsParBranche[brancheActive] || [
    "En cours",
    "Validée"
  ];

  message.innerHTML = `
    <h2>Gestion des jeunes</h2>
    <p>Fiches des jeunes, progression scoute et suivi de l'affiliation ASCCI.</p>

    <form id="formJeune">
      <label>Nom et prénoms *</label>
      <input name="nom" required placeholder="Nom et prénoms"
        value="${valeur("nom")}">

      <label>Date de naissance</label>
      <input name="naissance" type="date"
        value="${valeur("naissance")}">

      <label>Branche *</label>
      <select name="branche" id="selectBrancheJeune" required>
        <option value="">Choisir une branche</option>
        <option ${valeur("branche") === "Oisillons" ? "selected" : ""}>Oisillons</option>
        <option ${valeur("branche") === "Louveteau" ? "selected" : ""}>Louveteau</option>
        <option ${valeur("branche") === "Troupier" ? "selected" : ""}>Troupier</option>
        <option ${valeur("branche") === "Cheminot" ? "selected" : ""}>Cheminot</option>
        <option ${valeur("branche") === "Routier" ? "selected" : ""}>Routier</option>
      </select>

      <label>Progression scoute</label>
      <select name="progression" id="selectProgressionJeune">
        <option value="">Non renseignée</option>
        ${etapesBranche.map((etape) => `
          <option value="${etape}" ${valeur("progression") === etape ? "selected" : ""}>
            ${etape}
          </option>
        `).join("")}
      </select>

      <label>Contact du parent</label>
      <input name="parent" type="tel"
        placeholder="Numéro de téléphone"
        value="${valeur("parent")}">

      <h3>Affiliation nationale ASCCI</h3>

      <label>Matricule ASCCI</label>
      <input name="matricule" placeholder="Matricule"
        value="${valeur("matricule")}">

      <label>Année d'affiliation</label>
      <input name="annee" type="number" min="2000" max="2100"
        placeholder="Ex : 2026"
        value="${valeur("annee")}">

      <label>Cotisation nationale</label>
      <select name="cotisation">
        <option value="Non payée"
          ${valeur("cotisation") === "Non payée" || !valeur("cotisation") ? "selected" : ""}>
          Non payée
        </option>
        <option value="Payée"
          ${valeur("cotisation") === "Payée" ? "selected" : ""}>
          Payée
        </option>
      </select>

      <label>Date de paiement</label>
      <input name="datePaiement" type="date"
        value="${valeur("datePaiement")}">

      <button type="submit">
        ${jeune ? "Enregistrer les modifications" : "Enregistrer le jeune"}
      </button>

      ${jeune ? '<button type="button" id="annulerModification">Annuler</button>' : ""}
    </form>

    <h3>Jeunes enregistrés : ${jeunes.length}</h3>
    <div id="listeJeunes"></div>
  `;

  document.getElementById("selectBrancheJeune").addEventListener("change", (event) => {
    const nouvelleBranche = event.target.value;
    const selectProg = document.getElementById("selectProgressionJeune");
    const etapes = progressionsParBranche[nouvelleBranche] || ["En cours", "Validée"];
    const valeurActuelle = selectProg.value;

    selectProg.innerHTML = `
      <option value="">Non renseignée</option>
      ${etapes.map((etape) => `
        <option value="${etape}" ${valeurActuelle === etape ? "selected" : ""}>
          ${etape}
        </option>
      `).join("")}
    `;
  });

  if (jeune) {
    document.getElementById("annulerModification").addEventListener("click", () => {
      jeuneEnModification = null;
      afficherJeunes();
    });
  }

  const liste = document.getElementById("listeJeunes");

  if (jeunes.length === 0) {
    liste.innerHTML = "<p>Aucun jeune enregistré pour le moment.</p>";
  }

  jeunes.forEach((jeune, index) => {
    const fiche = document.createElement("article");
    fiche.style.padding = "12px";
    fiche.style.margin = "10px 0";
    fiche.style.border = "1px solid #ddd";
    fiche.style.borderRadius = "10px";

    const nom = document.createElement("strong");
    nom.textContent = jeune.nom;

    const details = document.createElement("p");
    details.textContent =
      jeune.branche +
      " • Progression : " + (jeune.progression || "Non renseignée") +
      " • " + (jeune.naissance || "Date non renseignée");

    const parent = document.createElement("p");
    parent.textContent = "Parent : " + (jeune.parent || "Non renseigné");

    const affiliation = document.createElement("p");
    affiliation.textContent =
      "Matricule ASCCI : " + (jeune.matricule || "À renseigner") +
      " | Année : " + (jeune.annee || "Non renseignée");

    const paiement = document.createElement("p");
    paiement.textContent =
      "Cotisation nationale : " + (jeune.cotisation || "Non payée") +
      " | Date : " + (jeune.datePaiement || "Non renseignée");

    const modifier = document.createElement("button");
    modifier.textContent = "Modifier";
    modifier.type = "button";
    modifier.addEventListener("click", () => {
      jeuneEnModification = index;
      afficherJeunes();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });

    const supprimer = document.createElement("button");
    supprimer.textContent = "Supprimer";
    supprimer.type = "button";
    supprimer.addEventListener("click", () => {
      if (confirm("Supprimer la fiche de " + jeune.nom + " ?")) {
        jeunes.splice(index, 1);
        jeuneEnModification = null;
        sauvegarder();
        afficherJeunes();
      }
    });

    fiche.append(nom, details, parent, affiliation, paiement, modifier, supprimer);
    liste.appendChild(fiche);
  });

  document.getElementById("formJeune").addEventListener("submit", (event) => {
    event.preventDefault();

    const formulaire = new FormData(event.target);

    const nouvelleFiche = {
      nom: formulaire.get("nom").trim(),
      naissance: formulaire.get("naissance"),
      branche: formulaire.get("branche"),
      progression: formulaire.get("progression"),
      parent: formulaire.get("parent").trim(),
      matricule: formulaire.get("matricule").trim(),
      annee: formulaire.get("annee"),
      cotisation: formulaire.get("cotisation"),
      datePaiement: formulaire.get("datePaiement")
    };

    if (jeuneEnModification !== null) {
      jeunes[jeuneEnModification] = nouvelleFiche;
      jeuneEnModification = null;
    } else {
      jeunes.push(nouvelleFiche);
    }

    sauvegarder();
    afficherJeunes();
  });
}

document.querySelectorAll("[data-name]").forEach((bouton) => {
  bouton.addEventListener("click", () => {
    const rubrique = bouton.dataset.name;

    if (rubrique === "Jeunes") {
      jeuneEnModification = null;
      afficherJeunes();
    } else if (rubrique === "Présences") {
      afficherPresences();
    } else if (rubrique === "Cotisations") {
      afficherCotisationsObion();
    } else if (rubrique === "Chefs") {
      chefEnModification = null;
      afficherChefsObion();
    } else if (rubrique === "Activités") {
      activiteEnModification = null;
      afficherActivitesObion();
    } else if (rubrique === "Finance") {
      afficherFinanceObion();
    } else if (rubrique === "Accueil") {
      location.reload();
    } else {
      message.innerHTML = `
        <h2>${rubrique}</h2>
        <p>Cette rubrique sera activée progressivement.</p>
      `;
    }

    window.scrollTo({
      top: document.body.scrollHeight,
      behavior: "smooth"
    });
  });
});

let appelDate = new Date().toISOString().slice(0, 10);

let presences = JSON.parse(
  localStorage.getItem("obion_presences") || "{}"
);

function sauvegarderPresences() {
  localStorage.setItem("obion_presences", JSON.stringify(presences));
}

function afficherPresences() {
  if (jeunes.length === 0) {
    message.innerHTML = `
      <h2>Présences</h2>
      <p>Enregistre d'abord les jeunes dans la rubrique Jeunes.</p>
    `;
    return;
  }

  const appel = presences[appelDate] || {};

  message.innerHTML = `
    <h2>Gestion des présences</h2>

    <label>Date de la réunion</label>
    <input id="dateAppel" type="date" value="${appelDate}">

    <h3>Appel du ${appelDate}</h3>
    <div id="listeAppel"></div>

    <button id="enregistrerAppel">Enregistrer les présences</button>

    <h3>Historique des appels</h3>
    <div id="historiqueAppels"></div>
  `;

  document.getElementById("dateAppel").addEventListener("change", (event) => {
    appelDate = event.target.value;
    afficherPresences();
  });

  const liste = document.getElementById("listeAppel");

  jeunes.forEach((jeune, index) => {
    const ligne = document.createElement("div");
    ligne.style.padding = "10px";
    ligne.style.margin = "8px 0";
    ligne.style.border = "1px solid #ddd";
    ligne.style.borderRadius = "8px";

    const nom = document.createElement("strong");
    nom.textContent = jeune.nom + " — " + jeune.branche;

    const choix = document.createElement("select");
    choix.dataset.index = index;

    ["Présent", "Absent", "Absent justifié"].forEach((statut) => {
      const option = document.createElement("option");
      option.value = statut;
      option.textContent = statut;
      option.selected = (appel[index] || "Présent") === statut;
      choix.appendChild(option);
    });

    ligne.append(nom, document.createElement("br"), choix);
    liste.appendChild(ligne);
  });

  document.getElementById("enregistrerAppel").addEventListener("click", () => {
    const resultats = {};

    document.querySelectorAll("#listeAppel select").forEach((choix) => {
      resultats[choix.dataset.index] = choix.value;
    });

    presences[appelDate] = resultats;
    sauvegarderPresences();

    alert("Présences enregistrées pour le " + appelDate);
    afficherPresences();
  });

  const historique = document.getElementById("historiqueAppels");

  const dates = Object.keys(presences).sort().reverse();

  if (dates.length === 0) {
    historique.textContent = "Aucun appel enregistré.";
  } else {
    dates.forEach((date) => {
      const bouton = document.createElement("button");
      bouton.textContent = "Consulter l'appel du " + date;
      bouton.style.display = "block";
      bouton.style.margin = "6px 0";

      bouton.addEventListener("click", () => {
        appelDate = date;
        afficherPresences();
      });

      historique.appendChild(bouton);
    });
  }
}

let montantCotisationObion = Number(
  localStorage.getItem("obion_montant_cotisation") || 0
);

let paiementsObion = JSON.parse(
  localStorage.getItem("obion_paiements_cotisation") || "{}"
);

let moisCotisation = new Date().getMonth() + 1;
let anneeCotisation = new Date().getFullYear();

const nomsMoisObion = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"
];

function sauvegarderCotisationsObion() {
  localStorage.setItem(
    "obion_montant_cotisation",
    montantCotisationObion
  );

  localStorage.setItem(
    "obion_paiements_cotisation",
    JSON.stringify(paiementsObion)
  );
}

function afficherCotisationsObion() {
  const periode = anneeCotisation + "_" + moisCotisation;

  message.innerHTML = `
    <h2>Cotisations mensuelles</h2>

    <label>Montant mensuel par jeune (F CFA)</label>
    <input id="montantObion" type="number" min="0"
      value="${montantCotisationObion}">

    <button id="sauverMontantObion">Enregistrer le montant</button>

    <label>Mois à suivre</label>
    <select id="moisObion">
      ${nomsMoisObion.map((mois, index) => `
        <option value="${index + 1}"
          ${moisCotisation === index + 1 ? "selected" : ""}>
          ${mois}
        </option>
      `).join("")}
    </select>

    <label>Année</label>
    <input id="anneeObion" type="number" min="2020" max="2100"
      value="${anneeCotisation}">

    <h3>${nomsMoisObion[moisCotisation - 1]} ${anneeCotisation}</h3>
    <div id="listeCotisationsObion"></div>

    <button id="sauverPaiementsObion">Enregistrer les paiements du mois</button>

    <h3>Résumé du mois</h3>
    <p id="resumeCotisationsObion"></p>
  `;

  document.getElementById("moisObion").addEventListener("change", (event) => {
    moisCotisation = Number(event.target.value);
    afficherCotisationsObion();
  });

  document.getElementById("anneeObion").addEventListener("change", (event) => {
    const nouvelleAnnee = Number(event.target.value);

    if (nouvelleAnnee >= 2020 && nouvelleAnnee <= 2100) {
      anneeCotisation = nouvelleAnnee;
      afficherCotisationsObion();
    }
  });

  document.getElementById("sauverMontantObion").addEventListener("click", () => {
    const montant = Number(document.getElementById("montantObion").value);

    if (montant < 0 || !Number.isFinite(montant)) {
      alert("Montant invalide.");
      return;
    }

    montantCotisationObion = montant;
    sauvegarderCotisationsObion();
    afficherCotisationsObion();
  });

  const liste = document.getElementById("listeCotisationsObion");

  let totalRecu = 0;
  const totalDu = jeunes.length * montantCotisationObion;

  jeunes.forEach((jeune, index) => {
    const cle = periode + "_" + index;
    const dejaPaye = Number(paiementsObion[cle] || 0);

    totalRecu += dejaPaye;

    const ligne = document.createElement("div");
    ligne.style.padding = "10px";
    ligne.style.margin = "8px 0";
    ligne.style.border = "1px solid #ddd";
    ligne.style.borderRadius = "8px";

    const nom = document.createElement("strong");
    nom.textContent = jeune.nom + " — " + jeune.branche;

    const info = document.createElement("p");
    info.textContent =
      "Dû : " + montantCotisationObion +
      " F CFA | Payé : " + dejaPaye +
      " F CFA | Reste : " +
      Math.max(0, montantCotisationObion - dejaPaye) + " F CFA";

    const champ = document.createElement("input");
    champ.type = "number";
    champ.min = "0";
    champ.placeholder = "Total payé pour ce mois";
    champ.value = dejaPaye;
    champ.dataset.index = index;

    ligne.append(nom, info, champ);
    liste.appendChild(ligne);
  });

  document.getElementById("resumeCotisationsObion").textContent =
    "Total attendu : " + totalDu + " F CFA | " +
    "Total reçu : " + totalRecu + " F CFA | " +
    "Reste à recevoir : " + Math.max(0, totalDu - totalRecu) + " F CFA";

  document.getElementById("sauverPaiementsObion").addEventListener("click", () => {
    document.querySelectorAll("#listeCotisationsObion input").forEach((champ) => {
      const index = champ.dataset.index;
      const cle = periode + "_" + index;
      const montant = Number(champ.value);

      if (montant >= 0 && Number.isFinite(montant)) {
        paiementsObion[cle] = montant;
      }
    });

    sauvegarderCotisationsObion();
    afficherCotisationsObion();
    alert("Paiements du mois enregistrés.");
  });
}

let chefsObion = JSON.parse(
  localStorage.getItem("obion_chefs") || "[]"
);

let chefEnModification = null;

function sauvegarderChefsObion() {
  localStorage.setItem("obion_chefs", JSON.stringify(chefsObion));
}

function afficherChefsObion() {
  const chef = chefEnModification !== null
    ? chefsObion[chefEnModification]
    : null;

  const valeur = (champ) => chef ? (chef[champ] || "") : "";

  message.innerHTML = `
    <h2>Gestion des chefs</h2>

    <form id="formChef">
      <label>Nom et prénoms *</label>
      <input name="nom" required value="${valeur("nom")}">

      <label>Fonction *</label>
      <select name="fonction" required>
        <option value="">Choisir une fonction</option>
        <option ${valeur("fonction") === "Chef de Groupe" ? "selected" : ""}>Chef de Groupe</option>
        <option ${valeur("fonction") === "Chef d’Unité" ? "selected" : ""}>Chef d’Unité</option>
        <option ${valeur("fonction") === "Chef d’Unité Adjoint" ? "selected" : ""}>Chef d’Unité Adjoint</option>
        <option ${valeur("fonction") === "Chef d’Unité Assistant" ? "selected" : ""}>Chef d’Unité Assistant</option>
        <option ${valeur("fonction") === "Trésorier" ? "selected" : ""}>Trésorier</option>
      </select>

      <label>Branche ou unité</label>
      <select name="unite">
        <option value="">Choisir une unité</option>
        <option ${valeur("unite") === "Oisillons" ? "selected" : ""}>Oisillons</option>
        <option ${valeur("unite") === "Louveteau" ? "selected" : ""}>Louveteau</option>
        <option ${valeur("unite") === "Troupier" ? "selected" : ""}>Troupier</option>
        <option ${valeur("unite") === "Cheminot" ? "selected" : ""}>Cheminot</option>
        <option ${valeur("unite") === "Routier" ? "selected" : ""}>Routier</option>
      </select>

      <label>Matricule ASCCI</label>
      <input name="matricule" value="${valeur("matricule")}">

      <label>Contact téléphonique</label>
      <input name="contact" type="tel" value="${valeur("contact")}">

      <button type="submit">
        ${chef ? "Enregistrer les modifications" : "Ajouter le chef"}
      </button>

      ${chef ? '<button type="button" id="annulerChef">Annuler</button>' : ""}
    </form>

    <h3>Chefs enregistrés : ${chefsObion.length}</h3>
    <div id="listeChefsObion"></div>
  `;

  if (chef) {
    document.getElementById("annulerChef").addEventListener("click", () => {
      chefEnModification = null;
      afficherChefsObion();
    });
  }

  const liste = document.getElementById("listeChefsObion");

  chefsObion.forEach((chef, index) => {
    const fiche = document.createElement("article");
    fiche.style.padding = "12px";
    fiche.style.margin = "10px 0";
    fiche.style.border = "1px solid #ddd";
    fiche.style.borderRadius = "10px";

    const nom = document.createElement("strong");
    nom.textContent = chef.nom;

    const details = document.createElement("p");
    details.textContent = chef.fonction + " • " + (chef.unite || "Groupe");

    const matricule = document.createElement("p");
    matricule.textContent = "Matricule ASCCI : " + (chef.matricule || "À renseigner");

    const contact = document.createElement("p");
    contact.textContent = "Contact : " + (chef.contact || "Non renseigné");

    const modifier = document.createElement("button");
    modifier.textContent = "Modifier";
    modifier.type = "button";
    modifier.addEventListener("click", () => {
      chefEnModification = index;
      afficherChefsObion();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });

    const supprimer = document.createElement("button");
    supprimer.textContent = "Supprimer";
    supprimer.type = "button";
    supprimer.addEventListener("click", () => {
      if (confirm("Supprimer la fiche de " + chef.nom + " ?")) {
        chefsObion.splice(index, 1);
        chefEnModification = null;
        sauvegarderChefsObion();
        afficherChefsObion();
      }
    });

    fiche.append(nom, details, matricule, contact, modifier, supprimer);
    liste.appendChild(fiche);
  });

  document.getElementById("formChef").addEventListener("submit", (event) => {
    event.preventDefault();

    const formulaire = new FormData(event.target);

    const nouvelleFiche = {
      nom: formulaire.get("nom").trim(),
      fonction: formulaire.get("fonction"),
      unite: formulaire.get("unite"),
      matricule: formulaire.get("matricule").trim(),
      contact: formulaire.get("contact").trim()
    };

    if (chefEnModification !== null) {
      chefsObion[chefEnModification] = nouvelleFiche;
      chefEnModification = null;
    } else {
      chefsObion.push(nouvelleFiche);
    }

    sauvegarderChefsObion();
    afficherChefsObion();
  });
}

let activitesObion = JSON.parse(
  localStorage.getItem("obion_activites") || "[]"
);

let activiteEnModification = null;

function sauvegarderActivitesObion() {
  localStorage.setItem(
    "obion_activites",
    JSON.stringify(activitesObion)
  );
}

function afficherActivitesObion() {
  const branches = [
    "Oisillons",
    "Louveteau",
    "Troupier",
    "Cheminot",
    "Routier"
  ];

  const echapper = (texte) =>
    String(texte || "").replace(/[&<>"']/g, (caractere) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[caractere]);

  message.innerHTML = `
    <h2>Gestion des activités</h2>
    <p>Créer une activité, suivre les participations et gérer le budget.</p>

    <form id="formActivite">
      <label>Nom de l’activité *</label>
      <input name="titre" required placeholder="Ex. Sortie de groupe">

      <label>Date de l’activité *</label>
      <input name="date" type="date" required>

      <label>Branches concernées *</label>
      <div>
        ${branches.map((branche) => `
          <label style="display:block; margin:8px 0;">
            <input type="checkbox" name="branches" value="${branche}">
            ${branche}
          </label>
        `).join("")}
      </div>

      <label>Participation financière par jeune (F CFA)</label>
      <input name="montantJeune" type="number" min="0" value="0" required>

      <label>Participation financière par chef (F CFA)</label>
      <input name="montantChef" type="number" min="0" value="0" required>

      <label>Description</label>
      <textarea name="description" placeholder="Lieu, programme, informations..."></textarea>

      <button type="submit">Créer l’activité</button>
    </form>

    <hr>
    <h3>Activités enregistrées</h3>
    <div id="listeActivites"></div>
  `;

  const activiteModif =
    activiteEnModification !== null ? activitesObion[activiteEnModification] : null;

  if (activiteModif) {
    const formModif = document.getElementById("formActivite");
    formModif.querySelector('[name="titre"]').value = activiteModif.titre || "";
    formModif.querySelector('[name="date"]').value = activiteModif.date || "";
    formModif.querySelector('[name="montantJeune"]').value = activiteModif.montantJeune || 0;
    formModif.querySelector('[name="montantChef"]').value = activiteModif.montantChef || 0;
    formModif.querySelector('[name="description"]').value = activiteModif.description || "";

    formModif.querySelectorAll('[name="branches"]').forEach((caseBranche) => {
      caseBranche.checked = (activiteModif.branches || []).includes(caseBranche.value);
    });

    const boutonValider = formModif.querySelector('button[type="submit"]');
    boutonValider.textContent = "Enregistrer les modifications";

    const boutonAnnuler = document.createElement("button");
    boutonAnnuler.type = "button";
    boutonAnnuler.textContent = "Annuler la modification";
    boutonAnnuler.style.marginLeft = "8px";
    boutonAnnuler.addEventListener("click", () => {
      activiteEnModification = null;
      afficherActivitesObion();
    });
    boutonValider.insertAdjacentElement("afterend", boutonAnnuler);
  }

  document.getElementById("formActivite").addEventListener("submit", (event) => {
    event.preventDefault();

    const formulaire = new FormData(event.target);
    const branchesChoisies = formulaire.getAll("branches");

    if (branchesChoisies.length === 0) {
      alert("Choisis au moins une branche.");
      return;
    }

    const participants = jeunes
      .filter((jeune) => branchesChoisies.includes(jeune.branche))
      .map((jeune) => ({
        nom: jeune.nom,
        branche: jeune.branche,
        paye: 0
      }));

    const nouvelleActivite = {
      id: Date.now(),
      titre: formulaire.get("titre").trim(),
      date: formulaire.get("date"),
      montantJeune: Number(formulaire.get("montantJeune") || 0),
      montantChef: Number(formulaire.get("montantChef") || 0),
      branches: branchesChoisies,
      description: formulaire.get("description").trim(),
      participants: participants,
      chefsParticipants: chefsObion.map((chef) => ({
        nom: chef.nom,
        fonction: chef.fonction,
        unite: chef.unite || "Groupe",
        paye: 0
      })),
      depenses: []
    };

    if (activiteEnModification !== null && activitesObion[activiteEnModification]) {
      const ancienne = activitesObion[activiteEnModification];
      const anciensJeunes = ancienne.participants || [];
      const anciensChefs = ancienne.chefsParticipants || [];

      nouvelleActivite.id = ancienne.id;
      nouvelleActivite.depenses = Array.isArray(ancienne.depenses) ? ancienne.depenses : [];

      nouvelleActivite.participants = nouvelleActivite.participants.map((p) => {
        const trouve = anciensJeunes.find((aj) => aj.nom === p.nom && aj.branche === p.branche);
        return trouve ? { ...p, paye: Number(trouve.paye || 0) } : p;
      });

      nouvelleActivite.chefsParticipants = nouvelleActivite.chefsParticipants.map((c) => {
        const trouve = anciensChefs.find((ac) => ac.nom === c.nom);
        return trouve ? { ...c, paye: Number(trouve.paye || 0) } : c;
      });

      activitesObion[activiteEnModification] = nouvelleActivite;
      activiteEnModification = null;
    } else {
      activitesObion.push(nouvelleActivite);
    }

    sauvegarderActivitesObion();
    afficherActivitesObion();
  });

  const liste = document.getElementById("listeActivites");

  if (activitesObion.length === 0) {
    liste.innerHTML = "<p>Aucune activité créée pour le moment.</p>";
    return;
  }

  liste.innerHTML = activitesObion.map((activite, indexActivite) => {
    const listeJeunes = activite.participants || [];
    const listeChefs = activite.chefsParticipants || [];

    const montantDuJeunes = listeJeunes.length * Number(activite.montantJeune || 0);
    const montantPayeJeunes = listeJeunes.reduce(
      (total, participant) => total + Number(participant.paye || 0),
      0
    );

    const montantDuChefs = listeChefs.length * Number(activite.montantChef || 0);
    const montantPayeChefs = listeChefs.reduce(
      (total, chef) => total + Number(chef.paye || 0),
      0
    );

    const montantDu = montantDuJeunes + montantDuChefs;
    const montantPaye = montantPayeJeunes + montantPayeChefs;
    const reste = Math.max(0, montantDu - montantPaye);

    const listeDepenses = activite.depenses || [];
    const totalDepenses = listeDepenses.reduce(
      (total, depense) => total + Number(depense.montant || 0),
      0
    );

    const soldeNet = montantPaye - totalDepenses;

    return `
      <div style="border:1px solid #ddd; padding:12px; margin:12px 0; border-radius:8px;">
        <h3>${echapper(activite.titre)}</h3>
        <p><strong>Date :</strong> ${echapper(activite.date)}</p>
        <p><strong>Branches :</strong> ${activite.branches.map(echapper).join(", ")}</p>

        <p><strong>Jeunes inscrits :</strong> ${listeJeunes.length} | <strong>Chefs inscrits :</strong> ${listeChefs.length}</p>
        <p><strong>Total prévu :</strong> ${montantDu.toLocaleString("fr-FR")} F CFA</p>
        <p><strong>Total payé :</strong> ${montantPaye.toLocaleString("fr-FR")} F CFA</p>
        <p><strong>Reste à recevoir :</strong> ${reste.toLocaleString("fr-FR")} F CFA</p>
        <p><strong>Total dépenses :</strong> ${totalDepenses.toLocaleString("fr-FR")} F CFA</p>
        <p><strong>Solde net (Encaissé - Dépenses) :</strong> ${soldeNet.toLocaleString("fr-FR")} F CFA</p>

        <details>
          <summary>Jeunes participants et paiements</summary>
          ${listeJeunes.length === 0 ? "<p>Aucun jeune inscrit.</p>" : listeJeunes.map((participant, indexParticipant) => {
            const du = Number(activite.montantJeune || 0);
            const paye = Number(participant.paye || 0);
            const solde = Math.max(0, du - paye);

            return `
              <div style="border-top:1px solid #eee; padding:8px 0;">
                <strong>${echapper(participant.nom)}</strong>
                <p>${echapper(participant.branche)}</p>
                <p>À payer : ${du.toLocaleString("fr-FR")} F CFA</p>
                <label>Montant payé (F CFA)</label>
                <input
                  type="number"
                  min="0"
                  max="${du}"
                  value="${paye}"
                  data-activite="${indexActivite}"
                  data-participant="${indexParticipant}"
                  class="champPaiementActivite"
                >
                <p>Reste : ${solde.toLocaleString("fr-FR")} F CFA</p>
              </div>
            `;
          }).join("")}
        </details>

        <details style="margin-top:8px;">
          <summary>Chefs participants et paiements</summary>
          ${listeChefs.length === 0 ? "<p>Aucun chef inscrit.</p>" : listeChefs.map((chef, indexChef) => {
            const duChef = Number(activite.montantChef || 0);
            const payeChef = Number(chef.paye || 0);
            const soldeChef = Math.max(0, duChef - payeChef);

            return `
              <div style="border-top:1px solid #eee; padding:8px 0;">
                <strong>${echapper(chef.nom)}</strong>
                <p>${echapper(chef.fonction)} • ${echapper(chef.unite || "Groupe")}</p>
                <p>À payer : ${duChef.toLocaleString("fr-FR")} F CFA</p>
                <label>Montant payé par le chef (F CFA)</label>
                <input
                  type="number"
                  min="0"
                  max="${duChef}"
                  value="${payeChef}"
                  data-activite="${indexActivite}"
                  data-chef="${indexChef}"
                  class="champPaiementChefActivite"
                >
                <p>Reste : ${soldeChef.toLocaleString("fr-FR")} F CFA</p>
              </div>
            `;
          }).join("")}
        </details>

        <details style="margin-top:8px;">
          <summary>Dépenses de l’activité (${totalDepenses.toLocaleString("fr-FR")} F CFA)</summary>
          <div style="padding:8px 0;">
            <input
              type="text"
              placeholder="Libellé (ex. Transport, eau, goûter)"
              id="libelleDepense_${indexActivite}"
            >
            <input
              type="number"
              min="0"
              placeholder="Montant (F CFA)"
              id="montantDepense_${indexActivite}"
            >
            <button
              type="button"
              class="btnAjouterDepense"
              data-index="${indexActivite}"
            >Ajouter la dépense</button>
          </div>
          ${listeDepenses.length === 0
            ? "<p>Aucune dépense enregistrée.</p>"
            : listeDepenses.map((depense, indexDepense) => `
              <div style="border-top:1px solid #eee; padding:6px 0;">
                <strong>${echapper(depense.libelle)}</strong> : ${Number(depense.montant || 0).toLocaleString("fr-FR")} F CFA
                <button
                  type="button"
                  class="btnSupprimerDepense"
                  data-activite="${indexActivite}"
                  data-depense="${indexDepense}"
                  style="margin-left:8px;"
                >Supprimer</button>
              </div>
            `).join("")}
        </details>

        <p>${echapper(activite.description)}</p>
        <button type="button" class="btnModifierActivite" data-index="${indexActivite}">Modifier l’activité</button>
        <button type="button" class="btnSupprimerActivite" data-index="${indexActivite}">Supprimer l’activité</button>
      </div>
    `;
  }).join("");

  document.querySelectorAll(".btnModifierActivite").forEach((bouton) => {
    bouton.addEventListener("click", () => {
      activiteEnModification = Number(bouton.dataset.index);
      afficherActivitesObion();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });

  document.querySelectorAll(".btnSupprimerActivite").forEach((bouton) => {
    bouton.addEventListener("click", () => {
      const indexActivite = Number(bouton.dataset.index);
      const activiteCible = activitesObion[indexActivite];

      if (!activiteCible) {
        return;
      }

      if (confirm("Supprimer l’activité « " + activiteCible.titre + " » ?")) {
        activitesObion.splice(indexActivite, 1);
        sauvegarderActivitesObion();
        afficherActivitesObion();
      }
    });
  });

  document.querySelectorAll(".btnAjouterDepense").forEach((bouton) => {
    bouton.addEventListener("click", () => {
      const indexActivite = Number(bouton.dataset.index);
      const champLibelle = document.getElementById("libelleDepense_" + indexActivite);
      const champMontant = document.getElementById("montantDepense_" + indexActivite);

      const libelle = champLibelle ? champLibelle.value.trim() : "";
      const montant = champMontant ? Number(champMontant.value) : 0;

      if (!libelle) {
        alert("Indique un libellé pour la dépense.");
        return;
      }

      if (!Number.isFinite(montant) || montant <= 0) {
        alert("Indique un montant supérieur à 0 F CFA.");
        return;
      }

      if (!Array.isArray(activitesObion[indexActivite].depenses)) {
        activitesObion[indexActivite].depenses = [];
      }

      activitesObion[indexActivite].depenses.push({
        libelle: libelle,
        montant: montant
      });

      sauvegarderActivitesObion();
      afficherActivitesObion();
    });
  });

  document.querySelectorAll(".btnSupprimerDepense").forEach((bouton) => {
    bouton.addEventListener("click", () => {
      const indexActivite = Number(bouton.dataset.activite);
      const indexDepense = Number(bouton.dataset.depense);
      const listeDepenses = activitesObion[indexActivite]?.depenses || [];

      if (!listeDepenses[indexDepense]) {
        return;
      }

      listeDepenses.splice(indexDepense, 1);
      sauvegarderActivitesObion();
      afficherActivitesObion();
    });
  });

  document.querySelectorAll(".champPaiementActivite").forEach((champ) => {
    champ.addEventListener("change", () => {
      const indexActivite = Number(champ.dataset.activite);
      const indexParticipant = Number(champ.dataset.participant);
      const montantDu = Number(activitesObion[indexActivite].montantJeune || 0);

      let montant = Number(champ.value || 0);
      montant = Math.max(0, Math.min(montant, montantDu));

      activitesObion[indexActivite].participants[indexParticipant].paye = montant;

      sauvegarderActivitesObion();
      afficherActivitesObion();
    });
  });

  document.querySelectorAll(".champPaiementChefActivite").forEach((champ) => {
    champ.addEventListener("change", () => {
      const indexActivite = Number(champ.dataset.activite);
      const indexChef = Number(champ.dataset.chef);
      const montantDuChef = Number(activitesObion[indexActivite].montantChef || 0);

      let montant = Number(champ.value || 0);
      montant = Math.max(0, Math.min(montant, montantDuChef));

      if (!Array.isArray(activitesObion[indexActivite].chefsParticipants)) {
        activitesObion[indexActivite].chefsParticipants = [];
      }

      activitesObion[indexActivite].chefsParticipants[indexChef].paye = montant;

      sauvegarderActivitesObion();
      afficherActivitesObion();
    });
  });
}

function afficherFinanceObion() {
  const periodeActuelle = anneeCotisation + "_" + moisCotisation;
  const totalCotisationsAttendues = jeunes.length * montantCotisationObion;
  const totalCotisationsRecues = jeunes.reduce((somme, _, index) => {
    return somme + Number(paiementsObion[periodeActuelle + "_" + index] || 0);
  }, 0);

  let totalEncaisseActivites = 0;
  let totalDepensesActivites = 0;

  activitesObion.forEach((activite) => {
    const payeJeunes = (activite.participants || []).reduce(
      (somme, p) => somme + Number(p.paye || 0),
      0
    );
    const payeChefs = (activite.chefsParticipants || []).reduce(
      (somme, c) => somme + Number(c.paye || 0),
      0
    );
    const depenses = (activite.depenses || []).reduce(
      (somme, d) => somme + Number(d.montant || 0),
      0
    );

    totalEncaisseActivites += payeJeunes + payeChefs;
    totalDepensesActivites += depenses;
  });

  const soldeActivites = totalEncaisseActivites - totalDepensesActivites;
  const totalGlobalEncaisse = totalCotisationsRecues + totalEncaisseActivites;
  const soldeGlobalEstime = totalGlobalEncaisse - totalDepensesActivites;

  message.innerHTML = `
    <h2>Finance — Groupe Obion</h2>
    <p>Vue d'ensemble des cotisations mensuelles et des budgets d'activités.</p>

    <h3>Cotisations (${nomsMoisObion[moisCotisation - 1]} ${anneeCotisation})</h3>
    <p><strong>Attendu :</strong> ${totalCotisationsAttendues.toLocaleString("fr-FR")} F CFA</p>
    <p><strong>Reçu :</strong> ${totalCotisationsRecues.toLocaleString("fr-FR")} F CFA</p>

    <h3>Activités (${activitesObion.length})</h3>
    <p><strong>Encaissé :</strong> ${totalEncaisseActivites.toLocaleString("fr-FR")} F CFA</p>
    <p><strong>Dépenses :</strong> ${totalDepensesActivites.toLocaleString("fr-FR")} F CFA</p>
    <p><strong>Solde activités :</strong> ${soldeActivites.toLocaleString("fr-FR")} F CFA</p>

    <h3>Bilan global</h3>
    <p><strong>Total encaissé (cotisations du mois + activités) :</strong> ${totalGlobalEncaisse.toLocaleString("fr-FR")} F CFA</p>
    <p><strong>Solde global estimé (après dépenses activités) :</strong> ${soldeGlobalEstime.toLocaleString("fr-FR")} F CFA</p>
  `;
}
