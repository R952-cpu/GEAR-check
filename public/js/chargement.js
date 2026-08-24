// ==========================================================================
// Voiles de chargement et écran de lancement.
//
// Trois mises en scène, toutes bâties sur la mascotte :
//
//  · SPLASH — au lancement de l'application. Fond rouge, le logo se dessine,
//    puis la mascotte et le slogan apparaissent. Six secondes, jouées une
//    fois. Un bouton « Ready » apparaît à mi-parcours et permet de couper.
//
//  · Voile A — actions lourdes (exports PDF, envois de photos, import de
//    l'inventaire, ouverture d'une archive). La mascotte tourne sur elle-même
//    comme une pièce, puis une coche verte confirme.
//
//  · Voile B — changements d'écran. La mascotte sautille au-dessus d'une
//    barre qui se remplit. Pas de coche : le voile se retire, c'est tout.
//
// LA RÈGLE DE TEMPS, qui est le cœur du dispositif :
// l'animation ne ment jamais sur l'état réel de l'action.
//   · Action terminée AVANT la fin de l'animation → on laisse l'animation
//     aller à son terme, sans la couper.
//   · Action plus lente → la mascotte continue de tourner (ou de sautiller)
//     aussi longtemps qu'il faut, et la confirmation n'arrive qu'une fois
//     l'action réellement finie.
// ==========================================================================

/** Durées, en millisecondes. Reprises des maquettes validées. */
const CHARGEMENT_DUREES = {
  // Voile A : un tour de mascotte, puis la coche.
  aRotation: 600,
  aConfirmation: 350,
  // Voile B : remplissage de la barre.
  bMinimum: 800,
  // Splash : durée totale, et moment d'apparition du bouton « Ready ».
  splashTotal: 6000,
  splashBouton: 3000,
};

/** Respecte le réglage système « réduire les animations ». */
const animationsReduites = () =>
  window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Voile commun
// ---------------------------------------------------------------------------

/**
 * Crée le voile et l'insère dans la page.
 *
 * Un seul voile peut être visible à la fois : un appel pendant qu'un autre est
 * actif remplace le précédent plutôt que de les empiler.
 */
function ouvrirVoile(contenu) {
  document.getElementById('voile-chargement')?.remove();
  const el = document.createElement('div');
  el.id = 'voile-chargement';
  el.className = 'voile';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.innerHTML = contenu;
  document.body.appendChild(el);
  return el;
}

function fermerVoile() {
  const el = document.getElementById('voile-chargement');
  if (!el) return;
  el.classList.add('voile-sortie');
  setTimeout(() => el.remove(), 200);
}

// ---------------------------------------------------------------------------
// Voile A — action lourde
// ---------------------------------------------------------------------------

/**
 * Exécute une action en affichant la mascotte qui tourne, puis confirme.
 *
 * @param {string} libelle Ce que l'utilisateur attend (« Génération du PDF… »).
 * @param {() => Promise<T>} action Le travail à accomplir.
 * @returns {Promise<T>} La valeur renvoyée par `action`.
 * @throws Repropage l'erreur de `action` après avoir affiché la croix rouge —
 *         l'appelant garde donc la main sur le message affiché.
 */
async function avecChargement(libelle, action) {
  // Sans animation, on n'impose aucun délai : le voile informe, il ne
  // ralentit pas.
  if (animationsReduites()) {
    const el = ouvrirVoile(`<div class="voile-boite"><div class="voile-libelle">${esc(libelle)}</div></div>`);
    try { return await action(); } finally { el.remove(); }
  }

  ouvrirVoile(`
    <div class="voile-boite">
      <div class="voile-scene">
        <img class="voile-mascotte voile-tourne" src="/vendor/mascot-runner.png" alt="">
      </div>
      <div class="voile-ombre"></div>
      <div class="voile-libelle">${esc(libelle)}</div>
    </div>`);

  const debut = Date.now();
  let resultat, echec = null;
  try {
    resultat = await action();
  } catch (e) {
    echec = e;
  }

  // La mascotte tourne au moins un tour complet. Si l'action a pris plus
  // longtemps, elle a simplement tourné davantage — rien à rattraper ici.
  const reste = CHARGEMENT_DUREES.aRotation - (Date.now() - debut);
  if (reste > 0) await attendre(reste);

  // Confirmation : coche verte si tout s'est bien passé, croix rouge sinon.
  // Elle ne peut donc jamais annoncer une réussite qui n'a pas eu lieu.
  const boite = document.querySelector('#voile-chargement .voile-boite');
  if (boite) {
    boite.innerHTML = echec
      ? `<div class="voile-verdict voile-verdict-echec">${icone('x', { taille: 30, trait: 3 })}</div>`
      : `<div class="voile-verdict voile-verdict-succes">${icone('check', { taille: 30, trait: 3 })}</div>`;
  }
  await attendre(CHARGEMENT_DUREES.aConfirmation);
  fermerVoile();

  if (echec) throw echec;
  return resultat;
}

