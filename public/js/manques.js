// ==========================================================================
// Onglet Manques : matériel à demander au loueur, et son export PDF.
// ==========================================================================

// ===== RENDER: MANQUES =====
function renderManques(manques) {
  if (!manques.length) {
    return `<div class="empty"><div class="empty-icon">${icone('package', { taille: 40 })}</div><div class="empty-text">Aucun manque — liste ici ce qui est à demander au loueur</div></div>`;
  }
  const stLabel = { a_demander: 'À demander', demande: 'Demandé', obtenu: 'Obtenu' };
  let html = `<div class="pdf-banner" onclick="exportManquesPDF()">
    <span class="pdf-banner-icon">${icone('file-text', { taille: 22 })}</span>
    <div class="pdf-banner-text">
      <div class="pdf-banner-title">Exporter la liste pour le loueur</div>
      <div class="pdf-banner-sub">PDF téléchargé et classé dans Fichiers</div>
    </div>
    <span style="color:var(--accent);display:flex">${icone('chevron-right', { taille: 16 })}</span>
  </div>`;
  for (const m of manques) {
    html += `<div class="manque">
      <div class="manque-top">
        <div class="manque-info">
          <div class="manque-label">${esc(m.label)}</div>
          ${m.qty ? `<div class="manque-meta">Quantité : ${esc(m.qty)}</div>` : ''}
        </div>
        <span class="status-pill status-${m.status}" onclick="cycleManque('${m.id}')">${stLabel[m.status]||m.status}</span>
      </div>
      ${m.note ? `<div class="manque-note">${esc(m.note)}</div>` : ''}
      <div class="defaut-actions" style="margin-top:10px">
        <button class="btn-icon-sm" style="background:var(--bg3)" onclick="openEditManque('${m.id}')" aria-label="Modifier">${icone('pencil', { taille: 15 })}</button>
        <button class="btn-icon-sm" style="background:var(--bg3);color:var(--red)" onclick="deleteManque('${m.id}')" aria-label="Supprimer">${icone('x', { taille: 15 })}</button>
      </div>
    </div>`;
  }
  return html;
}
function findManque(id) { return (S.manques || []).find(m => m.id === id); }

