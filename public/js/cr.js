// ==========================================================================
// Comptes-rendus hebdomadaires de tournage : défauts photographiés,
// notes libres colorées, et leurs actions.
// ==========================================================================

// ===== RENDER: CR LIST =====
function renderCRList() {
  const el = document.getElementById('cr-list');
  if (!S.crList.length) {
    el.innerHTML = `<div class="empty"><div class="empty-icon">📋</div><div class="empty-text">Aucun compte-rendu — appuie sur "+ Semaine"</div></div>`;
    return;
  }
  el.innerHTML = S.crList.map(cr => `
    <div class="list-item" onclick="goCR('${cr.id}')">
      <div class="list-item-content">
        <div class="list-item-title">${esc(cr.semaine_label)}</div>
        <div class="list-item-sub">${cr.date ? formatDateFr(cr.date) : formatDate(cr.created_at)}</div>
      </div>
      <span class="list-item-arrow">›</span>
    </div>
  `).join('');
}

// ===== RENDER: CR DETAIL =====
function renderCR() {
  document.getElementById('cr-title').textContent = S.cr.semaine_label;
  const el = document.getElementById('cr-content');
  const notes = S.cr.notes || [];
  let html = `<div class="pdf-banner" onclick="exportPDF()">
    <span class="pdf-banner-icon">📄</span>
    <div class="pdf-banner-text">
      <div class="pdf-banner-title">Exporter PDF</div>
      <div class="pdf-banner-sub">${S.cr.defauts.length} défaut(s)${notes.length ? ` · ${notes.length} note(s)` : ''}</div>
    </div>
    <span style="color:var(--accent);font-size:16px">›</span>
  </div>`;

  html += notes.map(n => `
    <div class="cr-note note-${esc(n.color)}">
      <div class="cr-note-text">${esc(n.text)}</div>
      <div class="defaut-actions" style="margin-top:10px">
        <button class="btn-icon-sm" style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1)" onclick="openEditCRNote('${n.id}')">✎</button>
        <button class="btn-icon-sm" style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);color:var(--red)" onclick="deleteCRNote('${n.id}')">✕</button>
      </div>
    </div>`).join('');

  if (!S.cr.defauts.length && !notes.length) {
    html += `<div class="empty"><div class="empty-icon">✅</div><div class="empty-text">Rien pour l'instant — appuie sur + pour ajouter un défaut ou une note</div></div>`;
  } else if (!S.cr.defauts.length) {
    html += '';
  } else {
    html += S.cr.defauts.map(d => {
      const photos = d.photos || [];
      const gallery = photos.length
        ? `<div class="photo-grid" style="padding:0;margin-bottom:10px">${photos.map(ph => `<a href="/photos/${esc(ph.file_path)}" target="_blank"><img class="photo-thumb" src="/photos/${esc(ph.file_path)}" loading="lazy"></a>`).join('')}</div>`
        : '';
      return `<div class="defaut-card">
        ${gallery}
        <div class="defaut-title">${esc(d.nom_objet)}${d.equipement_label ? ` · ${esc(d.equipement_label)}` : ''}</div>
        ${d.note ? `<div class="defaut-note">${esc(d.note)}</div>` : ''}
        <div class="defaut-actions">
          <button class="btn-icon-sm" onclick="openEditDefaut('${d.id}')">✎</button>
          <button class="btn-icon-sm" onclick="deleteDefaut('${d.id}')" style="color:var(--red)">✕</button>
        </div>
      </div>`;
    }).join('');
  }
  el.innerHTML = html;
}


