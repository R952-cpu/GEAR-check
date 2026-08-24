// ==========================================================================
// Navigation entre écrans et chargement des données associées.
//
// Chaque écran a sa fonction `go*` qui charge ce dont il a besoin puis rend
// l'affichage. Les fonctions `reload*` rechargent une seule famille de données
// sans changer d'écran.
// ==========================================================================

// ===== NAVIGATION =====
//
// Tout changement d'écran passe par le voile B (mascotte qui sautille) — voir
// chargement.js. Les onglets de la Prépa, eux, restent instantanés : on y fait
// des dizaines d'aller-retours pendant une prépa et leurs données sont déjà en
// mémoire, une animation à chaque bascule alourdirait le travail.
function go(screen) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById(`screen-${screen}`);
  if (el) el.classList.add('active');
  S.screen = screen;
  el.scrollTop = 0;
}

/**
 * Charge et affiche l'accueil, sans mise en scène.
 *
 * Séparé de `goHome` pour le démarrage de l'application : l'écran de
 * lancement est déjà à l'écran à ce moment-là, et superposer le voile de
 * transition par-dessus n'aurait aucun sens.
 */
async function chargerAccueil() {
  const data = await api.get('/api/projects');
  S.projects = data;
  renderHome();
  go('home');
}

async function goHome() {
  return avecTransition(chargerAccueil);
}

/** Retour à l'écran précédent — un changement d'écran comme un autre. */
async function retour(screen) {
  return avecTransition(async () => go(screen));
}

async function goProject(id) {
  return avecTransition(async () => chargerProjet(id));
}

async function chargerProjet(id) {
  S.projectId = id;
  S.project = await api.get(`/api/projects/${id}`);
  // Repart toujours du début du parcours (copie du prompt) en entrant dans un
  // projet, plutôt que de garder l'étape où on était resté sur un autre projet.
  S.checklistOnboardStep = 'explain';
  S.checklistReimporting = false;
  renderProject();
  go('project');
}

async function goPrepa() {
  return avecTransition(async () => {
    if (!S.prepaView) S.prepaView = 'inventaire';
    await loadPrepaView();
    go('prepa');
  });
}
async function loadPrepaView() {
  const view = S.prepaView;
  if (view === 'inventaire' || view === 'checklist' || view === 'reglages-camera') {
    // Les deux requêtes sont indépendantes : les lancer ensemble économise un
    // aller-retour complet, sensible sur une liaison distante.
    [S.checklist, S.cameraProfiles] = await Promise.all([
      api.get(`/api/projects/${S.projectId}/checklist`),
      api.get(`/api/projects/${S.projectId}/camera-profiles`),
    ]);
  } else if (view === 'manques') {
    S.manques = await api.get(`/api/projects/${S.projectId}/manques`);
  } else {
    [S.attachments, S.prepaReports] = await Promise.all([
      api.get(`/api/projects/${S.projectId}/prepa/attachments`),
      api.get(`/api/projects/${S.projectId}/prepa-reports`),
    ]);
  }
  renderPrepa();
}
function setPrepaView(v) { S.prepaView = v; loadPrepaView(); }
function toggleAdvancedMode() { S.checklistAdvanced = !S.checklistAdvanced; renderPrepa(); }
async function reloadChecklist() {
  [S.checklist, S.cameraProfiles] = await Promise.all([
    api.get(`/api/projects/${S.projectId}/checklist`),
    api.get(`/api/projects/${S.projectId}/camera-profiles`),
  ]);
  renderPrepa();
}
async function reloadManques() {
  S.manques = await api.get(`/api/projects/${S.projectId}/manques`);
  renderPrepa();
}
async function reloadAttachments() {
  S.attachments = await api.get(`/api/projects/${S.projectId}/prepa/attachments`);
  renderPrepa();
}
async function reloadPrepaReports() {
  S.prepaReports = await api.get(`/api/projects/${S.projectId}/prepa-reports`);
  renderPrepa();
}

async function goCompteRendus() {
  return avecTransition(async () => {
    const data = await api.get(`/api/projects/${S.projectId}/compte-rendus`);
    S.crList = data;
    renderCRList();
    go('cr-list');
  });
}

async function goCR(id) {
  return avecTransition(async () => {
    S.crId = id;
    const data = await api.get(`/api/compte-rendus/${id}`);
    S.cr = data;
    renderCR();
    go('cr');
  });
}

