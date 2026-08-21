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

// ===== PHOTOS EN ATTENTE =====
//
// Les photos choisies pendant la génération ne peuvent pas être envoyées tout
// de suite : le compte-rendu auquel les rattacher n'existe pas encore. Elles
// patientent donc ici, déjà compressées, jusqu'à ce que le compte-rendu soit
// créé — puis partent en une seule requête.

let photosEnAttente = [];

/** Ouvre le sélecteur de photos (appareil ou pellicule sur téléphone). */
function choisirPhotosRapport() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.multiple = true;
  input.onchange = async () => {
    for (const fichier of [...input.files]) {
      // Compression avant tout : une photo de téléphone pèse plusieurs Mo, et
      // seule une version réduite est utile dans un PDF.
      const compresse = await compressImage(fichier);
      photosEnAttente.push({
        fichier: compresse,
        apercu: URL.createObjectURL(compresse),
        legende: '',
      });
    }
    renderPhotosEnAttente();
  };
  input.click();
}

function majLegendePhotoEnAttente(index, valeur) {
  if (photosEnAttente[index]) photosEnAttente[index].legende = valeur;
}

function retirerPhotoEnAttente(index) {
  const [retiree] = photosEnAttente.splice(index, 1);
  if (retiree) URL.revokeObjectURL(retiree.apercu);
  renderPhotosEnAttente();
}

/**
 * Redessine la liste des photos choisies.
 *
 * Les légendes sont mémorisées à la frappe (`oninput`) et non à la lecture du
 * DOM : redessiner la liste ne peut donc pas faire perdre ce qui vient d'être
 * tapé dans un autre champ.
 */
function renderPhotosEnAttente() {
  const zone = document.getElementById('rapport-photos');
  if (!zone) return;
  if (!photosEnAttente.length) {
    zone.innerHTML = `<div style="color:var(--text3);font-size:13px;margin-bottom:8px">Aucune photo pour l'instant.</div>`;
    return;
  }
  zone.innerHTML = photosEnAttente.map((p, i) => `
    <div style="display:flex;gap:10px;align-items:flex-start;margin-bottom:10px">
      <img src="${p.apercu}" style="width:64px;height:64px;object-fit:cover;border-radius:9px;flex-shrink:0">
      <input class="form-input" style="flex:1" placeholder="Légende (facultative)"
             value="${esc(p.legende)}" oninput="majLegendePhotoEnAttente(${i}, this.value)">
      <button class="btn-icon-sm" onclick="retirerPhotoEnAttente(${i})">✕</button>
    </div>`).join('');
}

function confirmGeneratePrepaReport() {
  photosEnAttente = [];
  // Le numéro est calculé côté serveur ; on l'annonce ici à titre indicatif,
  // à partir des comptes-rendus déjà connus.
  const prochaine = (S.prepaReports || []).reduce((m, r) => Math.max(m, r.version || 0), 0) + 1;
  openSheet(`
    <div class="sheet-title">Compte-rendu de prépa</div>
    <p style="color:var(--text2);font-size:13.5px;margin-bottom:16px">
      Le PDF est téléchargé et une copie classée dans Fichiers → Archive.
    </p>

    <div class="form-group">
      <label class="form-label">Titre du document</label>
      <input class="form-input" id="in-rapport-titre" placeholder="Compte-rendu de prépa">
    </div>

    <div class="form-group">
      <label class="form-label">Version</label>
      <input class="form-input" id="in-rapport-version" value="${prochaine}">
      <div style="font-size:12px;color:var(--text3);margin-top:5px">
        Pré-remplie avec le numéro suivant. Tu peux la remplacer — un autre numéro, ou « Finale ».
      </div>
    </div>

    <div class="form-group">
      <label class="form-label">Précision <span style="color:var(--text3);font-weight:400">— facultatif</span></label>
      <input class="form-input" id="in-rapport-version-note" placeholder="Jour 2, Rectificatif, Après retour loueur…">
    </div>

    <div class="form-group">
      <label class="form-label">Photos en fin de document</label>
      <div id="rapport-photos"></div>
      <button class="btn btn-secondary" onclick="choisirPhotosRapport()">📷 Ajouter des photos</button>
    </div>

    <div class="confirm-btns">
      <button class="btn btn-secondary" onclick="closeSheet()">Annuler</button>
      <button class="btn btn-primary" onclick="generatePrepaReport(this)">Générer</button>
    </div>
  `, { autofocus: false });
  renderPhotosEnAttente();
}