async function exportManquesPDF() {
  // Seul ce qui reste vraiment à demander au loueur a sa place sur ce PDF —
  // ce qui est déjà demandé/obtenu n'a plus rien à faire dans ce document.
  const manques = (S.manques || []).filter(m => m.status === 'a_demander');
  if (!manques.length) { showToast('Rien à demander pour le moment', true); return; }
  return avecChargement('Génération du PDF…', async () => {
  await chargerJsPDF();
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
  const W = 210, margin = 15;
  let y = margin;
  const addPage = () => { doc.addPage(); y = margin; };
  const checkY = (needed) => { if (y + needed > 280) addPage(); };

  const metaLines = [S.project.name];
  if (S.project.loueur) metaLines.push(`Loueur : ${S.project.loueur}`);
  const contact = [S.project.assistant, S.project.email, S.project.phone].filter(Boolean).join(' · ');
  if (contact) metaLines.push(contact);
  const headerH = 14 + metaLines.length * 5 + 3;
  doc.setFillColor(30, 30, 35);
  doc.rect(0, 0, W, headerH, 'F');
  doc.setTextColor(232, 160, 32);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('Liste des manques', margin, 12);
  doc.setTextColor(180, 180, 190);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(formatDate(new Date().toISOString()), W - margin, 12, { align: 'right' });
  let hy = 19;
  for (const line of metaLines) { doc.text(line, margin, hy); hy += 5; }
  y = headerH + 8;

  doc.setFontSize(11);
  manques.forEach((m, idx) => {
    checkY(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(20, 20, 20);
    doc.text(`${m.label}${m.qty ? '  (Qté : ' + m.qty + ')' : ''}`, margin, y);
    y += 5.5;
    if (m.note) {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(110);
      const lines = doc.splitTextToSize(m.note, W - margin * 2 - 4);
      checkY(lines.length * 4.5);
      doc.text(lines, margin + 4, y);
      y += lines.length * 4.5;
      doc.setFontSize(11);
    }
    y += 3;
    if (idx < manques.length - 1) {
      checkY(4);
      doc.setDrawColor(210);
      doc.line(margin, y - 1.5, W - margin, y - 1.5);
      y += 4;
    }
  });

  const filename = `manques-${slugify(S.project.name)}.pdf`;
  doc.save(filename);
  try {
    const blob = doc.output('blob');
    const file = new File([blob], filename, { type: 'application/pdf' });
    const fd = new FormData();
    fd.append('file', file);
    await api.upload(`/api/projects/${S.projectId}/prepa/attachments`, fd);
    showToast('Liste exportée et classée dans Fichiers');
  } catch {
    showToast('PDF téléchargé (échec de la copie dans Fichiers)', true);
  }
  });
}


// ===== ACTIONS: MANQUES =====
function openAddManque() {
  openSheet(`
    <div class="sheet-title">Nouveau manque</div>
    <div class="form-group"><label class="form-label">Objet manquant *</label><input class="form-input" id="in-mq-label" placeholder="Ex: Batterie V-Mount, Câble SDI 30m…"></div>
    <div class="form-group"><label class="form-label">Quantité</label><input class="form-input" id="in-mq-qty" placeholder="Ex: 2, 1 jeu…"></div>
    <div class="form-group"><label class="form-label">Note</label><textarea class="form-input" id="in-mq-note" rows="2" placeholder="Précision pour le loueur…"></textarea></div>
    <button class="btn btn-primary" onclick="addManque(this)">Ajouter</button>
  `);
}
async function addManque(btn) {
  const label = document.getElementById('in-mq-label').value.trim();
  if (!label) return;
  if (btn) btn.disabled = true;
  await api.post(`/api/projects/${S.projectId}/manques`, {
    label, qty: document.getElementById('in-mq-qty').value.trim(), note: document.getElementById('in-mq-note').value.trim()
  });
  closeSheet();
  await reloadManques();
}
function openEditManque(id) {
  const m = findManque(id); if (!m) return;
  openSheet(`
    <div class="sheet-title">Modifier le manque</div>
    <div class="form-group"><label class="form-label">Objet *</label><input class="form-input" id="in-mq-label" value="${esc(m.label)}"></div>
    <div class="form-group"><label class="form-label">Quantité</label><input class="form-input" id="in-mq-qty" value="${esc(m.qty)}"></div>
    <div class="form-group"><label class="form-label">Note</label><textarea class="form-input" id="in-mq-note" rows="2">${esc(m.note)}</textarea></div>
    <div class="form-group"><label class="form-label">Statut</label>
      <select class="form-select" id="in-mq-status">
        <option value="a_demander" ${m.status==='a_demander'?'selected':''}>À demander</option>
        <option value="demande" ${m.status==='demande'?'selected':''}>Demandé</option>
        <option value="obtenu" ${m.status==='obtenu'?'selected':''}>Obtenu</option>
      </select>
    </div>
    <button class="btn btn-primary" onclick="saveManque('${id}')">Enregistrer</button>
  `);
}
async function saveManque(id) {
  const label = document.getElementById('in-mq-label').value.trim();
  if (!label) return;
  await api.put(`/api/manques/${id}`, {
    label,
    qty: document.getElementById('in-mq-qty').value.trim(),
    note: document.getElementById('in-mq-note').value.trim(),
    status: document.getElementById('in-mq-status').value
  });
  closeSheet();
  await reloadManques();
}
async function cycleManque(id) {
  const m = findManque(id); if (!m) return;
  const next = { a_demander: 'demande', demande: 'obtenu', obtenu: 'a_demander' };
  await api.put(`/api/manques/${id}`, { label: m.label, qty: m.qty, note: m.note, status: next[m.status] || 'a_demander' });
  await reloadManques();
}
async function deleteManque(id) {
  await api.del(`/api/manques/${id}`);
  await reloadManques();
}

