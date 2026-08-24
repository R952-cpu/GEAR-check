// ==========================================================================
// Démarrage de l'application.
// ==========================================================================

// Filet de sécurité global.
//
// Les gestionnaires onclick de l'interface sont asynchrones : si l'un d'eux
// échoue (serveur injoignable, erreur d'écriture), l'erreur se perdait
// silencieusement dans la console et le geste semblait simplement ne rien
// faire. On la remonte désormais à l'écran, sans jamais interrompre l'app.
window.addEventListener('unhandledrejection', (e) => {
  console.error('Erreur non traitée :', e.reason);
  showToast(e.reason?.message || 'Une erreur est survenue', true);
  e.preventDefault();
});

window.addEventListener('error', (e) => {
  console.error('Erreur JavaScript :', e.error || e.message);
});

// ===== INIT =====
//
// L'écran de lancement est déjà peint (il est écrit dans la page) : on le
// laisse jouer pendant que l'accueil se charge, et il se retire quand les
// deux sont prêts — ou plus tôt si l'utilisateur appuie sur « Ready ».
jouerSplash(chargerAccueil());
