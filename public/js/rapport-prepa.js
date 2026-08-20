// ==========================================================================
// Compte-rendu de prépa : instantané figé de l'inventaire et de la
// checklist, son archivage et son export PDF.
//
// Le PDF est volontairement rédigé pour un lecteur non technicien : statuts en
// clair, nom du matériel en évidence, remarques en rouge.
// ==========================================================================

// ===== COMPTE-RENDU DE PRÉPA (archive, snapshot figé de l'inventaire/checklist) =====
// Fige l'état d'un item pour l'archive.
//
// Le statut « prêt » doit se décider sur EXACTEMENT les mêmes checks que la
// Checklist, c'est-à-dire ceux que le mode en cours rend visibles. En mode
// simple, les checks marqués « avancés » sont masqués à l'écran : les compter
// ici faisait annoncer « vérification en cours » sur du matériel que la
// Checklist affichait comme validé, sans que rien ne soit cochable pour y
// remédier. C'est `visibleChecks()` qui fait foi, dans les deux endroits.
//
// `checkedLabels` reste en revanche la liste de TOUT ce qui a réellement été
// vérifié, avancés compris : c'est un constat factuel, pas un calcul d'état.
//
// @param {boolean} avecVerification  false pour la section « Inventaire hors
//   phase », où le matériel n'est présenté que sous l'angle de sa présence :
//   y afficher un compteur de vérification n'aurait pas de sens, puisque ces
//   items ne figurent dans aucune phase de checking.
function snapshotItem(it, avecVerification = true) {
  const base = {
    designation: it.designation,
    identifiant: it.identifiant || '',
    quantite: it.quantite,
    presence: !!it.presence_cochee,
    notes: (it.notes || []).map(n => n.text),
  };
  if (!avecVerification) return base;

  const retenus = visibleChecks(it);
  return {
    ...base,
    checksDone: retenus.filter(c => c.done).length,
    checksTotal: retenus.length,
    checkedLabels: (it.checks || []).filter(c => c.done).map(c => c.label),
  };
}

function buildPrepaSnapshot() {
  const items = S.checklist.items || [];
  const phases = S.checklist.phases || [];
  const phaseData = phases.map(p => ({
    label: p.label,
    sub: p.sub || '',
    // Appel explicite à un seul argument : passer `snapshotItem` directement à
    // `map` lui transmettrait aussi l'index, qui atterrirait dans le second
    // paramètre et ferait perdre ses compteurs au premier item de chaque phase.
    items: items.filter(it => it.phase_id === p.id).map(it => snapshotItem(it)),
  })).filter(p => p.items.length);

  const unphased = items.filter(it => !it.phase_id);
  const byCat = {};
  for (const it of unphased) {
    (byCat[it.categorie] = byCat[it.categorie] || []).push(snapshotItem(it, false));
  }
  const inventaireHorsPhase = CATEGORIE_ORDER.filter(c => byCat[c]).map(c => ({ categorie: CATEGORIE_LABELS[c], items: byCat[c] }));

  return {
    project: { name: S.project.name, prod: S.project.prod, loueur: S.project.loueur, assistant: S.project.assistant, email: S.project.email, phone: S.project.phone },
    generated_at: new Date().toISOString(),
    // Sur quelle base les statuts ont été calculés (checklist simple ou avancée).
    mode_avance: !!S.checklistAdvanced,
    phases: phaseData,
    inventaire_hors_phase: inventaireHorsPhase,
  };
}


// Phrase résumant le pointage de l'inventaire.
//
// Le compte-rendu s'adresse à la production : ce qui l'intéresse, c'est l'état
// du matériel vérifié phase par phase. Le pointage de l'inventaire est une
// étape de travail en amont — la détailler noyait le document sous des dizaines
// de lignes « présent » sans intérêt pour le lecteur.
//
// Le nombre reste mentionné : un élément non pointé ne doit pas disparaître
// silencieusement, même si le détail n'a pas sa place ici.
function phraseInventaire(horsPhase) {
  const items = (horsPhase || []).flatMap(c => c.items);
  if (!items.length) return '';
  const presents = items.filter(it => it.presence).length;
  return presents === items.length
    ? `Le reste du matériel a été pointé un par un : ${items.length} éléments, tous présents.`
    : `Le reste du matériel a été pointé un par un : ${presents} éléments présents sur ${items.length}.`;
}

