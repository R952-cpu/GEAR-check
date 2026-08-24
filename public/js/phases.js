// ==========================================================================
// Gestion des phases : création personnalisée, renommage, ajout et
// retrait d'items, suppression, et réordonnancement par appui long + glisser.
// ==========================================================================

// ===== PHASES : création custom, édition, réordonnancement =====
function prepaAdd() {
  const v = S.prepaView || 'inventaire';
  if (v === 'inventaire') openAddChecklistItem();
  else if (v === 'reglages-camera') openCreateCameraProfileSheet();
  else if (v === 'checklist') openCreatePhase();
  else if (v === 'manques') openAddManque();
  else openAttachFile();
}

function openCreatePhase() {
  const items = S.checklist.items || [];
  if (!items.length) { showToast("Importe d'abord du matériel dans Inventaire", true); return; }
  const rows = items.map(it => `
    <div class="pick-row" onclick="togglePickItem('${it.id}')">
      <div class="pick-box" id="pick-${it.id}">${icone('check', { taille: 13, trait: 3 })}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:14px;font-weight:600">${esc(it.designation)}</div>
        <div style="font-size:11.5px;color:var(--text2)">${esc(CATEGORIE_LABELS[it.categorie]||it.categorie)}${it.phase_id ? ' · déjà dans une phase' : ''}</div>
      </div>
    </div>`).join('');
  window.__pickedItems = new Set();
  openSheet(`
    <div class="sheet-title">Créer une phase</div>
    <div class="form-group"><label class="form-label">Nom de la phase *</label><input class="form-input" id="in-phase-label" placeholder="Ex: Machinerie"></div>
    <div class="form-group"><label class="form-label">Sous-titre (optionnel)</label><input class="form-input" id="in-phase-sub" placeholder="Ex: Tête, pied, roulantes"></div>
    <div class="form-group">
      <label class="form-label">Items à inclure</label>
      <div class="card" style="max-height:280px;overflow-y:auto;padding:6px 12px">${rows}</div>
    </div>
    <button class="btn btn-primary" onclick="createPhase(this)">Créer</button>
  `);
}
function togglePickItem(id) {
  const box = document.getElementById(`pick-${id}`);
  if (window.__pickedItems.has(id)) { window.__pickedItems.delete(id); box.classList.remove('checked'); }
  else { window.__pickedItems.add(id); box.classList.add('checked'); }
}
async function createPhase(btn) {
  const label = document.getElementById('in-phase-label').value.trim();
  if (!label) return;
  if (btn) btn.disabled = true;
  await api.post(`/api/projects/${S.projectId}/checklist-phases`, {
    label,
    sub: document.getElementById('in-phase-sub').value.trim(),
    item_ids: Array.from(window.__pickedItems || [])
  });
  closeSheet();
  await reloadChecklist();
}

function openManagePhase(id) {
  const phase = findPhase(id);
  if (!phase) return;
  const items = S.checklist.items || [];
  const inPhase = items.filter(it => it.phase_id === id);
  const notInPhase = items.filter(it => it.phase_id !== id);

  const currentHtml = inPhase.length ? inPhase.map(it => `
    <div class="pick-row">
      <div style="flex:1;font-size:14px;min-width:0">${esc(it.designation)}</div>
      <button class="btn-icon-sm" style="color:var(--red)" onclick="removeItemFromPhase('${it.id}','${id}')" aria-label="Retirer">${icone('x', { taille: 15 })}</button>
    </div>`).join('') : `<div style="padding:10px 4px;color:var(--text3);font-size:13px">Aucun item dans cette phase</div>`;

  window.__pickedItems = new Set();
  const addableHtml = notInPhase.map(it => `
    <div class="pick-row" onclick="togglePickItem('${it.id}')">
      <div class="pick-box" id="pick-${it.id}">${icone('check', { taille: 13, trait: 3 })}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:14px;font-weight:600">${esc(it.designation)}</div>
        <div style="font-size:11.5px;color:var(--text2)">${esc(CATEGORIE_LABELS[it.categorie]||it.categorie)}${it.phase_id ? ' · déjà dans une autre phase' : ''}</div>
      </div>
    </div>`).join('');

  openSheet(`
    <div class="sheet-title">Modifier la phase</div>
    <div class="form-group"><label class="form-label">Nom *</label><input class="form-input" id="in-phase-label" value="${esc(phase.label)}"></div>
    <div class="form-group"><label class="form-label">Sous-titre</label><input class="form-input" id="in-phase-sub" value="${esc(phase.sub||'')}"></div>
    <button class="btn btn-secondary" style="margin-bottom:16px" onclick="savePhase('${id}')">Enregistrer le nom</button>

    <div class="form-group">
      <label class="form-label">Items dans cette phase (${inPhase.length})</label>
      <div class="card" style="max-height:180px;overflow-y:auto">${currentHtml}</div>
    </div>
    <div class="form-group">
      <label class="form-label">Ajouter des items depuis l'inventaire</label>
      <div class="card" style="max-height:220px;overflow-y:auto;padding:6px 12px">${addableHtml || '<div style="padding:10px 4px;color:var(--text3);font-size:13px">Tout l\'inventaire est déjà dans cette phase</div>'}</div>
      <button class="btn btn-secondary" style="margin-top:10px" onclick="addPickedItemsToPhase('${id}')">Ajouter la sélection</button>
    </div>
    <button class="btn btn-danger" style="margin-top:6px" onclick="confirmDeletePhase('${id}')">Supprimer la phase</button>
  `, { autofocus: false });
}
async function removeItemFromPhase(itemId, phaseId) {
  await api.put(`/api/checklist-items/${itemId}/phase`, { phase_id: '' });
  await reloadChecklist();
  openManagePhase(phaseId);
}
async function addPickedItemsToPhase(phaseId) {
  const ids = Array.from(window.__pickedItems || []);
  if (!ids.length) return;
  for (const id of ids) {
    await api.put(`/api/checklist-items/${id}/phase`, { phase_id: phaseId });
  }
  await reloadChecklist();
  openManagePhase(phaseId);
}
async function savePhase(id) {
  await api.put(`/api/checklist-phases/${id}`, {
    label: document.getElementById('in-phase-label').value.trim(),
    sub: document.getElementById('in-phase-sub').value.trim()
  });
  closeSheet();
  await reloadChecklist();
}
function confirmDeletePhase(id) {
  openSheet(`
    <div class="sheet-title">Supprimer cette phase ?</div>
    <p style="color:var(--text2);font-size:14px;margin-bottom:16px">Les items qu'elle contient repartent en Inventaire seul (rien n'est supprimé).</p>
    <div class="confirm-btns">
      <button class="btn btn-secondary" onclick="openManagePhase('${id}')">Annuler</button>
      <button class="btn btn-danger" onclick="doDeletePhase('${id}')">Supprimer</button>
    </div>
  `);
}
async function doDeletePhase(id) {
  await api.del(`/api/checklist-phases/${id}`);
  closeSheet();
  await reloadChecklist();
}

