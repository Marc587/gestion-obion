<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>SCOUT MANAGER — Groupe OBION</title>
  <link rel="icon" href="./logo-app.jpg" />
  <link rel="stylesheet" href="./style.css" />
  <script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>
</head>
<body>
  <!-- ÉCRAN DE CONNEXION -->
  <section id="loginScreen" class="login-wrap">
    <div class="login-card">
      <div class="brand-head">
        <img src="./logo-app.jpg" alt="Logo Groupe OBION" class="logo-sm" onerror="this.style.display='none'" />
        <div>
          <h1>ERP Groupe OBION</h1>
          <p class="muted">Gestion scoute, cotisations, présences &amp; communication terrain</p>
        </div>
      </div>

      <form id="loginForm" onsubmit="handleLogin(event)">
        <div class="form-group">
          <label for="emailInput">Adresse e-mail personnelle</label>
          <input type="email" id="emailInput" autocomplete="username" placeholder="nom@exemple.com" required />
        </div>
        <div class="form-group">
          <label for="passwordInput">Mot de passe</label>
          <input type="password" id="passwordInput" autocomplete="current-password" minlength="8" required />
        </div>
        <p class="hint">Chaque responsable doit utiliser son propre compte. Ne partage pas ton mot de passe.</p>
        <button type="submit" class="btn btn-primary btn-block">Se connecter</button>
        <p id="loginError" class="error-text" role="alert" aria-live="polite"></p>
      </form>
    </div>
  </section>

  <!-- APPLICATION PRINCIPALE -->
  <div id="appShell" class="app-shell" style="display:none;">
    <header class="topbar no-print">
      <div class="topbar-left">
        <img id="headerLogoApp" src="./logo-app.jpg" alt="OBION" class="logo-sm" onerror="this.style.display='none'" />
        <div>
          <div class="app-title">Groupe OBION — ERP</div>
          <div id="userBadgeLine" class="muted small"></div>
        </div>
      </div>

      <div class="topbar-right">
        <span id="syncStatusBadge" class="badge badge-info">Synchronisé</span>
        <button type="button" class="btn btn-sm btn-secondary" onclick="exportBackupJson()">Sauvegarde JSON</button>
        <button type="button" class="btn btn-sm btn-danger" onclick="logout()">Déconnexion</button>
      </div>
    </header>

    <nav class="tabs no-print" aria-label="Navigation principale">
      <button type="button" class="tab-btn active" data-tab="dashboard" onclick="switchTab('dashboard')">Tableau de bord</button>
      <button type="button" class="tab-btn" data-tab="effectifs" onclick="switchTab('effectifs')">Effectifs &amp; Présences</button>
      <button type="button" class="tab-btn" data-tab="finances" onclick="switchTab('finances')">Cotisations &amp; Reçus</button>
      <button type="button" class="tab-btn" data-tab="activites" onclick="switchTab('activites')">Activités &amp; Programme</button>
      <button type="button" class="tab-btn" data-tab="parents" onclick="switchTab('parents')">Infos parents</button>
      <button type="button" class="tab-btn" data-tab="gestion" onclick="switchTab('gestion')">Gestion complète</button>
      <button type="button" class="tab-btn" data-tab="parametres" onclick="switchTab('parametres')">Paramètres</button>
    </nav>

    <main class="container">
      <!-- BANDEAU CENTRALISÉ "À TRAITER MAINTENANT" -->
      <section class="card action-center no-print">
        <div class="card-header-row">
          <div>
            <h2>À traiter maintenant</h2>
            <p class="muted small">Alertes J-14, rappels programme, 3 absences consécutives &amp; réunions/activités CU</p>
          </div>
          <button type="button" class="btn btn-sm btn-secondary" onclick="toggleActionCenter()">Réduire / Ouvrir</button>
        </div>
        <div id="smartRemindersBox" class="mt-2"></div>
      </section>

      <!-- ONGLET 1 : TABLEAU DE BORD -->
      <section id="tab-dashboard" class="tab-panel active">
        <div class="stats-grid" id="dashboardStats"></div>

        <div class="grid-2 mt-3">
          <div class="card">
            <h3>Bilan par branche</h3>
            <div id="branchSummaryBox" class="mt-2"></div>
          </div>
          <div class="card">
            <h3>Suivi éducatif — 3 absences consécutives</h3>
            <p class="muted small">Rencontre parents conseillée après 3 réunions ou activités manquées de suite.</p>
            <div id="absencesAlertsBox" class="mt-2"></div>
          </div>
        </div>

        <div class="card mt-3 no-print">
          <h3>Journal récent des messages &amp; actions</h3>
          <div id="recentLogsBox" class="mt-2"></div>
        </div>
      </section>

      <!-- ONGLET 2 : EFFECTIFS & PRÉSENCES -->
      <section id="tab-effectifs" class="tab-panel">
        <div class="card no-print">
          <div class="card-header-row">
            <h3>Ajouter un jeune</h3>
            <button type="button" class="btn btn-sm btn-secondary" onclick="exportScoutsCsv()">Export CSV</button>
          </div>
          <form id="addScoutForm" onsubmit="addScout(event)" class="form-grid-4 mt-2">
            <input type="text" id="sc_prenom" placeholder="Prénom" required />
            <input type="text" id="sc_nom" placeholder="Nom" required />
            <input type="text" id="sc_matricule" placeholder="Matricule (cotisation annuelle)" />
            <select id="sc_branche" required>
              <option value="Oisillon">Oisillon</option>
              <option value="Meute">Meute</option>
              <option value="Troupe">Troupe</option>
              <option value="Chemin">Chemin</option>
              <option value="Route">Route</option>
            </select>
            <input type="text" id="sc_parent_nom" placeholder="Nom parent / tuteur" />
            <input type="tel" id="sc_parent_tel" placeholder="Tél WhatsApp parent (ex: 0700000000)" />
            <input type="text" id="sc_allergies" placeholder="Allergies / santé (optionnel)" />
            <select id="sc_tenue" aria-label="État de la tenue scoute">
              <option value="aucune">Tenue : pas encore</option>
              <option value="confection">Tenue en confection</option>
              <option value="partielle">Tenue partielle</option>
              <option value="complete">Tenue complète</option>
            </select>
            <button type="submit" class="btn btn-primary">Ajouter</button>
          </form>
        </div>

        <div class="card mt-3">
          <div class="card-header-row no-print">
            <h3>Pointer une séance / réunion / activité</h3>
            <div class="inline-controls">
              <input type="date" id="presenceDateInput" />
              <select id="presenceBranchFilter" onchange="renderEffectifsAndPresences()">
                <option value="Toutes">Toutes branches</option>
                <option value="Oisillon">Oisillon</option>
                <option value="Meute">Meute</option>
                <option value="Troupe">Troupe</option>
                <option value="Chemin">Chemin</option>
                <option value="Route">Route</option>
              </select>
            </div>
          </div>
          <div id="tenueSummaryBox" class="mt-2"></div>
          <div id="scoutsListBox" class="mt-2"></div>
        </div>
      </section>

      <!-- ONGLET 3 : COTISATIONS & REÇUS -->
      <section id="tab-finances" class="tab-panel">
        <div class="card no-print">
          <div class="card-header-row">
            <h3>Suivi des cotisations (Jeunes &amp; Chefs d'Unité)</h3>
            <div class="inline-controls">
              <select id="cotTargetGroupSelect" onchange="renderCotisationsSuivi()">
                <option value="all">Jeunes &amp; Chefs d'Unité</option>
                <option value="scout">Jeunes uniquement</option>
                <option value="chef">Chefs d'Unité uniquement</option>
              </select>
              <select id="cotTypeSelect" onchange="renderCotisationsSuivi()">
                <option value="annuelle">Cotisation annuelle (avec matricule)</option>
                <option value="mensuelle">Cotisation mensuelle</option>
              </select>
              <label class="checkbox-inline">
                <input type="checkbox" id="includeWaveInReminder" checked onchange="renderCotisationsSuivi()" />
                Inclure lien Wave Business
              </label>
            </div>
          </div>

          <div class="inline-controls mt-2">
            <input type="text" id="newCustomCotLabel" placeholder="Nouvelle cotisation ponctuelle (ex: Camp Pâques)" />
            <input type="number" id="newCustomCotAmount" placeholder="Montant (FCFA)" min="0" />
            <button type="button" class="btn btn-sm btn-primary" onclick="addCustomCotisation()">Créer cotisation</button>
          </div>

          <div id="cotisationsTableBox" class="mt-3"></div>
        </div>

        <div class="card mt-3">
          <h3>Émission de reçu officiel</h3>
          <form id="receiptForm" onsubmit="generateReceipt(event)" class="form-grid-4 mt-2 no-print">
            <select id="rc_scout" onchange="prefillReceiptFromScout()">
              <option value="">-- Sélectionner un jeune (optionnel) --</option>
            </select>
            <input type="text" id="rc_numero" placeholder="N° Reçu (auto si vide)" />
            <input type="date" id="rc_date" required />
            <input type="number" id="rc_montant" placeholder="Montant FCFA" min="0" required />
            <input type="text" id="rc_motif" placeholder="Motif (ex: Cotisation annuelle)" required />
            <input type="text" id="rc_detail" placeholder="Bénéficiaire / Matricule / Détail" />
            <button type="submit" class="btn btn-primary">Générer le reçu</button>
            <div class="actions-row">
              <button type="button" class="btn btn-secondary" onclick="printReceiptCard()">Imprimer</button>
              <button type="button" class="btn btn-success" onclick="sendCurrentReceiptByWhatsApp()">WhatsApp</button>
            </div>
          </form>

          <div id="printableReceiptCard" class="receipt-card mt-3">
            <p class="muted">Aucun reçu généré pour le moment.</p>
          </div>
        </div>
      </section>

      <!-- ONGLET 4 : ACTIVITÉS, RAPPELS CU & PROGRAMME -->
      <section id="tab-activites" class="tab-panel">
        <div class="grid-2">
          <div class="card no-print">
            <h3>Nouvelle activité / réunion</h3>
            <form id="addActivityForm" onsubmit="addActivity(event)" class="form-stack mt-2">
              <input type="text" id="act_titre" placeholder="Titre (ex: Réunion maîtrise CU, Sortie forêt)" required />
              <input type="date" id="act_date" required />
              <input type="date" id="act_deadline" title="Date limite de paiement / participation" />
              <select id="act_branche">
                <option value="Toutes">Toutes branches</option>
                <option value="Oisillon">Oisillon</option>
                <option value="Meute">Meute</option>
                <option value="Troupe">Troupe</option>
                <option value="Chemin">Chemin</option>
                <option value="Route">Route</option>
              </select>
              <input type="text" id="act_lieu" placeholder="Lieu" />
              <label class="checkbox-inline">
                <input type="checkbox" id="act_for_cu" checked />
                Concerne / nécessite rappel aux Chefs d'Unité (CU)
              </label>
              <button type="submit" class="btn btn-primary">Enregistrer l'activité</button>
            </form>
          </div>

          <div class="card no-print">
            <h3>Programme manuel (rappels info parents)</h3>
            <form id="addProgramForm" onsubmit="addProgramEvent(event)" class="form-stack mt-2">
              <input type="text" id="prog_titre" placeholder="Événement du programme (ex: Camp de Noël)" required />
              <input type="date" id="prog_date" required />
              <input type="number" id="prog_rappel_jours" value="7" min="1" max="30" placeholder="Rappeler X jours avant" />
              <select id="prog_branche">
                <option value="Toutes">Toutes branches</option>
                <option value="Oisillon">Oisillon</option>
                <option value="Meute">Meute</option>
                <option value="Troupe">Troupe</option>
                <option value="Chemin">Chemin</option>
                <option value="Route">Route</option>
              </select>
              <input type="text" id="prog_details" placeholder="Infos clés pour les parents" />
              <button type="submit" class="btn btn-primary">Ajouter au programme</button>
            </form>
          </div>
        </div>

        <div class="card mt-3">
          <div class="card-header-row"><h3>Activités &amp; rappels Chefs d'Unité</h3><div class="actions-row no-print"><button type="button" class="btn btn-sm btn-secondary" onclick="exportActivitiesCsv()">Exporter CSV</button><button type="button" class="btn btn-sm btn-secondary" onclick="printActivitiesReport()">Imprimer / PDF</button></div></div>
          <div id="activitiesListBox" class="mt-2"></div>
        </div>

        <div class="card mt-3">
          <div class="card-header-row"><h3>Événements du programme</h3><div class="actions-row no-print"><button type="button" class="btn btn-sm btn-secondary" onclick="exportProgramCsv()">Exporter CSV</button><button type="button" class="btn btn-sm btn-secondary" onclick="printProgramReport()">Imprimer / PDF</button></div></div>
          <div id="programListBox" class="mt-2"></div>
        </div>
      </section>

      <!-- ONGLET COMMUNICATION PARENTS -->
      <section id="tab-parents" class="tab-panel">
        <div class="page-intro">
          <div><span class="eyebrow">COMMUNICATION</span><h2>Informer les parents</h2><p class="muted">Prépare un message, puis ouvre chaque conversation WhatsApp pour l’envoyer manuellement.</p></div>
          <span class="soft-pill">WhatsApp sans API</span>
        </div>
        <div class="card no-print">
          <form id="parentBroadcastForm" onsubmit="prepareParentBroadcast(event)" class="form-stack">
            <div class="form-grid-3">
              <input type="text" id="parent_msg_titre" placeholder="Objet (ex. Camp de Noël)" required />
              <select id="parent_msg_branche">
                <option value="Toutes">Tous les parents</option>
                <option value="Oisillon">Oisillon</option><option value="Meute">Meute</option><option value="Troupe">Troupe</option><option value="Chemin">Chemin</option><option value="Route">Route</option>
              </select>
              <input type="date" id="parent_msg_date" aria-label="Date de l'activité (facultatif)" />
            </div>
            <textarea id="parent_msg_contenu" rows="5" placeholder="Écris ici les informations : lieu, tenue, frais, heure, cotisation…" required></textarea>
            <button type="submit" class="btn btn-primary">Préparer les messages WhatsApp</button>
          </form>
          <p class="hint mt-2">L’application ne peut pas envoyer à ta place ni confirmer la livraison. Pour chaque parent, appuie sur « Ouvrir WhatsApp », puis sur « Envoyer » dans WhatsApp.</p>
        </div>
        <div class="card mt-3">
          <div class="card-header-row"><h3>Parents à contacter</h3><span id="parentMessageCount" class="soft-pill">Aucun message préparé</span></div>
          <div id="parentMessageRecipients" class="recipient-list mt-2"><p class="muted">Prépare un message pour afficher la liste des parents concernés.</p></div>
        </div>
      </section>


      <!-- MODULES COMPLEMENTAIRES : DOSSIERS, PROGRESSION, FINANCES ACTIVITES -->
      <section id="tab-gestion" class="tab-panel">
        <div class="page-intro"><div><span class="eyebrow">SCOUT MANAGER — OBION</span><h2>Gestion complète du groupe</h2><p class="muted">Dossiers, chefs, progression, passages d’unité, justificatifs et finances d’activités.</p></div><div class="actions-row no-print"><button class="btn btn-sm btn-secondary" onclick="exportAdvancedCsv()">Exporter les modules CSV</button><button class="btn btn-sm btn-secondary" onclick="printAdvancedReport()">Imprimer le bilan</button></div></div>
        <div class="alert-item alert-warning"><div><strong>Protection des données des mineurs</strong><br><span class="small">Cette version enrichit la gestion interne. L’espace parent avec comptes individuels et accès strictement limité nécessite des règles Firestore séparées par dossier avant ouverture aux parents. Ne partage pas le compte chef.</span></div></div>
        <div class="grid-2 mt-3">
          <div class="card"><h3>Fiche complémentaire d’un jeune</h3><form class="form-stack mt-2" onsubmit="saveScoutExtra(event)">
            <select id="gx_scout" required><option value="">Choisir un jeune</option></select>
            <input id="gx_dob" type="date" aria-label="Date de naissance"/><input id="gx_matricule" placeholder="Matricule ASCCI actuel"/><input id="gx_parent2" placeholder="Téléphone secondaire / autre responsable"/><input id="gx_address" placeholder="Adresse / quartier"/><input id="gx_docs" placeholder="Documents reçus (liste courte)"/><textarea id="gx_notes" rows="3" placeholder="Notes administratives non médicales"></textarea><button class="btn btn-primary" type="submit">Enregistrer la fiche</button>
          </form></div>
          <div class="card"><h3>Ajouter / gérer un Chef d’Unité</h3><form class="form-stack mt-2" onsubmit="addLeaderFull(event)"><input id="gl_nom" placeholder="Nom et prénoms" required/><select id="gl_unite"><option>Routier</option><option>Cheminot</option><option>Troupier</option><option>Louveteau</option><option>Oisillons</option></select><select id="gl_role"><option>Chef d’Unité</option><option>Chef d’Unité Adjoint</option><option>Chef d’Unité Assistant</option><option>Trésorier</option></select><input id="gl_tel" type="tel" placeholder="Téléphone"/><input id="gl_matricule" placeholder="Matricule chef (stable)"/><button class="btn btn-primary" type="submit">Ajouter le chef</button></form><div id="leadersFullBox" class="mt-2"></div></div>
        </div>
        <div class="grid-2 mt-3">
          <div class="card"><h3>Passage / changement d’unité</h3><form class="form-stack mt-2" onsubmit="recordUnitTransition(event)"><select id="gt_scout" required><option value="">Choisir un jeune</option></select><select id="gt_unit"><option>Oisillons</option><option>Louveteau</option><option>Troupier</option><option>Cheminot</option><option>Routier</option></select><input id="gt_date" type="date" required/><input id="gt_ceremony" placeholder="Cérémonie / référence (facultatif)"/><button class="btn btn-primary" type="submit">Enregistrer le passage validé</button></form><div id="transitionsBox" class="mt-2"></div></div>
          <div class="card"><h3>Progression scoute</h3><form class="form-stack mt-2" onsubmit="addProgression(event)"><select id="gp_scout" required><option value="">Choisir un jeune</option></select><input id="gp_comp" placeholder="Compétence / test / étape" required/><select id="gp_status"><option>En cours</option><option>Validé</option><option>Badge attribué</option></select><input id="gp_date" type="date" required/><input id="gp_validateur" placeholder="Chef validateur"/><textarea id="gp_note" rows="2" placeholder="Observation / référence du manuel"></textarea><button class="btn btn-primary" type="submit">Ajouter à la progression</button></form><div id="progressionBox" class="mt-2"></div></div>
        </div>
        <div class="grid-2 mt-3">
          <div class="card"><h3>Budget et dépenses d’activité</h3><form class="form-stack mt-2" onsubmit="addActivityFinancialLine(event)"><select id="gf_activity" required><option value="">Choisir une activité</option></select><select id="gf_type"><option value="budget">Prévision / budget</option><option value="recette">Recette réelle</option><option value="depense">Dépense réelle</option></select><input id="gf_label" placeholder="Libellé (transport, repas, matériel…)" required/><input id="gf_amount" type="number" min="0" step="1" placeholder="Montant FCFA" required/><input id="gf_receipt" placeholder="Référence justificatif / reçu"/><button class="btn btn-primary" type="submit">Enregistrer la ligne</button></form><div id="activityFinanceBox" class="mt-2"></div></div>
          <div class="card"><h3>Justificatifs d’absence (traitement interne)</h3><form class="form-stack mt-2" onsubmit="submitAbsenceRequest(event)"><select id="ga_scout" required><option value="">Choisir un jeune</option></select><input id="ga_date" type="date" required/><textarea id="ga_reason" rows="3" placeholder="Motif transmis par le parent" required></textarea><input id="ga_file" type="text" placeholder="Nom du document/photo reçu (à conserver séparément)"/><button class="btn btn-primary" type="submit">Enregistrer la demande</button></form><div id="absenceRequestsBox" class="mt-2"></div></div>
        </div>
        <div class="card mt-3"><h3>Communication / convocations enregistrées</h3><form class="form-stack mt-2" onsubmit="saveAnnouncement(event)"><div class="form-grid-3"><input id="gn_title" placeholder="Objet / convocation" required/><select id="gn_unit"><option value="Toutes">Tout le groupe</option><option>Routier</option><option>Cheminot</option><option>Troupier</option><option>Louveteau</option><option>Oisillons</option></select><input id="gn_date" type="date"/></div><textarea id="gn_body" rows="3" placeholder="Message aux parents" required></textarea><button class="btn btn-primary" type="submit">Enregistrer l’annonce et préparer WhatsApp</button></form><div id="announcementsBox" class="mt-2"></div></div>
        <div class="card mt-3"><div class="card-header-row"><h3>Fiche jeune imprimable avec cachet</h3><button class="btn btn-sm btn-secondary no-print" onclick="printScoutFile()">Imprimer la fiche</button></div><select id="gprint_scout" class="no-print mt-2"><option value="">Choisir un jeune</option></select><div id="scoutPrintable" class="mt-2"></div></div>
      </section>

      <!-- ONGLET 5 : PARAMÈTRES -->
      <section id="tab-parametres" class="tab-panel no-print">
        <div class="card">
          <h3>Paramètres généraux &amp; échéances</h3>
          <form id="settingsForm" onsubmit="saveSettings(event)" class="form-grid-3 mt-2">
            <input type="text" id="set_cg_nom" placeholder="Nom du Chef de Groupe" />
            <input type="tel" id="set_cg_tel" placeholder="Téléphone CG" />
            <input type="url" id="set_wave_url" placeholder="Lien Wave Business (https://...)" />
            <input type="number" id="set_cot_annuelle" placeholder="Cotisation annuelle jeune (FCFA)" min="0" />
            <input type="number" id="set_cot_mensuelle" placeholder="Cotisation mensuelle (FCFA)" min="0" />
            <input type="date" id="set_cot_nationale_deadline" title="Date limite cotisation nationale" />
            <button type="submit" class="btn btn-primary">Enregistrer les paramètres</button>
          </form>

          <hr class="mt-3" />
          <h4 class="mt-2">Restaurer une sauvegarde JSON</h4>
          <input type="file" id="restoreJsonInput" accept="application/json" onchange="restoreBackupJson(event)" class="mt-2" />
          <hr class="mt-3" />
          <h4 class="mt-2">Aperçu du cachet numérique</h4>
          <p class="muted small">Ce cachet sera ajouté aux documents imprimés ou enregistrés en PDF.</p>
          <div id="digitalStampPreview" class="stamp-preview mt-2"></div>
        </div>
      </section>
    </main>
  </div>

  <!-- ZONE D'IMPRESSION DÉDIÉE -->
  <div id="printOverlay" class="print-only"></div>

  <script src="./app.js"></script>
</body>
</html>
