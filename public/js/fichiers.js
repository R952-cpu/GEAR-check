// ==========================================================================
// Onglet Fichiers : archive des comptes-rendus de prépa et pièces
// jointes (photos et PDF de la liste matos) rattachées au projet.
// ==========================================================================

// ===== RENDER: FICHIERS =====
function renderFichiers() {
  const reports = S.prepaReports || [];
  const attachments = S.attachments || [];

  let html = `<div class="section-hdr"><span class="section-hdr-label">Archive — comptes-rendus de prépa</span></div>`;
  if (!reports.length) {
    html += `<div class="empty" style="padding:34px 24px"><div class="empty-icon">🗄</div><div class="empty-text">Aucun compte-rendu de prépa pour l'instant — génère-le depuis l'onglet Checklist une fois la prépa terminée.</div></div>`;
  } else {
    html += `<div class="card" style="margin-bottom:20px">${reports.map(r => `
      <div class="list-item" onclick="openPrepaReport('${r.id}')">
        <div class="attach-icon pdf">🗄</div>
        <div class="list-item-content">
          <div class="list-item-title">${esc(r.label)}</div>
          <div class="list-item-sub">${formatDate(r.created_at)}</div>
        </div>
        <span class="list-item-arrow">›</span>
      </div>`).join('')}</div>`;
  }

  html += `<div class="section-hdr"><span class="section-hdr-label">Fichiers</span></div>`;
  html += `<div class="pdf-banner" onclick="openAttachFile()">
    <span class="pdf-banner-icon">📎</span>
    <div class="pdf-banner-text">
      <div class="pdf-banner-title">Joindre un fichier</div>
      <div class="pdf-banner-sub">Photo de la liste matos, bon de commande PDF…</div>
    </div>
    <span style="color:var(--accent);font-size:16px">›</span>
  </div>`;
  if (!attachments.length) {
    html += `<div class="empty"><div class="empty-icon">📄</div><div class="empty-text">Aucun fichier joint</div></div>`;
    return html;
  }
  html += `<div class="card">`;
  for (const a of attachments) {
    html += `<div class="attach-item">
      <div class="attach-icon ${a.file_type}">${a.file_type==='photo'?'🖼':'📄'}</div>
      <span class="attach-name">${esc(a.name)}</span>
      <a href="/photos/${esc(a.file_path)}" target="_blank" class="btn-icon-sm">↗</a>
      <button class="btn-icon-sm" onclick="deleteAttachment('${a.id}')" style="color:var(--red)">✕</button>
    </div>`;
  }
  html += `</div>`;
  return html;
}


// ===== ACTIONS: FICHIERS PRÉPA =====
function openAttachFile() {
  openSheet(`
    <div class="sheet-title">Joindre un fichier</div>
    <p style="color:var(--text2);font-size:14px;margin-bottom:16px">Photo de la liste matos, bon de commande PDF, etc.</p>
    <div class="form-group">
      <label class="form-label">Fichier</label>
      <input type="file" id="in-file" accept="image/*,.pdf" class="form-input" style="padding:10px">
    </div>
    <button class="btn btn-primary" onclick="uploadAttachment(this)">Joindre</button>
  `);
}
async function uploadAttachment(btn) {
  const file = document.getElementById('in-file').files[0];
  if (!file) return;
  const b = btn || event?.target;
  if (b) { b.disabled = true; b.textContent = 'Envoi…'; }
  const fd = new FormData();
  fd.append('file', await compressImage(file, 2200, 0.75)); // PDF inchangé, photo compressée
  await api.upload(`/api/projects/${S.projectId}/prepa/attachments`, fd);
  closeSheet();
  await reloadAttachments();
}
async function deleteAttachment(id) {
  await api.del(`/api/prepa-attachments/${id}`);
  await reloadAttachments();
}