/**
 * Libellé de version à afficher.
 *
 * `version` est l'entier interne qui sert à ordonner les documents et à
 * proposer le numéro suivant ; `version_label` est ce que l'utilisateur a
 * éventuellement écrit à la place (« Finale », « 3 bis »).
 */
function libelleVersion(r) {
  return String(r.version_label || r.version || 1);
}

/** Nom du fichier PDF téléchargé, daté et versionné. */
function nomFichierRapport(r) {
  const base = slugify(r.data?.project?.name || 'projet');
  const jour = (r.data?.generated_at || r.created_at || new Date().toISOString()).slice(0, 10);
  return `compte-rendu-prepa-${base}-v${slugify(libelleVersion(r))}-${jour}.pdf`;
}

async function generatePrepaReport(btn) {
  if (btn) btn.disabled = true;
  try {
    const titre = (document.getElementById('in-rapport-titre')?.value || '').trim();
    const version = (document.getElementById('in-rapport-version')?.value || '').trim();
    const versionNote = (document.getElementById('in-rapport-version-note')?.value || '').trim();

    await chargerJsPDF();
    const data = buildPrepaSnapshot();
    const cree = await api.post(`/api/projects/${S.projectId}/prepa-reports`, {
      titre, version_label: version, version_note: versionNote, data,
    });

    // Les photos ne partent qu'une fois le compte-rendu créé : c'est lui qui
    // leur sert de point d'attache.
    let photos = [];
    if (photosEnAttente.length) {
      const envoi = new FormData();
      for (const p of photosEnAttente) envoi.append('photos', p.fichier);
      envoi.append('legendes', JSON.stringify(photosEnAttente.map(p => p.legende)));
      photos = (await api.upload(`/api/prepa-reports/${cree.id}/photos`, envoi)).photos || [];
    }

    const rapport = {
      id: cree.id, version: cree.version, version_label: cree.version_label,
      created_at: cree.created_at, titre, version_note: versionNote,
      label: titre || `Compte-rendu de prépa · v${cree.version_label || cree.version}`,
      data, photos,
    };
    const doc = await buildPrepaReportDoc(rapport);
    doc.save(nomFichierRapport(rapport));

    for (const p of photosEnAttente) URL.revokeObjectURL(p.apercu);
    photosEnAttente = [];
    closeSheet();
    await reloadPrepaReports();
    showToast(`✓ Compte-rendu ${libelleVersion(rapport)} généré (Fichiers → Archive)`);
  } catch (e) {
    // Le bouton est réactivé pour permettre une nouvelle tentative ; le filet
    // global (app.js) affiche le message d'erreur.
    if (btn) btn.disabled = false;
    throw e;
  }
}

async function openPrepaReport(id) {
  const r = await api.get(`/api/prepa-reports/${id}`);
  window.__currentPrepaReport = r;
  // Même précaution que pour le PDF : un instantané vide doit s'afficher, pas
  // faire échouer l'ouverture de la fiche.
  const d = r.data || {};
  d.project = d.project || {};
  d.phases = d.phases || [];
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

  const mention = [`Version ${libelleVersion(r)}`, r.version_note].filter(Boolean).join(' — ');

  let body = `<div class="sheet-title">${esc(r.titre || r.label)}</div>`;
  body += `<p style="color:var(--text2);font-size:13.5px;margin-bottom:16px">
    <span style="color:var(--accent);font-weight:600">${esc(mention)}</span> · ${esc(formatDate(r.created_at))}<br>
    ${esc(d.project.name || 'Projet')}${d.project.loueur ? ' · Loueur : ' + esc(d.project.loueur) : ''}<br>
    ${readyCount}/${allItems.length} éléments prêts au total.</p>`;
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
  body += `<div class="form-group" style="margin-top:18px">
      <label class="form-label">Photos du document</label>
      <div id="archive-photos">${renderPhotosArchive(r)}</div>
      <button class="btn btn-secondary" onclick="ajouterPhotosArchive('${id}')">📷 Ajouter des photos</button>
    </div>`;
  body += `<button class="btn btn-primary" style="margin-bottom:10px" onclick="exportPrepaReportPDF(this)">📄 Réexporter en PDF</button>
    <button class="btn btn-danger" onclick="deletePrepaReport('${id}')">Supprimer cette archive</button>`;
  openSheet(body, { autofocus: false });
}

