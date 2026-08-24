// ==========================================================================
// Onglet Checklist : phases de vérification et checks qualité.
//
// Les phases sont créées automatiquement à l'import selon le matériel présent.
// Chaque item y porte ses propres checks, issus du référentiel AOA.
// ==========================================================================

// ===== CHECKLIST : phases dynamiques =====
function renderChecklistView() {
  const items = S.checklist.items || [];
  const phases = S.checklist.phases || [];
  if (!items.length) {
    return `<div class="empty"><div class="empty-icon">${icone('clipboard-list', { taille: 40 })}</div><div class="empty-text">Importe d'abord ta liste dans l'onglet Inventaire pour générer les phases automatiquement.</div></div>`;
  }
  let html = prepaDateBanner();
  html += `<div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap">
    <button class="chip" onclick="openCreatePhase()">＋ Créer une phase</button>
    <button class="chip" style="${S.checklistAdvanced ? 'background:var(--accent-dim);border-color:var(--accent);color:var(--accent-hover)' : ''}" onclick="toggleAdvancedMode()">${S.checklistAdvanced ? icone('check', { taille: 13, trait: 3 }) : ''}Checklist avancée</button>
    <button class="chip" onclick="confirmGeneratePrepaReport()">${icone('file-text', { taille: 14 })} Compte-rendu de prépa</button>
  </div>`;
  if (!phases.length) {
    html += `<div class="empty"><div class="empty-icon">${icone('folder-open', { taille: 40 })}</div><div class="empty-text">Aucune phase pour l'instant. Elles se créent automatiquement à l'import selon le matériel présent, ou tu peux en créer une toi-même.</div></div>`;
    return html;
  }
  html += `<div id="checklist-phases-container">`;
  for (const phase of phases) {
    const phaseItems = items.filter(it => it.phase_id === phase.id);
    // Une phase vidée de ses items reste affichée (avec un état vide) plutôt
    // que de disparaître — sinon impossible d'y remettre des items ensuite.
    const doneCount = phaseItems.filter(it => it.presence_cochee).length;
    const collapsed = isCollapsed('phase-' + phase.id);
    html += `<div class="phase-group" data-phase-id="${phase.id}">
      <div class="phase-group-hdr" data-phase-drag="${phase.id}" onclick="handlePhaseHeaderClick('${phase.id}')">
        <span style="color:var(--text3);display:flex;margin-right:2px">${icone(collapsed ? 'chevron-right' : 'chevron-down', { taille: 15 })}</span>
        <div style="flex:1;min-width:0">
          <div class="phase-group-title">${esc(phase.label)}</div>
          ${phase.sub ? `<div class="phase-group-sub">${esc(phase.sub)}</div>` : ''}
          <div class="progress-bar"><div class="progress-fill" style="width:${phaseItems.length ? Math.round(doneCount/phaseItems.length*100) : 0}%"></div></div>
        </div>
        <span style="font-size:12px;color:var(--text2);margin-right:4px">${doneCount}/${phaseItems.length}</span>
        <button class="btn-icon-sm" onclick="event.stopPropagation();openManagePhase('${phase.id}')" aria-label="Gérer la phase">${icone('pencil', { taille: 15 })}</button>
      </div>
      ${collapsed ? '' : `<div>${phaseItems.length ? (phase.type === 'CAMERA' ? renderCameraPhaseBody(phaseItems) : renderPhaseBody(phaseItems)) : `<div style="padding:16px;color:var(--text3);font-size:13px">Phase vide — appuie sur le crayon pour y ajouter des items.</div>`}</div>`}
    </div>`;
  }
  html += `</div>`;
  return html;
}

// Corps standard d'une phase, avec sous-groupes conditionnels (Optique fixe/zoom, Mattebox clip-on/standard).
function renderPhaseBody(phaseItems) {
  const subLabels = { FIXE: 'Série fixe', ZOOM: 'Zooms', CLIPON: 'Clip-on', STANDARD: 'Standard' };
  const withSousType = phaseItems.filter(it => it.sous_type);
  const withoutSousType = phaseItems.filter(it => !it.sous_type);
  if (!withSousType.length) return withoutSousType.map(renderChecklistRow).join('');

  let html = '';
  const seen = new Set();
  for (const it of withSousType) {
    if (seen.has(it.sous_type)) continue;
    seen.add(it.sous_type);
    const group = withSousType.filter(x => x.sous_type === it.sous_type);
    html += `<div class="phase-subgroup-label">${esc(subLabels[it.sous_type] || it.sous_type)}</div>`;
    html += group.map(renderChecklistRow).join('');
  }
  if (withoutSousType.length) {
    html += withoutSousType.map(renderChecklistRow).join('');
  }
  return html;
}