// Statut en langage clair (pas de jargon "checks X/Y") — pour qu'un directeur
// de prod qui ne connaît pas l'appli comprenne d'un coup d'œil où ça en est.
function reportItemStatus(it) {
  if (!it.presence) return { txt: 'Absent', kind: 'red' };
  if (!it.checksTotal || it.checksDone === it.checksTotal) return { txt: 'Présent — prêt', kind: 'green' };
  return { txt: 'Présent — vérification en cours', kind: 'orange' };
}
function reportNameText(it) {
  return `${it.designation}${it.quantite>1?' ×'+it.quantite:''}${it.identifiant ? ' — ' + it.identifiant : ''}`;
}
function reportSectionSummary(items) {
  const ready = items.filter(it => reportItemStatus(it).kind === 'green').length;
  return `${ready}/${items.length} prêt(s)`;
}

function confirmGeneratePrepaReport() {
  openSheet(`
    <div class="sheet-title">Générer le compte-rendu de prépa ?</div>
    <p style="color:var(--text2);font-size:14px;margin-bottom:16px">Le PDF s'ouvre directement et une copie est classée dans Fichiers, comme pour une pièce jointe.</p>
    <div class="confirm-btns">
      <button class="btn btn-secondary" onclick="closeSheet()">Annuler</button>
      <button class="btn btn-primary" onclick="generatePrepaReport(this)">Générer</button>
    </div>
  `);
}
async function generatePrepaReport(btn) {
  if (btn) btn.disabled = true;
  await chargerJsPDF();
  const data = buildPrepaSnapshot();
  const label = `Compte-rendu de prépa · ${formatDate(data.generated_at)}`;
  await api.post(`/api/projects/${S.projectId}/prepa-reports`, { label, data });

  // Uniquement archivé dans Fichiers → Archive (pas dans les pièces jointes) —
  // le PDF téléchargé localement reste une simple copie de travail.
  const doc = buildPrepaReportDoc({ label, data });
  const filename = `compte-rendu-prepa-${slugify(data.project.name)}-${data.generated_at.slice(0,10)}.pdf`;
  doc.save(filename);

  closeSheet();
  showToast('✓ Compte-rendu de prépa généré (Fichiers → Archive)');
}

async function openPrepaReport(id) {
  const r = await api.get(`/api/prepa-reports/${id}`);
  window.__currentPrepaReport = r;
  const d = r.data;
  const badgeClass = { green: 'badge-green', orange: 'badge-orange', red: 'badge-red' };
  const renderSection = (title, sub, items) => `
    <div class="phase-group" style="margin-bottom:14px">
      <div class="phase-group-hdr" style="cursor:default">
        <div style="flex:1">
          <div class="phase-group-title">${esc(title)}</div>
          ${sub ? `<div class="phase-group-sub">${esc(sub)}</div>` : ''}
        </div>
        <span style="font-size:12px;color:var(--text2)">${reportSectionSummary(items)}</span>
      </div>
      <div>${items.map(it => {
        const st = reportItemStatus(it);
        return `<div class="list-item" style="cursor:default;align-items:flex-start">
          <div class="list-item-content">
            <div style="font-size:16.5px;font-weight:750;color:var(--text)">${esc(reportNameText(it))}</div>
            <div class="list-item-sub" style="margin-top:3px"><span class="badge ${badgeClass[st.kind]}">${st.txt}</span></div>
            ${it.notes.length ? `<div style="color:var(--red);font-size:12.5px;font-style:italic;margin-top:6px">${it.notes.map(esc).join(' · ')}</div>` : ''}
            ${it.checkedLabels && it.checkedLabels.length ? `<div style="color:var(--text2);font-size:12px;margin-top:6px">Vérifié : ${it.checkedLabels.map(esc).join(' · ')}</div>` : ''}
          </div>
        </div>`;
      }).join('')}</div>
    </div>`;

  // Le décompte ne porte que sur le matériel réellement vérifié, pour qu'il
  // corresponde à ce qui est listé juste en dessous.
  const allItems = d.phases.flatMap(p => p.items);
  const readyCount = allItems.filter(it => reportItemStatus(it).kind === 'green').length;

  let body = `<div class="sheet-title">${esc(r.label)}</div>`;
  body += `<p style="color:var(--text2);font-size:13.5px;margin-bottom:16px">${esc(d.project.name)}${d.project.loueur ? ' · Loueur : ' + esc(d.project.loueur) : ''}<br>${readyCount}/${allItems.length} éléments prêts au total.</p>`;
  // Deux familles de sections cohabitent dans le compte-rendu : les phases de
  // vérification, et le reste de l'inventaire regroupé par catégorie. Elles
  // portent parfois le MÊME nom — la phase « Caméra » et la catégorie
  // « Caméra » — et étaient rendues à l'identique, ce qui donnait l'impression
  // d'une section en double. Le préfixe et l'intertitre lèvent l'ambiguïté.
  for (const p of d.phases) body += renderSection(p.label, p.sub, p.items);
  const phrase = phraseInventaire(d.inventaire_hors_phase);
  if (phrase) {
    body += `<p style="color:var(--text2);font-size:13px;font-style:italic;margin:18px 0 14px">${esc(phrase)}</p>`;
  }
  body += `<button class="btn btn-primary" style="margin-bottom:10px" onclick="exportPrepaReportPDF()">📄 Réexporter en PDF</button>
    <button class="btn btn-danger" onclick="deletePrepaReport('${id}')">Supprimer cette archive</button>`;
  openSheet(body, { autofocus: false });
}
async function deletePrepaReport(id) {
  await api.del(`/api/prepa-reports/${id}`);
  closeSheet();
  await reloadPrepaReports();
}

