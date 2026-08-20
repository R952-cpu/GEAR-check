// ==========================================================================
// Onglet Réglages : profils de réglages caméra.
//
// Un profil regroupe plusieurs caméras identiques et porte les réglages menu à
// appliquer. Il n'apparaît dans la Checklist qu'une fois confirmé.
// ==========================================================================

// ===== RÉGLAGES CAMÉRA (profils partagés, onglet dédié entre Inventaire et Checklist) =====
function renderCameraSettingsView() {
  const cameras = (S.checklist.items || []).filter(it => it.type === 'CAMERA');
  const profiles = S.cameraProfiles || [];

  if (!cameras.length) {
    return `<div class="empty"><div class="empty-icon">⚙</div><div class="empty-text">Aucune caméra dans l'inventaire pour l'instant. Importe ta liste (Inventaire) pour pouvoir créer des profils de réglages.</div></div>`;
  }

  let html = `<p style="color:var(--text2);font-size:13.5px;margin-bottom:16px">Choisis les caméras disponibles et rentre leurs réglages menu. Chaque profil a sa couleur : dans la Checklist, chaque caméra reste affichée individuellement mais avec le petit carré de couleur de son profil à côté du nom, et les caméras sont classées par couleur à la suite dans la phase Caméra.</p>`;

  if (!profiles.length) {
    html += `<div class="empty"><div class="empty-icon">🎛</div><div class="empty-text">Aucun profil pour l'instant — appuie sur "+ Profil" pour en créer un.</div></div>`;
    return html;
  }

  html += profiles.map(p => `
    <div class="card" style="margin-bottom:14px">
      <div class="card-header">
        <span style="display:inline-block;width:14px;height:14px;border-radius:4px;background:${esc(p.color)};flex-shrink:0"></span>
        <div style="flex:1"><div class="card-title">${esc(p.label)}</div><div class="card-sub">${p.settings.length} réglage(s) ${p.validated ? '· ✓ confirmé, visible dans la Checklist' : '· pas encore confirmé'}</div></div>
        <button class="btn-icon-sm" onclick="openEditCameraProfile('${p.id}')">✎</button>
      </div>
      <div>
        ${p.settings.map(s => `
          <div class="check-item">
            <div class="check-box ${s.done?'checked':''}" onclick="toggleProfileSetting('${s.id}',${s.done})">${s.done?'✓':''}</div>
            <div class="check-item-content"><div class="check-item-label ${s.done?'done':''}">${esc(s.text)}</div></div>
            <button class="btn-icon-sm" style="color:var(--red)" onclick="deleteProfileSetting('${s.id}')">✕</button>
          </div>`).join('')}
        <div style="padding:10px 16px;display:flex;gap:8px">
          <input class="form-input" id="in-setting-${p.id}" placeholder="Ex: Codec XAVC-I, 25p…" style="flex:1">
          <button class="btn-icon-sm" style="background:var(--bg3)" onclick="addProfileSetting('${p.id}')">＋</button>
        </div>
      </div>
      <div style="padding:12px 16px;border-top:1px solid rgba(255,255,255,0.055)">
        <div class="form-label" style="margin-bottom:8px">Caméras assignées</div>
        ${cameras.map(c => `
          <div class="pick-row" onclick="assignCameraProfileFromSettings('${c.id}', '${c.camera_profile_id===p.id ? '' : p.id}')">
            <div class="pick-box ${c.camera_profile_id===p.id?'checked':''}">✓</div>
            <div style="font-size:14px">${esc(c.designation)}</div>
          </div>`).join('')}
      </div>
      <div style="padding:12px 16px;border-top:1px solid rgba(255,255,255,0.055)">
        <button class="btn ${p.validated ? 'btn-secondary' : 'btn-primary'}" onclick="validateCameraProfile('${p.id}')">${p.validated ? '✓ Confirmé — reconfirmer' : '✓ Confirmer et insérer dans la Checklist'}</button>
      </div>
    </div>`).join('');

  return html;
}
const PROFILE_COLORS = ['#2ed6b3','#f25c5c','#58a6ff','#46c07a','#f0a636','#a855f7','#ec4899','#9aa3b2'];
function profileColorPicker(selected) {
  return `<div class="note-colors">${PROFILE_COLORS.map(c =>
    `<div class="note-swatch ${c===selected?'sel':''}" style="background:${c};border-color:${c===selected?'#fff':'rgba(255,255,255,0.16)'}" data-c="${c}" onclick="pickProfileColor('${c}')"></div>`).join('')}
  </div><input type="hidden" id="in-profile-color" value="${esc(selected)}">`;
}
function pickProfileColor(c) {
  document.querySelectorAll('#sheet .note-swatch').forEach(s => { s.classList.toggle('sel', s.dataset.c === c); s.style.borderColor = s.dataset.c === c ? '#fff' : 'rgba(255,255,255,0.16)'; });
  document.getElementById('in-profile-color').value = c;
}
function openCreateCameraProfileSheet() {
  if (!(S.checklist.items || []).some(it => it.type === 'CAMERA')) {
    showToast("Importe d'abord des caméras dans Inventaire", true);
    return;
  }
  const defaultColor = PROFILE_COLORS[(S.cameraProfiles || []).length % PROFILE_COLORS.length];
  openSheet(`
    <div class="sheet-title">Nouveau profil de réglages</div>
    <div class="form-group"><label class="form-label">Nom *</label><input class="form-input" id="in-new-profile" placeholder="Ex: Setup FX6 standard"></div>
    <div class="form-group"><label class="form-label">Couleur</label>${profileColorPicker(defaultColor)}</div>
    <button class="btn btn-primary" onclick="createCameraProfile(this)">Créer le profil</button>
  `);
}
async function createCameraProfile(btn) {
  const label = document.getElementById('in-new-profile').value.trim();
  if (!label) return;
  if (btn) btn.disabled = true;
  await api.post(`/api/projects/${S.projectId}/camera-profiles`, { label, color: document.getElementById('in-profile-color').value });
  closeSheet();
  S.cameraProfiles = await api.get(`/api/projects/${S.projectId}/camera-profiles`);
  renderPrepa();
}
function openEditCameraProfile(id) {
  const p = (S.cameraProfiles || []).find(x => x.id === id);
  if (!p) return;
  openSheet(`
    <div class="sheet-title">Modifier le profil</div>
    <div class="form-group"><label class="form-label">Nom *</label><input class="form-input" id="in-new-profile" value="${esc(p.label)}"></div>
    <div class="form-group"><label class="form-label">Couleur</label>${profileColorPicker(p.color)}</div>
    <button class="btn btn-primary" style="margin-bottom:10px" onclick="saveCameraProfile('${id}')">Enregistrer</button>
    <button class="btn btn-danger" onclick="deleteCameraProfile('${id}')">Supprimer le profil</button>
  `);
}
async function saveCameraProfile(id) {
  const label = document.getElementById('in-new-profile').value.trim();
  if (!label) return;
  await api.put(`/api/camera-profiles/${id}`, { label, color: document.getElementById('in-profile-color').value });
  closeSheet();
  S.cameraProfiles = await api.get(`/api/projects/${S.projectId}/camera-profiles`);
  renderPrepa();
}
async function validateCameraProfile(id) {
  await api.post(`/api/camera-profiles/${id}/validate`, {});
  S.cameraProfiles = await api.get(`/api/projects/${S.projectId}/camera-profiles`);
  await reloadChecklist();
  showToast('✓ Profil confirmé — visible dans la Checklist');
}
async function deleteCameraProfile(id) {
  await api.del(`/api/camera-profiles/${id}`);
  closeSheet();
  S.cameraProfiles = await api.get(`/api/projects/${S.projectId}/camera-profiles`);
  await reloadChecklist();
}
async function addProfileSetting(profileId) {
  const input = document.getElementById(`in-setting-${profileId}`);
  const text = input.value.trim();
  if (!text) return;
  await api.post(`/api/camera-profiles/${profileId}/settings`, { text });
  S.cameraProfiles = await api.get(`/api/projects/${S.projectId}/camera-profiles`);
  renderPrepa();
}
// Coche un réglage depuis l'onglet Réglages : appliqué tout de suite, envoyé
// ensuite (voir `majOptimiste` dans core.js).
async function toggleProfileSetting(id, current) {
  const reglage = (S.cameraProfiles || []).flatMap(p => p.settings || []).find(r => r.id === id);
  if (!reglage) return;
  const avant = reglage.done;
  await majOptimiste({
    appliquer: () => { reglage.done = current ? 0 : 1; },
    annuler: () => { reglage.done = avant; },
    envoyer: () => api.put(`/api/camera-profile-settings/${id}`, { done: !current }),
    redessiner: () => renderPrepa(),
  });
}
async function deleteProfileSetting(id) {
  await api.del(`/api/camera-profile-settings/${id}`);
  S.cameraProfiles = await api.get(`/api/projects/${S.projectId}/camera-profiles`);
  renderPrepa();
}