// ===== ACTIONS: COMPTE-RENDUS (inchangé) =====
function openNewCR() {
  openSheet(`
    <div class="sheet-title">Nouveau compte-rendu</div>
    <div class="form-group"><label class="form-label">Date</label><input type="date" class="form-input" id="in-cr-date" value="${todayISO()}"></div>
    <div class="form-group"><label class="form-label">Titre (libre)</label><input class="form-input" id="in-cr-label" placeholder="Ex: Semaine, lieu"></div>
    <button class="btn btn-primary" onclick="createCR()">Créer</button>
  `);
}
async function createCR() {
  const label = document.getElementById('in-cr-label').value.trim();
  if (!label) return;
  const { id } = await api.post(`/api/projects/${S.projectId}/compte-rendus`, {
    semaine_label: label,
    date: document.getElementById('in-cr-date').value || ''
  });
  closeSheet();
  await goCR(id);
}
function openCRMenu() {
  openSheet(`
    <div class="sheet-title">${esc(S.cr.semaine_label)}</div>
    <div class="form-group"><label class="form-label">Date</label><input type="date" class="form-input" id="in-cr-date" value="${esc(S.cr.date || '')}"></div>
    <div class="form-group"><label class="form-label">Titre (libre)</label><input class="form-input" id="in-cr-label" value="${esc(S.cr.semaine_label)}"></div>
    <button class="btn btn-primary" style="margin-bottom:10px" onclick="saveCR()">Enregistrer</button>
    <button class="btn btn-danger" onclick="confirmDeleteCR()">Supprimer ce compte-rendu</button>
  `);
}
async function saveCR() {
  await api.put(`/api/compte-rendus/${S.crId}`, {
    semaine_label: document.getElementById('in-cr-label').value.trim(),
    date: document.getElementById('in-cr-date').value || ''
  });
  closeSheet();
  await goCR(S.crId);
}
function confirmDeleteCR() {
  openSheet(`
    <div class="sheet-title">Supprimer ce compte-rendu ?</div>
    <div class="confirm-btns">
      <button class="btn btn-secondary" onclick="closeSheet()">Annuler</button>
      <button class="btn btn-danger" onclick="deleteCR()">Supprimer</button>
    </div>
  `);
}
async function deleteCR() {
  await api.del(`/api/compte-rendus/${S.crId}`);
  closeSheet();
  await goCompteRendus();
}

// Menu du bouton + : défaut ou note
function openCRAddMenu() {
  openSheet(`
    <div class="sheet-title">Ajouter au compte-rendu</div>
    <button class="btn btn-secondary" style="margin-bottom:10px;display:flex;align-items:center;justify-content:center;gap:10px" onclick="openAddDefaut()">🛠 Ajouter un défaut</button>
    <button class="btn btn-secondary" style="display:flex;align-items:center;justify-content:center;gap:10px" onclick="openAddCRNote()">📝 Ajouter une note</button>
  `);
}

// Notes colorées du compte-rendu
function noteColorPicker(sel) {
  const colors = [['rouge','sw-rouge'],['noir','sw-noir'],['bleu','sw-bleu'],['vert','sw-vert']];
  return `<div class="note-colors">${colors.map(([c,cl]) =>
    `<div class="note-swatch ${cl} ${c===sel?'sel':''}" data-c="${c}" onclick="pickNoteColor('${c}')"></div>`).join('')}
  </div><input type="hidden" id="in-note-color" value="${esc(sel)}">`;
}
function pickNoteColor(c) {
  document.querySelectorAll('.note-swatch').forEach(s => s.classList.toggle('sel', s.dataset.c === c));
  document.getElementById('in-note-color').value = c;
}
function openAddCRNote() {
  openSheet(`
    <div class="sheet-title">Nouvelle note</div>
    <div class="form-group"><label class="form-label">Note *</label><textarea class="form-input" id="in-crnote-text" rows="3" placeholder="Remarque, info pour le loueur…"></textarea></div>
    <div class="form-group"><label class="form-label">Couleur</label>${noteColorPicker('noir')}</div>
    <button class="btn btn-primary" onclick="addCRNote(this)">Ajouter</button>
  `);
}
async function addCRNote(btn) {
  const text = document.getElementById('in-crnote-text').value.trim();
  if (!text) return;
  if (btn) btn.disabled = true;
  await api.post(`/api/compte-rendus/${S.crId}/notes`, {
    text, color: document.getElementById('in-note-color').value
  });
  closeSheet();
  S.cr = await api.get(`/api/compte-rendus/${S.crId}`);
  renderCR();
}
function openEditCRNote(id) {
  const n = (S.cr.notes || []).find(x => x.id === id);
  if (!n) return;
  openSheet(`
    <div class="sheet-title">Modifier la note</div>
    <div class="form-group"><label class="form-label">Note *</label><textarea class="form-input" id="in-crnote-text" rows="3">${esc(n.text)}</textarea></div>
    <div class="form-group"><label class="form-label">Couleur</label>${noteColorPicker(n.color)}</div>
    <button class="btn btn-primary" onclick="saveCRNote('${id}')">Enregistrer</button>
  `);
}
async function saveCRNote(id) {
  const text = document.getElementById('in-crnote-text').value.trim();
  if (!text) return;
  await api.put(`/api/cr-notes/${id}`, {
    text, color: document.getElementById('in-note-color').value
  });
  closeSheet();
  S.cr = await api.get(`/api/compte-rendus/${S.crId}`);
  renderCR();
}
async function deleteCRNote(id) {
  await api.del(`/api/cr-notes/${id}`);
  S.cr = await api.get(`/api/compte-rendus/${S.crId}`);
  renderCR();
}

