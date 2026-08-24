// ==========================================================================
// État partagé, appels API, utilitaires et panneau coulissant.
//
// Chargé en premier : il déclare l'objet `S` qui porte tout l'état de
// l'interface, ainsi que les fonctions dont tous les autres modules dépendent.
// ==========================================================================

// ===== STATE =====
const S = {
  screen: 'home',
  projectId: null,
  crId: null,
  projects: [],
  project: null,
  prepaView: 'inventaire',
  checklist: { phases: [], items: [] },
  checklistOnboardStep: 'explain',
  checklistReimporting: false,
  checklistAdvanced: false,
  collapsedGroups: new Set(),
  cameraProfiles: [],
  manques: [],
  attachments: [],
  prepaReports: [],
  crList: [],
  cr: null,
};

// ===== API =====
//
// Toute requête qui échoue lève désormais une erreur porteuse du message
// renvoyé par le serveur. Auparavant, une réponse en erreur était lue comme
// un succès : l'écran affichait alors une modification qui n'avait jamais été
// enregistrée, sans que rien ne le signale.
//
// Chaque requête est aussi bornée dans le temps : sur une liaison distante,
// une connexion qui tombe laissait sinon l'interface figée indéfiniment.

/** Délai au-delà duquel une requête est abandonnée (ms). */
const API_TIMEOUT = 20000;

/** Erreur d'API, avec le message destiné à l'utilisateur et le code HTTP. */
class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function apiFetch(url, options = {}) {
  const abort = new AbortController();
  const minuteur = setTimeout(() => abort.abort(), API_TIMEOUT);
  let reponse;
  try {
    reponse = await fetch(url, { ...options, signal: abort.signal });
  } catch (e) {
    throw new ApiError(
      e.name === 'AbortError' ? 'Le serveur ne répond pas' : 'Connexion au serveur impossible',
      0
    );
  } finally {
    clearTimeout(minuteur);
  }

  // Le corps peut être vide ou non-JSON (page d'erreur d'un proxy, par ex.).
  const brut = await reponse.text();
  let corps = null;
  try { corps = brut ? JSON.parse(brut) : null; } catch { /* réponse non-JSON */ }

