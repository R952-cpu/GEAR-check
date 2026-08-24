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
    html += `<div class="empty" style="padding:34px 24px"><div class="empty-icon">${icone('archive', { taille: 40 })}</div><div class="empty-text">Aucun compte-rendu de prépa pour l'instant — génère-le depuis l'onglet Checklist une fois la prépa terminée.</div></div>`;
  } else {
    // Un compte-rendu se comporte comme un fichier : on clique dessus pour
    // l'ouvrir en PDF. Le crayon donne accès au détail (photos, légendes), la
    // croix rouge le supprime — même disposition que les pièces jointes juste
    // en dessous, pour ne pas avoir deux logiques dans le même écran.
    html += `<div class="card" style="margin-bottom:20px">${reports.map(r => {
      const details = [
        `Version ${esc(r.version_label || r.version || 1)}`,
        r.version_note && esc(r.version_note),
        formatDate(r.created_at),
        r.nb_photos ? `${r.nb_photos} photo${r.nb_photos > 1 ? 's' : ''}` : '',
      ].filter(Boolean).join(' · ');
      return `
      <div class="attach-item">
        <div class="attach-icon pdf">${icone('archive', { taille: 18 })}</div>
        <div style="flex:1;min-width:0;cursor:pointer" onclick="ouvrirPdfArchive('${r.id}', this)">
          <div class="attach-name" style="display:block">${esc(r.titre || r.label)}</div>
          <div class="list-item-sub">${details}</div>
        </div>
        <button class="btn-icon-sm" onclick="openPrepaReport('${r.id}')" title="Détail et photos" aria-label="Détail et photos">${icone('pencil', { taille: 15 })}</button>
        <button class="btn-icon-sm" style="color:var(--red)" onclick="confirmerSuppressionArchive('${r.id}')" aria-label="Supprimer">${icone('x', { taille: 15 })}</button>
      </div>`;
    }).join('')}</div>`;
  }

  html += `<div class="section-hdr"><span class="section-hdr-label">Fichiers</span></div>`;
  html += `<div class="pdf-banner" onclick="openAttachFile()">
    <span class="pdf-banner-icon">${icone('paperclip', { taille: 22 })}</span>
    <div class="pdf-banner-text">
      <div class="pdf-banner-title">Joindre un fichier</div>
      <div class="pdf-banner-sub">Photo de la liste matos, bon de commande PDF…</div>
    </div>
    <span style="color:var(--accent);display:flex">${icone('chevron-right', { taille: 16 })}</span>
  </div>`;
  if (!attachments.length) {
    html += `<div class="empty"><div class="empty-icon">${icone('paperclip', { taille: 40 })}</div><div class="empty-text">Aucun fichier joint</div></div>`;
    return html;
  }
  html += `<div class="card">`;
  for (const a of attachments) {
    html += `<div class="attach-item">
      <div class="attach-icon ${a.file_type}">${icone(a.file_type === 'photo' ? 'image' : 'file-text', { taille: 18 })}</div>
      <span class="attach-name">${esc(a.name)}</span>
      <a href="/photos/${esc(a.file_path)}" target="_blank" class="btn-icon-sm" aria-label="Ouvrir">${icone('external-link', { taille: 15 })}</a>
      <button class="btn-icon-sm" onclick="deleteAttachment('${a.id}')" style="color:var(--red)" aria-label="Supprimer">${icone('x', { taille: 15 })}</button>
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
  await avecChargement('Envoi du fichier…', async () => {
    const fd = new FormData();
    fd.append('file', await compressImage(file, 2200, 0.75)); // PDF inchangé, photo compressée
    await api.upload(`/api/projects/${S.projectId}/prepa/attachments`, fd);
  });
  closeSheet();
  await reloadAttachments();
}
async function deleteAttachment(id) {
  await api.del(`/api/prepa-attachments/${id}`);
  await reloadAttachments();
}

