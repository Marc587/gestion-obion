
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

  message.innerHTML = `
    <h2>Gestion des jeunes</h2>
    <p>Enregistre et modifie les fiches des jeunes.</p>

    <form id="formJeune">
      <label>Nom et prénoms *</label>
      <input name="nom" required placeholder="Nom et prénoms"
        value="${jeune ? jeune.nom : ""}">

      <label>Date de naissance</label>
      <input name="naissance" type="date"
        value="${jeune ? jeune.naissance : ""}">

      <label>Branche *</label>
      <select name="branche" required>
        <option value="">Choisir une branche</option>
        <option ${jeune && jeune.branche === "Oisillons" ? "selected" : ""}>Oisillons</option>
        <option ${jeune && jeune.branche === "Louveteau" ? "selected" : ""}>Louveteau</option>
        <option ${jeune && jeune.branche === "Troupier" ? "selected" : ""}>Troupier</option>
        <option ${jeune && jeune.branche === "Cheminot" ? "selected" : ""}>Cheminot</option>
        <option ${jeune && jeune.branche === "Routier" ? "selected" : ""}>Routier</option>
      </select>

      <label>Contact du parent</label>
      <input name="parent" type="tel" placeholder="Numéro de téléphone"
        value="${jeune ? jeune.parent : ""}">

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
  } else {
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

      fiche.append(nom, details, parent, modifier, supprimer);
      liste.appendChild(fiche);
    });
  }

  document.getElementById("formJeune").addEventListener("submit", (event) => {
    event.preventDefault();

    const formulaire = new FormData(event.target);

    const nouvelleFiche = {
      nom: formulaire.get("nom").trim(),
      naissance: formulaire.get("naissance"),
      branche: formulaire.get("branche"),
      parent: formulaire.get("parent").trim()
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
