// ==========================================================================
// Export PDF des comptes-rendus de tournage, et compression des photos
// côté navigateur avant envoi.
// ==========================================================================

// ===== PDF EXPORT (inchangé) =====
async function exportPDF() {
  return avecChargement('Génération du PDF…', async () => {
  await chargerJsPDF();
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
  const W = 210, margin = 15;
  let y = margin;

  const addPage = () => { doc.addPage(); y = margin; };
  const checkY = (needed) => { if (y + needed > 280) addPage(); };

  // Header — sans "RÉGIE", avec assistant + contact
  const metaLines = [`${S.cr.semaine_label} · ${S.project.name}`];
  if (S.project.loueur) metaLines.push(`Loueur : ${S.project.loueur}`);
  const contact = [S.project.assistant, S.project.email, S.project.phone].filter(Boolean).join(' · ');
  if (contact) metaLines.push(contact);
  const headerH = 14 + metaLines.length * 5 + 3;
  doc.setFillColor(30, 30, 35);
  doc.rect(0, 0, W, headerH, 'F');
  doc.setTextColor(232, 160, 32);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('Compte-rendu', margin, 12);
  doc.setTextColor(180, 180, 190);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  if (S.cr.date) doc.text(formatDateFr(S.cr.date), W - margin, 12, { align: 'right' });
  let hy = 19;
  for (const line of metaLines) { doc.text(line, margin, hy); hy += 5; }
  y = headerH + 8;

  // Notes libres, dans leur couleur, avant les défauts
  const noteCols = { rouge: [200, 45, 45], noir: [30, 30, 35], bleu: [25, 85, 190], vert: [22, 130, 70] };
  for (const n of (S.cr.notes || [])) {
    const c = noteCols[n.color] || noteCols.noir;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    const lines = doc.splitTextToSize(n.text, W - margin * 2 - 6);
    checkY(lines.length * 5 + 6);
    doc.setFillColor(c[0], c[1], c[2]);
    doc.rect(margin, y - 3.5, 1.6, lines.length * 5 + 2, 'F');
    doc.setTextColor(c[0], c[1], c[2]);
    doc.text(lines, margin + 5, y);
    y += lines.length * 5 + 6;
  }
  if ((S.cr.notes || []).length) y += 2;

  if (!S.cr.defauts.length) {
    doc.setTextColor(100);
    doc.text('Aucun défaut enregistré.', margin, y);
    doc.save(`compte-rendu-${slugify(S.cr.semaine_label)}.pdf`);
    return;
  }

  for (const d of S.cr.defauts) {
    // Nom du matériel + kit ensemble, en gras
    const titleTxt = (d.nom_objet || '—') + (d.equipement_label ? ' · ' + d.equipement_label : '');
    checkY(15);
    doc.setTextColor(30, 30, 35);
    doc.setFillColor(240, 240, 245);
    doc.roundedRect(margin, y, W - margin * 2, 10, 2, 2, 'F');
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(titleTxt, margin + 3, y + 7);
    y += 13;

    // Photos (une ou plusieurs), ratio conservé
    for (const ph of (d.photos || [])) {
      try {
        const img = await loadImageForPdf(`/photos/${ph.file_path}`);
        const maxW = W - margin * 2;          // largeur dispo (180 mm)
        const maxH = 110;                     // hauteur max d'une photo (mm)
        let imgW = maxW;
        let imgH = imgW * img.h / img.w;
        if (imgH > maxH) { imgH = maxH; imgW = imgH * img.w / img.h; }
        checkY(imgH + 4);
        const imgX = margin + (maxW - imgW) / 2; // centré
        doc.addImage(img.data, 'JPEG', imgX, y, imgW, imgH);
        y += imgH + 4;
      } catch {}
    }

    // Note sous la/les photo(s)
    if (d.note) {
      checkY(8);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(80);
      const lines = doc.splitTextToSize(d.note, W - margin * 2);
      doc.text(lines, margin, y);
      y += lines.length * 5 + 2;
    }

    y += 8;
    checkY(1);
    doc.setDrawColor(200);
    doc.line(margin, y - 4, W - margin, y - 4);
  }

  doc.save(`compte-rendu-${slugify(S.cr.semaine_label)}.pdf`);
  });
}

// Compresse/redimensionne une image côté navigateur AVANT l'upload : envoi bien
// plus rapide (fluidité à l'ajout) et orientation EXIF corrigée dès la source.
// Renvoie le fichier inchangé si ce n'est pas une image (ex: PDF).
async function compressImage(file, max = 1600, quality = 0.7) {
  if (!file || !file.type || !file.type.startsWith('image/')) return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    let w = bitmap.width, h = bitmap.height;
    if (Math.max(w, h) > max) {
      const k = max / Math.max(w, h);
      w = Math.round(w * k);
      h = Math.round(h * k);
    }
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', quality));
    if (!blob) return file;
    const base = (file.name || 'photo').replace(/\.[^.]+$/, '');
    return new File([blob], base + '.jpg', { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

// Décode la photo en respectant l'orientation EXIF (photos iPhone) pour éviter
// toute déformation, redimensionne si trop grande, et renvoie data + dimensions
// réelles (oriented) pour que le ratio dans le PDF soit exact.
async function loadImageForPdf(src) {
  const blob = await (await fetch(src)).blob();
  let bitmap;
  try {
    bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  } catch {
    bitmap = await createImageBitmap(blob);
  }
  let w = bitmap.width, h = bitmap.height;
  const MAX = 1600;
  if (Math.max(w, h) > MAX) {
    const k = MAX / Math.max(w, h);
    w = Math.round(w * k);
    h = Math.round(h * k);
  }
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
  return { data: canvas.toDataURL('image/jpeg', 0.8), w, h };
}

