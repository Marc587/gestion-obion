
const message = document.getElementById("message");

let jeunes = JSON.parse(localStorage.getItem("obion_jeunes") || "[]");

function sauvegarder() {
  localStorage.setItem("obion_jeunes", JSON.stringify(jeunes));
}

function afficherJeunes() {
  message.innerHTML = `
    <h2>Gestion des jeunes</h2>
    <p>Enregistre les jeunes de ton groupe.</p>

    <form id="formJeune">
      <label>Nom et prénoms *</label>
      <input name="nom" required placeholder="Ex : Kouassi Jean">

      <label>Date de naissance</label>
      <input name="naissance" type="date">

      <label>Branche *</label>
      <select name="branche" required>
        <option value="">Choisir une branche</option>
        <option>Oisillons</option>
        <option>Louveteau</option>
        <option>Troupier</option>
        <option>Cheminot</option>
        <option>Routier</option>
      </select>

      <label>Contact du parent</label>
      <input name="parent" type="tel" placeholder="Numéro de téléphone">

      <button type="submit">Enregistrer le jeune</button>
    </form>

    <h3>Jeunes enregistrés : ${jeunes.length}</h3>
    <div id="listeJeunes"></div>
  `;

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

      const supprimer = document.createElement("button");
      supprimer.textContent = "Supprimer";
      supprimer.type = "button";

      supprimer.addEventListener("click", () => {
        if (confirm("Supprimer la fiche de " + jeune.nom + " ?")) {
          jeunes.splice(index, 1);
          sauvegarder();
          afficherJeunes();
        }
      });

      fiche.append(nom, details, parent, supprimer);
      liste.appendChild(fiche);
    });
  }

  document.getElementById("formJeune").addEventListener("submit", (event) => {
    event.preventDefault();

    const formulaire = new FormData(event.target);

    jeunes.push({
      nom: formulaire.get("nom").trim(),
      naissance: formulaire.get("naissance"),
      branche: formulaire.get("branche"),
      parent: formulaire.get("parent").trim()
    });

    sauvegarder();
    afficherJeunes();
  });
}

document.querySelectorAll("[data-name]").forEach((bouton) => {
  bouton.addEventListener("click", () => {
    const rubrique = bouton.dataset.name;

    if (rubrique === "Jeunes") {
      afficherJeunes();
    } else if (rubrique === "Accueil") {
      location.reload();
    } else {
      message.innerHTML = `
        <h2>${rubrique}</h2>
        <p>Cette rubrique sera activée progressivement.</p>
        <button onclick="afficherJeunes()">Retour aux jeunes</button>
      `;
    }

    window.scrollTo({
      top: document.body.scrollHeight,
      behavior: "smooth"
    });
  });
});
