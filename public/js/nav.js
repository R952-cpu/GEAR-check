// ==========================================================================
// Navigation entre écrans et chargement des données associées.
//
// Chaque écran a sa fonction `go*` qui charge ce dont il a besoin puis rend
// l'affichage. Les fonctions `reload*` rechargent une seule famille de données
// sans changer d'écran.
// ==========================================================================

// ===== NAVIGATION =====
function go(screen) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById(`screen-${screen}`);
  if (el) el.classList.add('active');
  S.screen = screen;
  el.scrollTop = 0;
}

async function goHome() {
  const data = await api.get('/api/projects');
  S.projects = data;
  renderHome();
  go('home');
}

async function goProject(id) {
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
  if (!S.prepaView) S.prepaView = 'inventaire';
  await loadPrepaView();
  go('prepa');
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
  const data = await api.get(`/api/projects/${S.projectId}/compte-rendus`);
  S.crList = data;
  renderCRList();
  go('cr-list');
}

async function goCR(id) {
  S.crId = id;
  const data = await api.get(`/api/compte-rendus/${id}`);
  S.cr = data;
  renderCR();
  go('cr');
}

