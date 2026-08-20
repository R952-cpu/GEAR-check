const R = require('../src/referentiel');
let ko = 0;
const t = (label, got, want) => {
  const ok = got === want;
  if (!ok) ko++;
  console.log(`${ok ? '  ok ' : '  KO '} ${label}: "${got}"${ok ? '' : ` (attendu "${want}")`}`);
};

console.log('— type : token exact');
t('CAMERA', R.normalizeType('CAMERA'), 'CAMERA');
t('camera minuscule', R.normalizeType('camera'), 'CAMERA');
console.log('— type : synonymes (modèles qui reformulent)');
t('"corps caméra"', R.normalizeType('corps caméra'), 'CAMERA');
t('"objectif"', R.normalizeType('objectif'), 'OPTIQUE');
t('"batteries"', R.normalizeType('batteries'), 'ENERGIE');
t('"Filtres"', R.normalizeType('Filtres'), 'FILTRES');
console.log('— type : faux positifs corrigés (frontière de mot)');
t('"support lightweight"', R.normalizeType('support lightweight'), '');
t('"adaptateur"', R.normalizeType('adaptateur'), '');
console.log('— type : priorité au mot-clé le plus tôt');
t('"lumière avec écran"', R.normalizeType('lumière avec écran de contrôle'), 'LUMIERE');
t('"écran de lumière"', R.normalizeType('écran de contrôle lumière'), 'VIDEO_HF');
console.log('— type : repli sur la désignation si le token est inexploitable');
t('type bidon + désignation caméra', R.normalizeType('materiel', 'Sony FX9 corps nu'), 'CAMERA');
t('null reste null (choix assumé)', R.normalizeType(null, 'Câble SDI pour moniteur'), '');
console.log('— catégorie : dérivée du type');
t('type CAMERA + cat ACCESSOIRE', R.normalizeCategorie('ACCESSOIRE', 'CAMERA'), 'CAMERA');
t('type FILTRES -> OPTIQUE', R.normalizeCategorie(null, 'FILTRES'), 'OPTIQUE');
t('AUDIO sans type conservé', R.normalizeCategorie('AUDIO', ''), 'AUDIO');
t('cat inconnue sans type', R.normalizeCategorie('BIDULE', ''), 'ACCESSOIRE');
console.log('— sous-type : déduit de la désignation');
t('"Angénieux 24-290mm"', R.sanitizeSousType('OPTIQUE', null, 'Angénieux Optimo 24-290mm'), 'ZOOM');
t('"Zeiss 50mm"', R.sanitizeSousType('OPTIQUE', null, 'Zeiss Supreme Prime 50mm'), 'FIXE');
t('"zoom" explicite', R.sanitizeSousType('OPTIQUE', null, 'Zoom Fujinon Premista'), 'ZOOM');
t('fourni par IA prioritaire', R.sanitizeSousType('OPTIQUE', 'FIXE', 'zoom 24-70'), 'FIXE');
t('mattebox clip-on', R.sanitizeSousType('MATTEBOX', null, 'Mattebox Arri LMB clip-on'), 'CLIPON');
t('doute -> vide', R.sanitizeSousType('OPTIQUE', null, 'Jeu optiques Cooke'), '');
console.log('— quantité');
t('nombre', R.normalizeQuantite(3), 3);
t('chaîne', R.normalizeQuantite('4'), 4);
t('"x2"', R.normalizeQuantite('x2'), 2);
t('absente', R.normalizeQuantite(null), 1);
t('texte', R.normalizeQuantite('deux'), 1);
t('négative', R.normalizeQuantite(-5), 1);
t('absurde bornée', R.normalizeQuantite(999999), 500);
console.log('— checks');
t('CAMERA a des checks', R.getTypeChecks('CAMERA', '').length > 0, true);
t('OPTIQUE ZOOM > FIXE', R.getTypeChecks('OPTIQUE', 'ZOOM').length > R.getTypeChecks('OPTIQUE', 'FIXE').length, true);
t('type inconnu -> 0', R.getTypeChecks('BIDULE', '').length, 0);
t('labels avancés listés', R.advancedCheckLabels().length > 10, true);

console.log('— lots redondants (cas tirés de bons de préparation réels)');
{
  const items = [
    { designation: 'Sony FX6 COMBO', quantite: 5 },
    { designation: 'Sony FX6 Camescope 4K E-mount Corp Nu', quantite: 5 },
    { designation: 'Sony FX6 / FX9 Viseur View Finder', quantite: 5 },
    { designation: 'DJI SDR COMBO', quantite: 4 },
    { designation: 'RX DJI SDR Transmission', quantite: 4 },
    { designation: 'TX DJI SDR Transmission', quantite: 4 },
    { designation: 'Godox FL-100 COMBO', quantite: 3 },
    { designation: 'Telecommande Godox RC-A5 FL-SF4060', quantite: 3 },
    { designation: 'Panneau LED flexible FL-150R COMBO', quantite: 2 },
    { designation: 'Panneau LED flexible FL-150 R', quantite: 2 },
    { designation: 'DJI RONIN RS 4 PRO COMBO', quantite: 1 },
    { designation: 'Sony FX3 COMBO', quantite: 2 },
    { designation: 'Chargeur Double Baxxtar Batterie FX3', quantite: 2 },
  ];
  const r = R.detecterLotsRedondants(items);
  const neutralise = (d) => r.has(items.findIndex((i) => i.designation === d));
  t('FX6 COMBO neutralisé (corps nu listé à part)', neutralise('Sony FX6 COMBO'), true);
  t('DJI SDR COMBO neutralisé (RX+TX listés)', neutralise('DJI SDR COMBO'), true);
  t('Panneau FL-150R COMBO neutralisé', neutralise('Panneau LED flexible FL-150R COMBO'), true);
  t('Godox FL-100 COMBO conservé (vrai projecteur)', neutralise('Godox FL-100 COMBO'), false);
  t('RONIN RS 4 PRO COMBO conservé (sans sous-ligne)', neutralise('DJI RONIN RS 4 PRO COMBO'), false);
  t('FX3 COMBO conservé (corps non listé à part)', neutralise('Sony FX3 COMBO'), false);
  t('les vrais matériels ne sont jamais touchés', r.size, 3);
}

console.log(ko === 0 ? '\n✅ tous les tests passent' : `\n❌ ${ko} test(s) en échec`);
process.exit(ko ? 1 : 0);