// Un profil non confirmé (validated=0) reste invisible côté Checklist — ni
// couleur ni réglages n'apparaissent tant qu'on n'a pas cliqué "Confirmer" dans
// l'onglet Réglages. Ça laisse la place à des essais/brouillons sans polluer.
function validatedCameraProfile(profileId) {
  const p = (S.cameraProfiles || []).find(x => x.id === profileId);
  return p && p.validated ? p : null;
}
function cameraProfileColor(profileId) {
  const p = validatedCameraProfile(profileId);
  return p ? p.color : null;
}

function renderChecklistRow(it) {
  const st = itemState(it);
  const checks = visibleChecks(it);
  let badgeHtml = '';
  if (st === 'partial') badgeHtml = `<span class="badge badge-orange">${checks.filter(c=>c.done).length}/${checks.length}</span>`;
  else if (st === 'validated' && checks.length) badgeHtml = `<span class="badge badge-green">${icone('check', { taille: 11, trait: 3 })}</span>`;
  const color = it.type === 'CAMERA' && it.camera_profile_id ? cameraProfileColor(it.camera_profile_id) : null;
  // Le carré de couleur vit hors du titre : un nom d'item long tronqué par
  // l'ellipsis du CSS le faisait disparaître silencieusement quand il était inline.
  const swatchHtml = color ? `<span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:${esc(color)};flex-shrink:0" title="Profil réglages"></span>` : '';
  return `<div class="list-item" onclick="openChecklistItem('${it.id}')">
    <div class="check-box ${it.presence_cochee?'checked':''}" onclick="event.stopPropagation();toggleItemPresence('${it.id}', ${it.presence_cochee})">${it.presence_cochee ? icone('check', { taille: 13, trait: 3 }) : ''}</div>
    <div class="list-item-content" style="margin-left:2px">
      <div class="list-item-title">${esc(it.designation)}${it.quantite > 1 ? ' ×' + it.quantite : ''}</div>
      ${(it.identifiant || it.reference || it.emplacement) ? `<div class="list-item-sub">${[it.identifiant && ('ID : ' + it.identifiant), it.reference, it.emplacement].filter(Boolean).map(esc).join(' · ')}</div>` : ''}
    </div>
    ${swatchHtml}
    ${badgeHtml}
    <span class="list-item-arrow">${icone('chevron-right', { taille: 16 })}</span>
  </div>`;
}

// Phase Caméra : regroupe les corps qui partagent le même profil de réglages
// (checks physiques + réglages comptés une seule fois pour tout le groupe).
// Chaque caméra reste affichée individuellement (comme un item normal), mais
// triée et regroupée visuellement par couleur de profil de réglages (les
// caméras du même profil se suivent) ; les non-assignées passent en dernier.
function renderCameraPhaseBody(phaseItems) {
  const withProfile = phaseItems.filter(it => validatedCameraProfile(it.camera_profile_id));
  const withoutProfile = phaseItems.filter(it => !validatedCameraProfile(it.camera_profile_id));
  const profileIds = [...new Set(withProfile.map(it => it.camera_profile_id))];
  let sorted = [];
  for (const pid of profileIds) sorted.push(...withProfile.filter(it => it.camera_profile_id === pid));
  sorted.push(...withoutProfile);
  return sorted.map(renderChecklistRow).join('');
}