// Defauts
function openAddDefaut() {
  openSheet(`
    <div class="sheet-title">Ajouter un défaut</div>
    <div class="form-group">
      <label class="form-label">Photos (appareil, pellicule…)</label>
      <input type="file" id="in-def-photo" accept="image/*" multiple class="form-input" style="padding:10px">
      <div style="font-size:12px;color:var(--text2);margin-top:4px">Tu peux en sélectionner plusieurs</div>
    </div>
    <div class="form-group">
      <label class="form-label">Nom de l'objet *</label>
      <input class="form-input" id="in-def-nom" placeholder="Ex: Objectif 25mm, Batterie V-Mount...">
    </div>
    <div class="form-group">
      <label class="form-label">Équipement / kit</label>
      <input class="form-input" id="in-def-equip" placeholder="Ex: Cam A, Boîte optique...">
    </div>
    <div class="form-group">
      <label class="form-label">Note</label>
      <textarea class="form-input" id="in-def-note" rows="2" placeholder="Description du défaut..."></textarea>
    </div>
    <button class="btn btn-primary" onclick="addDefaut(this)">Ajouter</button>
  `);
}
async function addDefaut(btn) {
  const nom = document.getElementById('in-def-nom').value.trim();
  if (!nom) return;
  if (btn) { btn.disabled = true; btn.textContent = 'Ajout…'; }
  const fd = new FormData();
  fd.append('nom_objet', nom);
  fd.append('equipement_label', document.getElementById('in-def-equip').value.trim());
  fd.append('note', document.getElementById('in-def-note').value.trim());
  for (const f of document.getElementById('in-def-photo').files) {
    fd.append('photos', await compressImage(f));
  }
  await api.upload(`/api/compte-rendus/${S.crId}/defauts`, fd);
  closeSheet();
  S.cr = await api.get(`/api/compte-rendus/${S.crId}`);
  renderCR();
}
function openEditDefaut(id) {
  const d = S.cr.defauts.find(x => x.id === id);
  if (!d) return;
  const photos = d.photos || [];
  const photosHtml = photos.length
    ? `<div class="photo-grid" style="padding:0;margin-bottom:8px">${photos.map(ph => `
        <div style="position:relative">
          <img class="photo-thumb" src="/photos/${esc(ph.file_path)}">
          <button class="btn-icon-sm" style="position:absolute;top:2px;right:2px;background:rgba(0,0,0,0.65);color:var(--red);width:24px;height:24px" onclick="deleteDefautPhoto('${ph.id}','${id}')">✕</button>
        </div>`).join('')}</div>`
    : '';
  openSheet(`
    <div class="sheet-title">Modifier le défaut</div>
    <div class="form-group">
      <label class="form-label">Photos</label>
      ${photosHtml}
      <input type="file" id="in-def-photo" accept="image/*" multiple class="form-input" style="padding:10px">
      <div style="font-size:12px;color:var(--text2);margin-top:4px">Ajoute d'autres photos si besoin</div>
    </div>
    <div class="form-group"><label class="form-label">Nom de l'objet *</label><input class="form-input" id="in-def-nom" value="${esc(d.nom_objet)}"></div>
    <div class="form-group">
      <label class="form-label">Équipement / kit</label>
      <input class="form-input" id="in-def-equip" value="${esc(d.equipement_label)}">
    </div>
    <div class="form-group"><label class="form-label">Note</label><textarea class="form-input" id="in-def-note" rows="2">${esc(d.note)}</textarea></div>
    <button class="btn btn-primary" onclick="saveDefaut('${id}', this)">Enregistrer</button>
  `);
}
async function saveDefaut(id, btn) {
  if (btn) { btn.disabled = true; btn.textContent = 'Enregistrement…'; }
  await api.put(`/api/defauts/${id}`, {
    nom_objet: document.getElementById('in-def-nom').value.trim(),
    equipement_label: document.getElementById('in-def-equip').value.trim(),
    note: document.getElementById('in-def-note').value.trim(),
  });
  const files = document.getElementById('in-def-photo').files;
  if (files.length) {
    const fd = new FormData();
    for (const f of files) fd.append('photos', await compressImage(f));
    await api.upload(`/api/defauts/${id}/photos`, fd);
  }
  closeSheet();
  S.cr = await api.get(`/api/compte-rendus/${S.crId}`);
  renderCR();
}
async function deleteDefautPhoto(photoId, defautId) {
  await api.del(`/api/defaut-photos/${photoId}`);
  S.cr = await api.get(`/api/compte-rendus/${S.crId}`);
  openEditDefaut(defautId);
}
async function deleteDefaut(id) {
  await api.del(`/api/defauts/${id}`);
  S.cr = await api.get(`/api/compte-rendus/${S.crId}`);
  renderCR();
}