function buildPrepaReportDoc(r) {
  const d = r.data;
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
  const W = 210, margin = 15;
  let y = margin;
  const addPage = () => { doc.addPage(); y = margin; };
  const checkY = (needed) => { if (y + needed > 280) addPage(); };

  const metaLines = [d.project.name];
  if (d.project.loueur) metaLines.push(`Loueur : ${d.project.loueur}`);
  const contact = [d.project.assistant, d.project.email, d.project.phone].filter(Boolean).join(' · ');
  if (contact) metaLines.push(contact);
  const headerH = 14 + metaLines.length * 5 + 3;
  doc.setFillColor(30, 30, 35);
  doc.rect(0, 0, W, headerH, 'F');
  doc.setTextColor(232, 160, 32);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('Compte-rendu de prépa', margin, 12);
  doc.setTextColor(180, 180, 190);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(formatDate(d.generated_at), W - margin, 12, { align: 'right' });
  let hy = 19;
  for (const line of metaLines) { doc.text(line, margin, hy); hy += 5; }
  y = headerH + 8;

  // Résumé global en tête, pour une lecture rapide sans jargon technique.
  const allItems = d.phases.flatMap(p => p.items);
  const readyCount = allItems.filter(it => reportItemStatus(it).kind === 'green').length;
  checkY(10);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 30, 35);
  doc.text(`Résumé : ${readyCount} / ${allItems.length} éléments prêts.`, margin, y);
  y += 10;

  const section = (title, items) => {
    if (!items.length) return;
    checkY(12);
    doc.setFillColor(240, 240, 245);
    doc.roundedRect(margin, y - 4, W - margin * 2, 8, 2, 2, 'F');
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 30, 35);
    doc.text(`${title}  —  ${reportSectionSummary(items)}`, margin + 3, y + 1.5);
    y += 11;
    for (const it of items) {
      const st = reportItemStatus(it);
      // Réf matos en gros, en noir — c'est ce qu'on doit repérer d'un coup d'œil.
      const nameLine = reportNameText(it) + (st.kind === 'red' ? '  —  Absent' : '');
      checkY(7);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(st.kind === 'red' ? 190 : 20, st.kind === 'red' ? 60 : 20, st.kind === 'red' ? 60 : 20);
      doc.text(nameLine, margin + 2, y);
      y += 5.5;

      // Annotation (note libre) juste sous le nom, petite et en rouge.
      if (it.notes && it.notes.length) {
        doc.setFontSize(8.5);
        doc.setFont('helvetica', 'italic');
        doc.setTextColor(200, 50, 50);
        const noteLines = doc.splitTextToSize(it.notes.join(' · '), W - margin * 2 - 8);
        checkY(noteLines.length * 4);
        doc.text(noteLines, margin + 4, y);
        y += noteLines.length * 4;
      }

      // Puis, à la suite, tout ce qui a été coché sur l'item.
      if (it.checkedLabels && it.checkedLabels.length) {
        doc.setFontSize(8.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(90, 90, 95);
        const checkedLines = doc.splitTextToSize(`Vérifié : ${it.checkedLabels.join(' · ')}`, W - margin * 2 - 8);
        checkY(checkedLines.length * 4);
        doc.text(checkedLines, margin + 4, y);
        y += checkedLines.length * 4;
      }
      y += 3;
    }
    y += 3;
  };

  for (const p of d.phases) section(`${p.label}${p.sub ? ' — ' + p.sub : ''}`, p.items);

  const phrase = phraseInventaire(d.inventaire_hors_phase);
  if (phrase) {
    checkY(12);
    y += 3;
    doc.setFontSize(9.5);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(110, 110, 118);
    for (const ligne of doc.splitTextToSize(phrase, W - margin * 2)) {
      doc.text(ligne, margin, y);
      y += 5;
    }
  }

  return doc;
}
async function exportPrepaReportPDF() {
  const r = window.__currentPrepaReport;
  if (!r) return;
  await chargerJsPDF();
  const doc = buildPrepaReportDoc(r);
  doc.save(`compte-rendu-prepa-${slugify(r.data.project.name)}-${(r.data.generated_at || '').slice(0, 10)}.pdf`);
}