/** Photos déjà rattachées à un compte-rendu archivé, légende modifiable. */
function renderPhotosArchive(r) {
  const photos = r.photos || [];
  if (!photos.length) {
    return `<div style="color:var(--text3);font-size:13px;margin-bottom:8px">Aucune photo dans ce document.</div>`;
  }
  return photos.map(p => `
    <div style="display:flex;gap:10px;align-items:flex-start;margin-bottom:10px">
      <a href="/photos/${esc(p.file_path)}" target="_blank">
        <img src="/photos/${esc(p.file_path)}" loading="lazy"
             style="width:64px;height:64px;object-fit:cover;border-radius:9px;flex-shrink:0">
      </a>
      <input class="form-input" style="flex:1" placeholder="Légende (facultative)"
             value="${esc(p.legende)}" onchange="enregistrerLegendeArchive('${p.id}', this.value)">
      <button class="btn-icon-sm" onclick="supprimerPhotoArchive('${p.id}')">✕</button>
    </div>`).join('');
}

/**
 * Ajoute des photos à un compte-rendu déjà archivé.
 *
 * Le PDF déjà téléchargé ne les contient évidemment pas : il faut le
 * réexporter, ce que le message de confirmation rappelle.
 */
async function ajouterPhotosArchive(id) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.multiple = true;
  input.onchange = async () => {
    const fichiers = [...input.files];
    if (!fichiers.length) return;
    const envoi = new FormData();
    for (const f of fichiers) envoi.append('photos', await compressImage(f));
    envoi.append('legendes', JSON.stringify(fichiers.map(() => '')));
    await api.upload(`/api/prepa-reports/${id}/photos`, envoi);
    await openPrepaReport(id);
    await reloadPrepaReports();
    showToast('✓ Photos ajoutées — réexporte le PDF pour les y inclure');
  };
  input.click();
}

async function enregistrerLegendeArchive(photoId, legende) {
  await api.put(`/api/prepa-report-photos/${photoId}`, { legende });
  const r = window.__currentPrepaReport;
  const photo = (r?.photos || []).find(p => p.id === photoId);
  if (photo) photo.legende = legende;
  showToast('✓ Légende enregistrée');
}

async function supprimerPhotoArchive(photoId) {
  await api.del(`/api/prepa-report-photos/${photoId}`);
  const id = window.__currentPrepaReport?.id;
  if (id) { await openPrepaReport(id); await reloadPrepaReports(); }
}
/**
 * Régénère et télécharge le PDF d'un compte-rendu archivé.
 *
 * Le PDF n'est pas stocké : il est reconstruit à partir de l'instantané figé et
 * des photos rattachées. Une photo ajoutée après coup se retrouve donc dans le
 * document sans qu'il y ait rien à resynchroniser.
 */
async function ouvrirPdfArchive(id, element) {
  const libelleInitial = element?.style.opacity;
  if (element) element.style.opacity = '0.5';
  try {
    const r = await api.get(`/api/prepa-reports/${id}`);
    window.__currentPrepaReport = r;
    await chargerJsPDF();
    const doc = await buildPrepaReportDoc(r);
    doc.save(nomFichierRapport(r));
  } finally {
    if (element) element.style.opacity = libelleInitial || '';
  }
}

/**
 * Demande confirmation avant de supprimer un compte-rendu.
 *
 * Contrairement à une pièce jointe, un compte-rendu archivé n'est pas
 * récupérable : l'instantané de la prépa disparaît avec lui, et ses photos
 * sont effacées du disque.
 */
function confirmerSuppressionArchive(id) {
  const r = (S.prepaReports || []).find(x => x.id === id);
  const nom = r ? (r.titre || r.label) : 'ce compte-rendu';
  const photos = r?.nb_photos ? ` et ses ${r.nb_photos} photo(s)` : '';
  openSheet(`
    <div class="sheet-title">Supprimer ce compte-rendu ?</div>
    <p style="color:var(--text2);font-size:14px;margin-bottom:16px">
      <strong style="color:var(--text)">${esc(nom)}</strong>${photos} sera définitivement supprimé.
      L'instantané de la prépa qu'il contient ne peut pas être reconstitué.
    </p>
    <div class="confirm-btns">
      <button class="btn btn-secondary" onclick="closeSheet()">Annuler</button>
      <button class="btn btn-danger" onclick="deletePrepaReport('${id}')">Supprimer</button>
    </div>
  `);
}

