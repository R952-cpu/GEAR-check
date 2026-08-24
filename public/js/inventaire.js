// ==========================================================================
// Onglet Inventaire : liste maîtresse de tout le matériel importé,
// groupée par catégorie, avec la case de présence de chaque item.
// ==========================================================================

// ===== INVENTAIRE (présence uniquement, tout le matériel) =====
const CATEGORIE_LABELS = {
  ENERGIE: 'Énergie', CAMERA: 'Caméra', OPTIQUE: 'Optique', VIDEO_HF: 'Vidéo & HF',
  LUMIERE: 'Lumière', MACHINERIE: 'Machinerie', AUDIO: 'Audio', ACCESSOIRE: 'Accessoire', DATA: 'Data',
};
const CATEGORIE_ORDER = Object.keys(CATEGORIE_LABELS);

function renderInventaireView() {
  if (S.checklistReimporting) return renderChecklistOnboarding();
  const items = S.checklist.items || [];
  if (!items.length) return renderChecklistOnboarding();

  let html = prepaDateBanner();
  html += `<div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap">
    <button class="chip" onclick="confirmReimportChecklist()">${icone('rotate-cw', { taille: 14 })} Réimporter un JSON</button>
    <button class="chip" onclick="confirmResetAll()">${icone('rotate-ccw', { taille: 14 })} Nouvelle prépa (tout décocher)</button>
  </div>`;

  for (const cat of CATEGORIE_ORDER) {
    const catItems = items.filter(it => it.categorie === cat);
    if (!catItems.length) continue;
    const doneCount = catItems.filter(it => it.presence_cochee).length;
    const allPresent = doneCount === catItems.length;
    const key = `inv-${cat}`;
    const collapsed = isCollapsed(key);
    html += `<div class="phase-group">
      <div class="phase-group-hdr" style="cursor:pointer;flex-wrap:wrap" onclick="toggleCollapse('${key}')">
        <span style="color:var(--text3);display:flex;margin-right:2px">${icone(collapsed ? 'chevron-right' : 'chevron-down', { taille: 15 })}</span>
        <div style="flex:1;min-width:140px">
          <div class="phase-group-title">${esc(CATEGORIE_LABELS[cat])} <span style="color:var(--text2);font-weight:600">· ${catItems.length}</span></div>
          <div class="progress-bar"><div class="progress-fill" style="width:${catItems.length ? Math.round(doneCount/catItems.length*100) : 0}%"></div></div>
        </div>
        <span style="font-size:12px;color:var(--text2)">${doneCount}/${catItems.length}</span>
        <button class="chip" style="padding:6px 10px;font-size:11.5px" onclick="event.stopPropagation();bulkTogglePresence('${cat}', ${!allPresent})">${allPresent ? 'Tout désélectionner' : 'Tout sélectionner'}</button>
      </div>
      ${collapsed ? '' : `<div>${catItems.map(it => `
        <div class="list-item" onclick="openChecklistItem('${it.id}')">
          <div class="check-box ${it.presence_cochee?'checked':''}" onclick="event.stopPropagation();toggleItemPresence('${it.id}', ${it.presence_cochee})">${it.presence_cochee ? icone('check', { taille: 13, trait: 3 }) : ''}</div>
          <div class="list-item-content" style="margin-left:2px">
            <div class="list-item-title">${esc(it.designation)}${it.quantite > 1 ? ' ×' + it.quantite : ''}</div>
            ${(it.identifiant || it.phase_id) ? `<div class="list-item-sub">${[it.identifiant && ('ID : ' + it.identifiant), it.phase_id && 'Dans une phase de vérification'].filter(Boolean).map(esc).join(' · ')}</div>` : ''}
          </div>
          <span class="list-item-arrow">${icone('chevron-right', { taille: 16 })}</span>
        </div>`).join('')}</div>`}
    </div>`;
  }
  return html;
}

