// ==========================================================================
// Écran d'accueil, écran projet, barre d'onglets de la prépa,
// et les actions de création / modification / suppression d'un projet.
// ==========================================================================

// ===== RENDER: HOME =====
function renderHome() {
  const el = document.getElementById('home-list');
  if (!S.projects.length) {
    el.innerHTML = `<div class="empty"><div class="empty-icon">🎬</div><div class="empty-text">Aucun projet — crée ton premier projet</div></div>`;
    return;
  }
  el.innerHTML = S.projects.map(p => `
    <div class="project-card" onclick="goProject('${p.id}')">
      <div class="project-icon">🎬</div>
      <div class="project-info">
        <div class="project-name">${esc(p.name)}</div>
        <div class="project-meta">${[p.prod, p.loueur].filter(Boolean).map(esc).join(' · ') || 'Aucun détail'}</div>
      </div>
      <span style="color:var(--text3);font-size:18px">›</span>
    </div>
  `).join('');
}

// ===== RENDER: PROJECT =====
function renderProject() {
  document.getElementById('proj-title').textContent = S.project.name;
  document.getElementById('proj-sub').textContent = [S.project.prod, S.project.loueur].filter(Boolean).join(' · ') || '';
}

// ===== RENDER: PRÉPA =====
function renderPrepa() {
  const el = document.getElementById('prepa-content');
  const view = S.prepaView || 'inventaire';
  const hasItems = (S.checklist.items || []).length > 0;

  const addBtn = document.getElementById('prepa-add-btn');
  if (addBtn) {
    if (view === 'inventaire') {
      addBtn.style.display = (hasItems && !S.checklistReimporting) ? '' : 'none';
      addBtn.textContent = '+ Item';
    } else if (view === 'checklist') {
      addBtn.style.display = hasItems ? '' : 'none';
      addBtn.textContent = '+ Phase';
    } else if (view === 'reglages-camera') {
      addBtn.style.display = '';
      addBtn.textContent = '+ Profil';
    } else if (view === 'manques') {
      addBtn.style.display = '';
      addBtn.textContent = '+ Manque';
    } else {
      addBtn.style.display = '';
      addBtn.textContent = '+ Fichier';
    }
  }

  let html = `<div class="seg">
    <button class="seg-btn ${view==='inventaire'?'active':''}" onclick="setPrepaView('inventaire')">Inventaire</button>
    <button class="seg-btn ${view==='reglages-camera'?'active':''}" onclick="setPrepaView('reglages-camera')">Réglages</button>
    <button class="seg-btn ${view==='checklist'?'active':''}" onclick="setPrepaView('checklist')">Checklist</button>
    <button class="seg-btn ${view==='manques'?'active':''}" onclick="setPrepaView('manques')">Manques</button>
    <button class="seg-btn ${view==='fichiers'?'active':''}" onclick="setPrepaView('fichiers')">Fichiers</button>
  </div>`;

  if (view === 'inventaire') html += renderInventaireView();
  else if (view === 'reglages-camera') html += renderCameraSettingsView();
  else if (view === 'checklist') html += renderChecklistView();
  else if (view === 'manques') html += renderManques(S.manques);
  else html += renderFichiers();

  el.innerHTML = html;

  if (view === 'checklist') attachPhaseDragHandlers();
}


// ===== ACTIONS: PROJECTS =====
function openNewProject() {
  openSheet(`
    <div class="sheet-title">Nouveau projet</div>
    <div class="form-group"><label class="form-label">Nom du projet *</label><input class="form-input" id="in-name" placeholder="Ex: Nom du projet"></div>
    <div class="form-group"><label class="form-label">Production</label><input class="form-input" id="in-prod" placeholder="Ex: Production"></div>
    <div class="form-group"><label class="form-label">Loueur</label><input class="form-input" id="in-loueur" placeholder="Ex: Loueur"></div>
    <div class="form-group"><label class="form-label">Nom de l'assistant</label><input class="form-input" id="in-assistant" placeholder="Ex: Assistant"></div>
    <div class="form-group"><label class="form-label">Email</label><input type="email" class="form-input" id="in-email" placeholder="Ex: contact@mail.fr"></div>
    <div class="form-group"><label class="form-label">Téléphone</label><input type="tel" class="form-input" id="in-phone" placeholder="Ex: 06 12 34 56 78"></div>
    <button class="btn btn-primary" onclick="createProject()">Créer</button>
  `);
}
async function createProject() {
  const name = document.getElementById('in-name').value.trim();
  if (!name) return;
  await api.post('/api/projects', {
    name,
    prod: document.getElementById('in-prod').value.trim(),
    loueur: document.getElementById('in-loueur').value.trim(),
    assistant: document.getElementById('in-assistant').value.trim(),
    email: document.getElementById('in-email').value.trim(),
    phone: document.getElementById('in-phone').value.trim()
  });
  closeSheet();
  await goHome();
}

function openEditProject() {
  openSheet(`
    <div class="sheet-title">Modifier le projet</div>
    <div class="form-group"><label class="form-label">Nom *</label><input class="form-input" id="in-name" value="${esc(S.project.name)}"></div>
    <div class="form-group"><label class="form-label">Production</label><input class="form-input" id="in-prod" value="${esc(S.project.prod)}"></div>
    <div class="form-group"><label class="form-label">Loueur</label><input class="form-input" id="in-loueur" value="${esc(S.project.loueur)}"></div>
    <div class="form-group"><label class="form-label">Nom de l'assistant</label><input class="form-input" id="in-assistant" value="${esc(S.project.assistant || '')}"></div>
    <div class="form-group"><label class="form-label">Email</label><input type="email" class="form-input" id="in-email" value="${esc(S.project.email || '')}"></div>
    <div class="form-group"><label class="form-label">Téléphone</label><input type="tel" class="form-input" id="in-phone" value="${esc(S.project.phone || '')}"></div>
    <button class="btn btn-primary" style="margin-bottom:10px" onclick="saveProject()">Enregistrer</button>
    <div class="confirm-btns">
      <button class="btn btn-danger" onclick="confirmDeleteProject()">Supprimer le projet</button>
    </div>
  `);
}
async function saveProject() {
  await api.put(`/api/projects/${S.projectId}`, {
    name: document.getElementById('in-name').value.trim(),
    prod: document.getElementById('in-prod').value.trim(),
    loueur: document.getElementById('in-loueur').value.trim(),
    assistant: document.getElementById('in-assistant').value.trim(),
    email: document.getElementById('in-email').value.trim(),
    phone: document.getElementById('in-phone').value.trim()
  });
  closeSheet();
  await goProject(S.projectId);
}
function confirmDeleteProject() {
  openSheet(`
    <div class="sheet-title">Supprimer « ${esc(S.project.name)} » ?</div>
    <p style="color:var(--text2);margin-bottom:16px;font-size:14px">Toutes les données du projet seront supprimées définitivement.</p>
    <div class="confirm-btns">
      <button class="btn btn-secondary" onclick="closeSheet()">Annuler</button>
      <button class="btn btn-danger" onclick="deleteProject()">Supprimer</button>
    </div>
  `);
}
async function deleteProject() {
  await api.del(`/api/projects/${S.projectId}`);
  closeSheet();
  await goHome();
}