async function deletePrepaReport(id) {
  await api.del(`/api/prepa-reports/${id}`);
  closeSheet();
  await reloadPrepaReports();
  showToast('Compte-rendu supprimé');
}

// Construit le PDF. Asynchrone parce que l'insertion des photos suppose de les
// charger et de les redimensionner avant de les poser sur la page.
async function buildPrepaReportDoc(r) {
  // Un instantané peut être vide : le serveur renvoie un objet nu plutôt qu'une
  // erreur quand il en trouve un illisible. Le document doit alors sortir
  // quand même, réduit à son en-tête et à ses photos, plutôt que d'échouer.
  const d = r.data || {};
  d.project = d.project || {};
  d.phases = d.phases || [];
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
  const W = 210, margin = 15;
  let y = margin;
  const addPage = () => { doc.addPage(); y = margin; };
  const checkY = (needed) => { if (y + needed > 280) addPage(); };

  const metaLines = [d.project.name || 'Projet'];
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

  // Titre et version dans la zone blanche, sous le bandeau. Le bandeau reste
  // identique d'un compte-rendu à l'autre : c'est ici que le document se
  // distingue des précédents, et c'est là que le lecteur cherche de quoi il
  // s'agit et à quelle passe de prépa il correspond.
  if (r.titre) {
    doc.setFontSize(15);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(25, 25, 30);
    for (const ligne of doc.splitTextToSize(r.titre, W - margin * 2)) {
      checkY(8);
      doc.text(ligne, margin, y);
      y += 7;
    }
    y += 1;
  }
  const mentionVersion = [`Version ${libelleVersion(r)}`, r.version_note].filter(Boolean).join('  —  ');
  checkY(8);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(120, 120, 128);
  doc.text(mentionVersion, margin, y);
  y += 9;

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

  y = await ajouterPhotosAuPdf(doc, r, { W, margin, y });

  return doc;
}

/**
 * Ajoute les photos légendées à la fin du document.
 *
 * Chaque image est redimensionnée pour tenir dans la largeur utile sans
 * dépasser une hauteur raisonnable, afin qu'une photo verticale prise au
 * téléphone n'occupe pas une page entière à elle seule. Une photo illisible
 * est simplement ignorée : elle ne doit pas faire échouer tout l'export.
 *
 * @returns {Promise<number>} La position verticale après le dernier élément.
 */
async function ajouterPhotosAuPdf(doc, r, { W, margin, y }) {
  const photos = r.photos || [];
  if (!photos.length) return y;

  const largeurUtile = W - margin * 2;
  const HAUTEUR_MAX = 100;
  const addPage = () => { doc.addPage(); y = margin; };
  const place = (besoin) => { if (y + besoin > 280) addPage(); };

  place(18);
  y += 4;
  doc.setFillColor(240, 240, 245);
  doc.roundedRect(margin, y - 4, largeurUtile, 8, 2, 2, 'F');
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 30, 35);
  doc.text(`Photos  —  ${photos.length}`, margin + 3, y + 1.5);
  y += 12;

  for (const photo of photos) {
    let image;
    try {
      image = await loadImageForPdf(`/photos/${photo.file_path}`);
    } catch {
      console.warn('[rapport] photo illisible, ignorée :', photo.file_path);
      continue;
    }

    let l = largeurUtile;
    let h = image.h * (l / image.w);
    if (h > HAUTEUR_MAX) { h = HAUTEUR_MAX; l = image.w * (h / image.h); }

    const lignesLegende = photo.legende
      ? doc.splitTextToSize(photo.legende, largeurUtile)
      : [];

    // On réserve l'image ET sa légende d'un bloc : une légende ne doit jamais
    // se retrouver seule en haut de la page suivante.
    place(h + lignesLegende.length * 4.5 + 8);
    doc.addImage(image.data, 'JPEG', margin, y, l, h);
    y += h + 4;

    if (lignesLegende.length) {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(90, 90, 95);
      doc.text(lignesLegende, margin, y);
      y += lignesLegende.length * 4.5;
    }
    y += 6;
  }
  return y;
}
async function exportPrepaReportPDF(btn) {
  const r = window.__currentPrepaReport;
  if (!r) return;
  if (btn) btn.disabled = true;
  try {
    await chargerJsPDF();
    const doc = await buildPrepaReportDoc(r);
    doc.save(nomFichierRapport(r));
  } finally {
    if (btn) btn.disabled = false;
  }
}