// Réordonnancement des phases par appui long + glisser sur l'en-tête.
// Boîtes repliables (Inventaire par catégorie, Checklist par phase) : état
// purement client, non persisté — ça revient ouvert au rechargement.
let suppressPhaseClick = false;
function isCollapsed(key) { return (S.collapsedGroups || (S.collapsedGroups = new Set())).has(key); }
function toggleCollapse(key) {
  if (!S.collapsedGroups) S.collapsedGroups = new Set();
  if (S.collapsedGroups.has(key)) S.collapsedGroups.delete(key); else S.collapsedGroups.add(key);
  renderPrepa();
}
function handlePhaseHeaderClick(phaseId) {
  if (suppressPhaseClick) { suppressPhaseClick = false; return; }
  toggleCollapse('phase-' + phaseId);
}

function attachPhaseDragHandlers() {
  document.querySelectorAll('[data-phase-drag]').forEach(el => {
    let pressTimer = null;
    let startX = 0, startY = 0;
    let dragging = false;
    const clear = () => { if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; } };
    const onDown = (e) => {
      const pt = e.touches ? e.touches[0] : e;
      startX = pt.clientX; startY = pt.clientY;
      clear();
      pressTimer = setTimeout(() => {
        dragging = true;
        suppressPhaseClick = true;
        el.classList.add('dragging-active'); // ne bloque le défilement qu'à partir d'ici
        startPhaseDrag(el, pt.clientY);
      }, 450);
    };
    const onMove = (e) => {
      if (dragging) return;
      const pt = e.touches ? e.touches[0] : e;
      if (Math.abs(pt.clientX - startX) > 10 || Math.abs(pt.clientY - startY) > 10) clear();
    };
    const onUp = () => { clear(); dragging = false; el.classList.remove('dragging-active'); };
    el.addEventListener('touchstart', onDown, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: true });
    el.addEventListener('touchend', onUp);
    el.addEventListener('mousedown', onDown);
    el.addEventListener('mousemove', onMove);
    el.addEventListener('mouseup', onUp);
  });
}
function startPhaseDrag(handleEl) {
  const container = document.getElementById('checklist-phases-container');
  const group = handleEl.closest('.phase-group');
  if (!container || !group) return;
  if (navigator.vibrate) navigator.vibrate(15);
  group.classList.add('dragging');

  const onMove = (e) => {
    e.preventDefault && e.cancelable && e.preventDefault();
    const pt = e.touches ? e.touches[0] : e;
    const y = pt.clientY;
    const siblings = Array.from(container.querySelectorAll('.phase-group')).filter(s => s !== group);
    for (const sib of siblings) {
      const rect = sib.getBoundingClientRect();
      const mid = rect.top + rect.height / 2;
      if (y < mid) { container.insertBefore(group, sib); break; }
      if (!sib.nextElementSibling) { container.appendChild(group); }
    }
  };
  const onEnd = async () => {
    document.removeEventListener('touchmove', onMove);
    document.removeEventListener('touchend', onEnd);
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onEnd);
    group.classList.remove('dragging');
    const order = Array.from(container.querySelectorAll('.phase-group')).map(g => g.dataset.phaseId);
    await api.post(`/api/projects/${S.projectId}/checklist-phases/reorder`, { order });
    await reloadChecklist();
  };
  document.addEventListener('touchmove', onMove, { passive: false });
  document.addEventListener('touchend', onEnd);
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onEnd);
}