function openChecklistItem(id) {
  const it = findChecklistItem(id);
  if (!it) return;
  const st = itemState(it);
  const stLabel = { missing: 'Absent', partial: 'Présent — checking incomplet', validated: 'Validé' };
  const stColor = { missing: 'var(--red)', partial: '#f0a636', validated: 'var(--green)' };
  const shownChecks = visibleChecks(it);
  const hiddenCount = (it.checks || []).length - shownChecks.length;
  const allChecked = shownChecks.length > 0 && shownChecks.every(c => c.done);
  const checksHtml = `
    <div class="form-group">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <label class="form-label" style="margin:0">Checking qualité</label>
        ${shownChecks.length ? `<button class="chip" style="padding:6px 12px;font-size:12px" onclick="quickOkItem('${id}')">${allChecked ? icone('rotate-ccw', { taille: 13 }) + ' Tout décocher' : icone('zap', { taille: 13 }) + ' Tout cocher'}</button>` : ''}
      </div>
      ${shownChecks.length ? `<div class="card" style="margin-bottom:10px">${shownChecks.map(c => `
        <div class="check-item">
          <div class="check-box ${c.done?'checked':''}" onclick="toggleCheck('${c.id}','${id}',${c.done})">${c.done ? icone('check', { taille: 13, trait: 3 }) : ''}</div>
          <div class="check-item-content"><div class="check-item-label ${c.done?'done':''}">${esc(c.label)}</div></div>
          <button class="btn-icon-sm" style="color:var(--red)" onclick="deleteCustomCheck('${c.id}','${id}')" aria-label="Supprimer">${icone('x', { taille: 15 })}</button>
        </div>`).join('')}</div>` : ''}
      ${hiddenCount ? `<div style="font-size:12px;color:var(--text2);margin-bottom:10px">${hiddenCount} réglage(s) avancé(s) masqué(s) — active « Checklist avancée » dans l'onglet Checklist pour les voir.</div>` : ''}
      <div style="display:flex;gap:8px">
        <input class="form-input" id="in-new-check" placeholder="Ajouter une sous-partie à cocher…" style="flex:1">
        <button class="btn-icon-sm" style="background:var(--bg3)" onclick="addCustomCheck('${id}')">＋</button>
      </div>
    </div>`;
  const notesHtml = (it.notes || []).map(n => `
    <div class="list-item" style="cursor:default">
      <div class="list-item-content"><div class="list-item-title" style="font-weight:400;white-space:normal;overflow:visible;text-overflow:clip">${esc(n.text)}</div></div>
      <button class="btn-icon-sm" style="color:var(--red)" onclick="deleteChecklistNote('${n.id}','${id}')" aria-label="Supprimer">${icone('x', { taille: 15 })}</button>
    </div>`).join('');

  const phases = S.checklist.phases || [];
  const phaseOptions = `<option value="">Aucune (Inventaire seul)</option>` +
    phases.map(p => `<option value="${p.id}" ${it.phase_id===p.id?'selected':''}>${esc(p.label)}</option>`).join('');

  const cameraBlock = it.type === 'CAMERA' ? renderCameraAssignBlock(it) : '';

  openSheet(`
    <div class="sheet-title">${esc(it.designation)}</div>
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px">
      <div class="check-box ${it.presence_cochee?'checked':''}" style="width:32px;height:32px" onclick="toggleItemPresence('${id}',${it.presence_cochee},true)">${it.presence_cochee ? icone('check', { taille: 13, trait: 3 }) : ''}</div>
      <div>
        <div style="font-weight:650;font-size:15px">Présent physiquement</div>
        <div style="font-size:12.5px;color:${stColor[st]};font-weight:600">${stLabel[st]}</div>
      </div>
    </div>
    ${checksHtml}
    ${cameraBlock}
    <div class="form-group">
      <label class="form-label">Notes</label>
      ${notesHtml ? `<div class="card" style="margin-bottom:10px">${notesHtml}</div>` : ''}
      <textarea class="form-input" id="in-item-note" rows="2" placeholder="Ajouter une note libre…"></textarea>
      <button class="chip" style="margin-top:8px" onclick="addChecklistNote('${id}')">＋ Ajouter la note</button>
    </div>
    <div class="form-group">
      <label class="form-label">Phase de vérification</label>
      <select class="form-select" id="in-item-phase" onchange="assignItemPhase('${id}', this.value)">${phaseOptions}</select>
    </div>
    <div class="form-group">
      <label class="form-label">Infos</label>
      <div class="form-group"><input class="form-input" id="in-item-designation" value="${esc(it.designation)}" placeholder="Désignation"></div>
      <div style="display:flex;gap:8px">
        <input class="form-input" id="in-item-quantite" type="number" min="1" value="${it.quantite}" placeholder="Qté" style="flex:1">
        <input class="form-input" id="in-item-reference" value="${esc(it.reference||'')}" placeholder="Référence" style="flex:2">
      </div>
      <div class="form-group" style="margin-top:10px"><input class="form-input" id="in-item-emplacement" value="${esc(it.emplacement||'')}" placeholder="Emplacement / flight case"></div>
      <div class="form-group" style="margin-top:10px"><input class="form-input" id="in-item-identifiant" value="${esc(it.identifiant||'')}" placeholder="Identifiant (ex: Cam A, S/N 123...)"></div>
    </div>
    <button class="btn btn-primary" style="margin-bottom:10px" onclick="saveChecklistItemInfo('${id}')">Enregistrer les infos</button>
    <button class="btn btn-danger" onclick="confirmDeleteChecklistItem('${id}')">Supprimer l'item</button>
  `, { autofocus: false });
}

function renderCameraAssignBlock(it) {
  const profiles = S.cameraProfiles || [];
  const profOptions = `<option value="">Aucun profil</option>` +
    profiles.map(p => `<option value="${p.id}" ${it.camera_profile_id===p.id?'selected':''}>${esc(p.label)}</option>`).join('');
  const profile = profiles.find(p => p.id === it.camera_profile_id);
  let settingsHtml = '';
  if (profile && !profile.validated) {
    settingsHtml = `<div style="font-size:12.5px;color:var(--text2);margin-bottom:16px">Profil pas encore confirmé — va dans l'onglet Réglages et appuie sur « Confirmer » pour que sa couleur et ses réglages apparaissent ici.</div>`;
  } else if (profile) {
    settingsHtml = `
    <div class="form-group">
      <label class="form-label">Réglages du profil « ${esc(profile.label)} »</label>
      <div class="card">${(profile.settings || []).map(s => `
        <div class="check-item">
          <div class="check-box ${s.done?'checked':''}" onclick="toggleProfileSettingInItem('${s.id}',${s.done},'${it.id}')">${s.done ? icone('check', { taille: 13, trait: 3 }) : ''}</div>
          <div class="check-item-content"><div class="check-item-label ${s.done?'done':''}">${esc(s.text)}</div></div>
        </div>`).join('') || `<div style="padding:14px 16px;color:var(--text3);font-size:13px">Aucun réglage sur ce profil — ajoute-les depuis l'onglet Réglages.</div>`}</div>
    </div>`;
  }
  return `
    <div class="form-group">
      <label class="form-label">Profil de réglages caméra</label>
      <select class="form-select" onchange="assignCameraProfile('${it.id}', this.value)">${profOptions}</select>
    </div>
    ${settingsHtml}`;
}
// Cocher un réglage caméra depuis la fiche d'un item : appliqué tout de suite,
// enregistré ensuite (voir `majOptimiste` dans core.js).
async function toggleProfileSettingInItem(settingId, current, itemId) {
  const reglage = (S.cameraProfiles || []).flatMap(p => p.settings || []).find(r => r.id === settingId);
  if (!reglage) return;
  const avant = reglage.done;
  await majOptimiste({
    appliquer: () => { reglage.done = current ? 0 : 1; },
    annuler: () => { reglage.done = avant; },
    envoyer: () => api.put(`/api/camera-profile-settings/${settingId}`, { done: !current }),
    redessiner: () => openChecklistItem(itemId),
  });
}

// Case de présence d'un item (Inventaire et Checklist).
async function toggleItemPresence(id, current, reopen) {
  const it = findChecklistItem(id);
  if (!it) return;
  const avant = it.presence_cochee;
  await majOptimiste({
    appliquer: () => { it.presence_cochee = current ? 0 : 1; },
    annuler: () => { it.presence_cochee = avant; },
    envoyer: () => api.put(`/api/checklist-items/${id}`, {
      designation: it.designation, quantite: it.quantite, reference: it.reference,
      emplacement: it.emplacement, identifiant: it.identifiant, presence_cochee: !current,
    }),
    redessiner: () => { renderPrepa(); if (reopen) openChecklistItem(id); },
  });
}

// « Tout sélectionner » sur une catégorie de l'Inventaire.
async function bulkTogglePresence(categorie, presence) {
  const concernes = (S.checklist.items || []).filter(it => it.categorie === categorie);
  const avant = concernes.map(it => it.presence_cochee);
  await majOptimiste({
    appliquer: () => concernes.forEach(it => { it.presence_cochee = presence ? 1 : 0; }),
    annuler: () => concernes.forEach((it, i) => { it.presence_cochee = avant[i]; }),
    envoyer: () => api.post(`/api/projects/${S.projectId}/checklist/presence-bulk`, { categorie, presence }),
    redessiner: () => renderPrepa(),
  });
}

// Bandeau rappelant depuis quand la prépa en cours a démarré (utile en TV où
// la même liste est re-vérifiée à plusieurs dates différentes).
function prepaDateBanner() {
  if (!S.project.prepa_date) return '';
  return `<div style="font-size:12px;color:var(--text2);margin-bottom:12px">Prépa en cours depuis le ${formatDate(S.project.prepa_date)}</div>`;
}
function confirmResetAll() {
  openSheet(`
    <div class="sheet-title">Démarrer une nouvelle prépa ?</div>
    <p style="color:var(--text2);font-size:14px;margin-bottom:16px">La présence (Inventaire) et les checks qualité (Checklist) sont tous décochés, avec la date d'aujourd'hui. La liste, les phases et les réglages caméra restent identiques — utile pour re-vérifier le même matériel à une nouvelle date. Cette action est irréversible.</p>
    <div class="confirm-btns">
      <button class="btn btn-secondary" onclick="closeSheet()">Annuler</button>
      <button class="btn btn-danger" onclick="doResetAll(this)">Réinitialiser</button>
    </div>
  `);
}
async function doResetAll(btn) {
  if (btn) btn.disabled = true;
  const { prepa_date } = await api.post(`/api/projects/${S.projectId}/checklist/reset-all`, {});
  S.project.prepa_date = prepa_date;
  closeSheet();
  await reloadChecklist();
  showToast('Nouvelle prépa démarrée — tout décoché');
}
// Case d'un check qualité : c'est le geste le plus répété d'une prépa, donc
// celui qui gagne le plus à ne pas attendre le serveur.
async function toggleCheck(checkId, itemId, current) {
  const check = (findChecklistItem(itemId)?.checks || []).find(c => c.id === checkId);
  if (!check) return;
  const avant = check.done;
  await majOptimiste({
    appliquer: () => { check.done = current ? 0 : 1; },
    annuler: () => { check.done = avant; },
    envoyer: () => api.put(`/api/checklist-checks/${checkId}`, { done: !current }),
    redessiner: () => { renderPrepa(); openChecklistItem(itemId); },
  });
}
async function addCustomCheck(itemId) {
  const input = document.getElementById('in-new-check');
  const label = input.value.trim();
  if (!label) return;
  await api.post(`/api/checklist-items/${itemId}/checks`, { label });
  await reloadChecklist();
  openChecklistItem(itemId);
}
async function deleteCustomCheck(checkId, itemId) {
  await api.del(`/api/checklist-checks/${checkId}`);
  await reloadChecklist();
  openChecklistItem(itemId);
}
// Coche (ou décoche) d'un coup tous les checks visibles d'un item.
async function quickOkItem(id) {
  const it = findChecklistItem(id);
  if (!it) return;
  const visibles = visibleChecks(it);
  const done = !(visibles.length > 0 && visibles.every(c => c.done));
  // Même règle que côté serveur : le mode simple ne touche pas aux checks
  // avancés, qui ne sont pas affichés.
  const cibles = S.checklistAdvanced ? (it.checks || []) : (it.checks || []).filter(c => !c.avance);
  const avant = cibles.map(c => c.done);
  await majOptimiste({
    appliquer: () => cibles.forEach(c => { c.done = done ? 1 : 0; }),
    annuler: () => cibles.forEach((c, i) => { c.done = avant[i]; }),
    envoyer: () => api.post(`/api/checklist-items/${id}/quick-ok`, { done, include_advanced: S.checklistAdvanced }),
    redessiner: () => { renderPrepa(); openChecklistItem(id); },
  });
}
async function addChecklistNote(id) {
  const text = document.getElementById('in-item-note').value.trim();
  if (!text) return;
  await api.post(`/api/checklist-items/${id}/notes`, { text });
  await reloadChecklist();
  openChecklistItem(id);
}
async function deleteChecklistNote(noteId, itemId) {
  await api.del(`/api/checklist-notes/${noteId}`);
  await reloadChecklist();
  openChecklistItem(itemId);
}
async function assignItemPhase(id, phaseId) {
  await api.put(`/api/checklist-items/${id}/phase`, { phase_id: phaseId });
  await reloadChecklist();
}
async function assignCameraProfile(id, profileId) {
  await api.put(`/api/checklist-items/${id}/camera-profile`, { camera_profile_id: profileId });
  await reloadChecklist();
  openChecklistItem(id);
}
// Même action déclenchée depuis l'onglet Réglages caméra (pas de sheet à rouvrir ici).
async function assignCameraProfileFromSettings(id, profileId) {
  await api.put(`/api/checklist-items/${id}/camera-profile`, { camera_profile_id: profileId });
  await reloadChecklist();
}
async function saveChecklistItemInfo(id) {
  const it = findChecklistItem(id);
  await api.put(`/api/checklist-items/${id}`, {
    designation: document.getElementById('in-item-designation').value.trim(),
    quantite: document.getElementById('in-item-quantite').value,
    reference: document.getElementById('in-item-reference').value.trim(),
    emplacement: document.getElementById('in-item-emplacement').value.trim(),
    identifiant: document.getElementById('in-item-identifiant').value.trim(),
    presence_cochee: it.presence_cochee
  });
  closeSheet();
  await reloadChecklist();
}
function confirmDeleteChecklistItem(id) {
  const it = findChecklistItem(id);
  openSheet(`
    <div class="sheet-title">Supprimer « ${esc(it.designation)} » ?</div>
    <div class="confirm-btns">
      <button class="btn btn-secondary" onclick="openChecklistItem('${id}')">Annuler</button>
      <button class="btn btn-danger" onclick="doDeleteChecklistItem('${id}')">Supprimer</button>
    </div>
  `);
}
async function doDeleteChecklistItem(id) {
  await api.del(`/api/checklist-items/${id}`);
  closeSheet();
  await reloadChecklist();
}

function openAddChecklistItem() {
  const catOptions = Object.entries(CATEGORIE_LABELS).map(([k,l]) => `<option value="${k}">${l}</option>`).join('');
  openSheet(`
    <div class="sheet-title">Ajouter un item</div>
    <div class="form-group"><label class="form-label">Désignation *</label><input class="form-input" id="in-nitem-designation" placeholder="Ex: Sony FX6, oublié par le loueur…"></div>
    <div class="form-group"><label class="form-label">Catégorie</label>
      <select class="form-select" id="in-nitem-categorie">${catOptions}</select>
    </div>
    <div style="display:flex;gap:8px">
      <div class="form-group" style="flex:1"><label class="form-label">Quantité</label><input class="form-input" id="in-nitem-quantite" type="number" min="1" value="1"></div>
      <div class="form-group" style="flex:2"><label class="form-label">Référence</label><input class="form-input" id="in-nitem-reference" placeholder="Optionnel"></div>
    </div>
    <div class="form-group"><label class="form-label">Emplacement</label><input class="form-input" id="in-nitem-emplacement" placeholder="Ex: Flight Cam 1"></div>
    <p style="font-size:12px;color:var(--text2);margin-bottom:10px">L'item arrive en Inventaire seul — tu pourras l'assigner à une phase de vérification ensuite depuis sa fiche.</p>
    <button class="btn btn-primary" onclick="addChecklistItem(this)">Ajouter</button>
  `);
}
async function addChecklistItem(btn) {
  const designation = document.getElementById('in-nitem-designation').value.trim();
  if (!designation) return;
  if (btn) btn.disabled = true;
  await api.post(`/api/projects/${S.projectId}/checklist-items`, {
    designation,
    categorie: document.getElementById('in-nitem-categorie').value,
    quantite: document.getElementById('in-nitem-quantite').value,
    reference: document.getElementById('in-nitem-reference').value.trim(),
    emplacement: document.getElementById('in-nitem-emplacement').value.trim()
  });
  closeSheet();
  await reloadChecklist();
}