  if (!reponse.ok) {
    throw new ApiError(corps?.error || `Erreur ${reponse.status}`, reponse.status);
  }
  return corps;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

const api = {
  get: (url) => apiFetch(url),
  post: (url, body) => apiFetch(url, { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(body) }),
  put: (url, body) => apiFetch(url, { method: 'PUT', headers: JSON_HEADERS, body: JSON.stringify(body) }),
  del: (url) => apiFetch(url, { method: 'DELETE' }),
  upload: (url, formData) => apiFetch(url, { method: 'POST', body: formData }),
};

// ===== CHARGEMENT DU MODULE PDF À LA DEMANDE =====
//
// jsPDF pèse à lui seul plus que tout le reste de l'application réunie. Il ne
// sert qu'aux exports, c'est-à-dire à quelques gestes par prépa : le charger
// systématiquement au démarrage faisait payer ce poids à chaque ouverture de
// l'app sur le téléphone. Il n'est donc plus dans la page, mais chargé au
// premier export — puis gardé en cache par le navigateur.

let chargementJsPDF = null;

/** Garantit que `window.jspdf` est disponible avant de construire un PDF. */
function chargerJsPDF() {
  if (window.jspdf) return Promise.resolve();
  if (!chargementJsPDF) {
    chargementJsPDF = new Promise((resolve, reject) => {
      const balise = document.createElement('script');
      balise.src = '/vendor/jspdf.umd.min.js';
      balise.onload = () => resolve();
      balise.onerror = () => {
        chargementJsPDF = null; // permet de réessayer au prochain export
        reject(new Error('Module PDF indisponible'));
      };
      document.head.appendChild(balise);
    });
  }
  return chargementJsPDF;
}

// ===== MISE À JOUR OPTIMISTE =====
//
// Cocher une case déclenchait auparavant : un appel d'écriture, PUIS un
// rechargement complet de la checklist du projet (175 Ko sur une prépa réelle,
// re-téléchargés à chaque tap), PUIS un redessin. Sur le téléphone à travers
// le tunnel, cela se traduisait par une latence visible à chaque geste.
//
// Le changement est désormais appliqué immédiatement à l'état local et
// redessiné dans la foulée, l'écriture partant en arrière-plan. Si elle
// échoue, l'état d'avant est rétabli et l'utilisateur est prévenu : l'écran ne
// peut donc pas mentir sur ce qui est réellement enregistré.

/**
 * Applique un changement tout de suite à l'écran, puis l'enregistre.
 *
 * @param {object} actions
 * @param {() => void} actions.appliquer  Modifie l'état local.
 * @param {() => void} actions.annuler    Rétablit l'état précédent si l'envoi échoue.
 * @param {() => Promise} actions.envoyer Écriture serveur.
 * @param {() => void} actions.redessiner Redessine à partir de l'état local.
 */
async function majOptimiste({ appliquer, annuler, envoyer, redessiner }) {
  appliquer();
  redessiner();
  try {
    await envoyer();
  } catch (e) {
    annuler();
    redessiner();
    showToast(e?.message || 'Enregistrement impossible', true);
  }
}


// ===== UTILS =====
function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function formatDate(iso) {
  if (!iso) return '';
  try { return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }); } catch { return iso; }
}
// Date du jour au format YYYY-MM-DD (heure locale) pour le <input type="date">.
function todayISO() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
// Formate une date "YYYY-MM-DD" en français avec le jour de la semaine.
function formatDateFr(ymd) {
  if (!ymd) return '';
  const [y, m, day] = ymd.split('-');
  if (!day) return formatDate(ymd);
  try {
    return new Date(y, m - 1, day).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  } catch { return ymd; }
}
function slugify(str) {
  return str.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
}


async function copyToClipboard(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {}
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'absolute';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    const range = document.createRange();
    range.selectNodeContents(ta);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    ta.select();
    ta.setSelectionRange(0, text.length);
    const success = document.execCommand('copy');
    document.body.removeChild(ta);
    return success;
  } catch {
    return false;
  }
}

// Message de confirmation flottant, réutilisable dans toute l'app.
/**
 * Affiche une confirmation flottante.
 *
 * L'icône est portée par le toast lui-même plutôt que par le texte : la charte
 * remplace les emoji par des icônes Lucide, et un pictogramme collé au début
 * de chaque message serait un caractère, pas une icône.
 *
 * @param {string} message  Texte affiché — échappé, il peut venir du serveur.
 * @param {boolean} [isError]  Bascule sur l'habillage d'erreur.
 */
function showToast(message, isError) {
  const existing = document.getElementById('app-toast');
  if (existing) existing.remove();
  const el = document.createElement('div');
  el.id = 'app-toast';
  el.className = 'toast' + (isError ? ' toast-error' : '');
  el.innerHTML = `${icone(isError ? 'x' : 'check', { taille: 16 })}<span>${esc(message)}</span>`;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, 2200);
}

// ===== SHEET =====
function openSheet(bodyHtml, opts = {}) {
  document.getElementById('sheet-body').innerHTML = bodyHtml;
  document.getElementById('sheet-overlay').classList.add('open');
  document.getElementById('sheet').scrollTop = 0;
  // Focus auto le premier champ — sauf quand désactivé (ex: fiche d'item, où
  // ça faisait sauter l'écran direct sur les notes avant même d'avoir pu lire le haut).
  if (opts.autofocus === false) return;
  setTimeout(() => {
    const firstInput = document.querySelector('#sheet input, #sheet textarea, #sheet select');
    if (firstInput) firstInput.focus();
  }, 350);
}
function closeSheet(e) {
  if (!e || e.target === document.getElementById('sheet-overlay')) {
    document.getElementById('sheet-overlay').classList.remove('open');
  }
}