// ---------------------------------------------------------------------------
// Voile B — changement d'écran
// ---------------------------------------------------------------------------

/**
 * Exécute un changement d'écran derrière la mascotte qui sautille.
 *
 * La barre se remplit sur la durée minimale. Si le chargement dépasse cette
 * durée, elle marque un temps près de la fin plutôt que d'atteindre 100 %
 * avant que l'écran ne soit prêt — une barre pleine sur un écran qui n'arrive
 * pas serait un mensonge.
 */
async function avecTransition(action) {
  if (animationsReduites()) return action();

  ouvrirVoile(`
    <div class="voile-boite">
      <img class="voile-mascotte voile-sautille" src="/vendor/mascot-runner.png" alt="">
      <div class="voile-barre"><div class="voile-barre-remplissage"></div></div>
      <div class="voile-libelle">Chargement…</div>
    </div>`);

  const debut = Date.now();
  try {
    return await action();
  } finally {
    const reste = CHARGEMENT_DUREES.bMinimum - (Date.now() - debut);
    if (reste > 0) await attendre(reste);
    // Le chargement a débordé : on termine le remplissage avant de sortir.
    const barre = document.querySelector('#voile-chargement .voile-barre-remplissage');
    if (barre) { barre.style.transition = 'width .18s ease-out'; barre.style.width = '100%'; }
    await attendre(120);
    fermerVoile();
  }
}

// ---------------------------------------------------------------------------
// Écran de lancement
// ---------------------------------------------------------------------------

/**
 * Pilote l'écran de lancement déjà présent dans la page.
 *
 * Le décor est écrit en dur dans index.html et animé en CSS : il s'affiche
 * donc dès le premier rendu, sans attendre le chargement du JavaScript. Cette
 * fonction ne s'occupe que de ce que le CSS ne sait pas faire — le slogan qui
 * se tape, le bouton « Ready », et la sortie.
 *
 * @param {Promise} pret Résolue quand l'application a de quoi s'afficher.
 */
async function jouerSplash(pret) {
  const splash = document.getElementById('splash');
  if (!splash) return pret;

  if (animationsReduites()) {
    await pret;
    splash.remove();
    return;
  }

  const D = CHARGEMENT_DUREES;
  let coupe = false;
  const bouton = splash.querySelector('.splash-ready');
  const terminer = () => { coupe = true; };
  bouton?.addEventListener('click', terminer, { once: true });

  // Le slogan se tape lettre par lettre, avec un curseur qui clignote.
  const cible = splash.querySelector('.splash-slogan-texte');
  const curseur = splash.querySelector('.splash-curseur');
  const slogan = 'Get ready before your shoot.';
  const DEBUT_FRAPPE = 4030;   // instant où la frappe commence, en ms
  const PAR_LETTRE = 56;
  const depart = Date.now();
  const frappe = setInterval(() => {
    const ecoule = Date.now() - depart - DEBUT_FRAPPE;
    if (ecoule < 0) return;
    const n = Math.min(slogan.length, Math.floor(ecoule / PAR_LETTRE));
    if (cible) cible.textContent = slogan.slice(0, n);
    if (n >= slogan.length) { clearInterval(frappe); if (curseur) curseur.style.display = 'none'; }
  }, 30);

  // Le bouton n'apparaît qu'à mi-parcours : avant, l'animation raconte encore
  // quelque chose et il n'y a rien à écourter.
  setTimeout(() => splash.classList.add('splash-interruptible'), D.splashBouton);

  // On attend la fin de l'animation ET que l'application soit prête — sauf si
  // l'utilisateur appuie sur « Ready », qui coupe court.
  await Promise.race([
    Promise.all([attendre(D.splashTotal), pret]),
    (async () => { while (!coupe) await attendre(80); await pret; })(),
  ]);

  clearInterval(frappe);
  splash.classList.add('splash-sortie');
  setTimeout(() => splash.remove(), 320);
}
