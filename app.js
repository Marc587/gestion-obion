
const message = document.getElementById("message");

let jeunes = JSON.parse(localStorage.getItem("obion_jeunes") || "[]");
let jeuneEnModification = null;

function sauvegarder() {
  localStorage.setItem("obion_jeunes", JSON.stringify(jeunes));
}

function afficherJeunes() {
  const jeune = jeuneEnModification !== null
    ? jeunes[jeuneEnModification]
    : null;

  const valeur = (champ) => jeune ? (jeune[champ] || "") : "";

  message.innerHTML = `
    <h2>Gestion des jeunes</h2>
    <p>Fiches des jeunes et suivi de l'affiliation ASCCI.</p>

    <form id="formJeune">
      <label>Nom et prénoms *</label>
      <input name="nom" required placeholder="Nom et prénoms"
        value="${valeur("nom")}">

      <label>Date de naissance</label>
      <input name="naissance" type="date"
        value="${valeur("naissance")}">

      <label>Branche *</label>
      <select name="branche" required>
        <option value="">Choisir une branche</option>
        <option ${valeur("branche") === "Oisillons" ? "selected" : ""}>Oisillons</option>
        <option ${valeur("branche") === "Louveteau" ? "selected" : ""}>Louveteau</option>
        <option ${valeur("branche") === "Troupier" ? "selected" : ""}>Troupier</option>
        <option ${valeur("branche") === "Cheminot" ? "selected" : ""}>Cheminot</option>
        <option ${valeur("branche") === "Routier" ? "selected" : ""}>Routier</option>
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
      jeune.branche + " • " + (jeune.naissance || "Date non renseignée");

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
