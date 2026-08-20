#!/bin/bash
# Test fonctionnel complet contre le conteneur d'essai (port 4599).
# Cible par défaut : le conteneur d essai. Surchargeable : BASE=... bash tests/api.smoke.sh
BASE=${BASE:-http://127.0.0.1:4599}
ok=0; ko=0
t() { # t "libellé" "valeur obtenue" "valeur attendue"
  if [ "$2" == "$3" ]; then ok=$((ok+1)); printf '  ok   %s\n' "$1";
  else ko=$((ko+1)); printf '  KO   %s → "%s" (attendu "%s")\n' "$1" "$2" "$3"; fi
}
J() { python3 -c "import sys,json;d=json.load(sys.stdin);print($1)"; }

echo "── Projets"
PID=$(curl -s -X POST $BASE/api/projects -H 'Content-Type: application/json' -d '{"name":"Projet de test","prod":"Production Exemple","loueur":"Loueur Exemple","assistant":"Assistant Test"}' | J "d['id']")
t "création projet" "$(echo -n "$PID" | wc -c | tr -d ' ')" "36"
t "lecture projet" "$(curl -s $BASE/api/projects/$PID | J "d['loueur']")" "Loueur Exemple"
curl -s -X PUT $BASE/api/projects/$PID -H 'Content-Type: application/json' -d '{"name":"Projet de test","prod":"Production Exemple","loueur":"Loueur Exemple","assistant":"Assistant Test","email":"a@b.c","phone":"06"}' >/dev/null
t "modification projet" "$(curl -s $BASE/api/projects/$PID | J "d['email']")" "a@b.c"
t "projet sans nom refusé" "$(curl -s -o /dev/null -w '%{http_code}' -X POST $BASE/api/projects -H 'Content-Type: application/json' -d '{}')" "400"
t "projet inexistant → 404" "$(curl -s -o /dev/null -w '%{http_code}' $BASE/api/projects/nexistepas)" "404"

echo "── Import inventaire (JSON tel qu'une IA le produit, avec le double comptage)"
cat > /tmp/import.json <<'EOF'
{"items":[
 {"designation":"Sony FX6 COMBO","quantite":5,"reference":null,"categorie":"CAMERA","type":"CAMERA","sous_type":null,"emplacement":null},
 {"designation":"Sony FX6 Camescope 4K E-mount Corp Nu","quantite":5,"reference":null,"categorie":"CAMERA","type":"CAMERA","sous_type":null,"emplacement":null},
 {"designation":"Sony FX6 / FX9 Viseur View Finder","quantite":5,"categorie":"ACCESSOIRE","type":null},
 {"designation":"Objectif Sony FE 24-105 mm F4 G OSS (77mm)","quantite":5,"categorie":"OPTIQUE","type":"objectif","sous_type":null},
 {"designation":"Objectif Sony FE 70-200mm F2.8 OSS GM 1 (77mm)","quantite":3,"categorie":"OPTIQUE","type":"OPTIQUE","sous_type":"ZOOM"},
 {"designation":"Batterie VLock Swit S-8083S 130W d-tap","quantite":13,"categorie":"ACCESSOIRE","type":"batterie"},
 {"designation":"Carte CFexpress 256Gb Pergear","quantite":52,"categorie":"DATA","type":"DATA"},
 {"designation":"Micro cravate Cos11 Sanken Lemo 3","quantite":24,"categorie":"AUDIO","type":null},
 {"designation":"Filtre URTH ND2-400 82mm-URTH","quantite":1,"categorie":"OPTIQUE","type":"FILTRES"},
 {"designation":"Trepied Camera Sachtler SYSTEM AKTIV6 FLOWTECH75 MS","quantite":5,"categorie":"MACHINERIE","type":"TETE_MACHINERIE"},
 {"designation":"Moniteur HD Seetec P215-9HSD-CO 21.5\"","quantite":1,"categorie":"VIDEO_HF","type":"VIDEO_HF"},
 {"designation":"Godox FL-100 COMBO","quantite":3,"categorie":"LUMIERE","type":"LUMIERE"},
 {"designation":"Telecommande Godox RC-A5 FL-SF4060","quantite":3,"categorie":"ACCESSOIRE","type":null},
 {"designation":"Support lightweight","quantite":2,"categorie":"ACCESSOIRE","type":null},
 {"designation":"Quantite bizarre","quantite":"x4","categorie":"ACCESSOIRE","type":null}
]}
EOF
RES=$(curl -s -X POST $BASE/api/projects/$PID/checklist/import -H 'Content-Type: application/json' -d @/tmp/import.json)
t "lots redondants neutralisés" "$(echo "$RES" | J "d['lots_neutralises']")" "1"
CL=$(curl -s $BASE/api/projects/$PID/checklist)
t "5 corps caméra (et pas 10)" "$(echo "$CL" | J "sum(1 for i in d['items'] if i['type']=='CAMERA')")" "5"
t "caméras éclatées une par une" "$(echo "$CL" | J "[i['designation'] for i in d['items'] if i['type']=='CAMERA'][0]")" "Sony FX6 Camescope 4K E-mount Corp Nu #1"
t "FX6 COMBO conservé sans type" "$(echo "$CL" | J "[i['type'] for i in d['items'] if i['designation']=='Sony FX6 COMBO'][0] or 'vide'")" "vide"
t "FX6 COMBO reclassé accessoire" "$(echo "$CL" | J "[i['categorie'] for i in d['items'] if i['designation']=='Sony FX6 COMBO'][0]")" "ACCESSOIRE"
t "Godox FL-100 COMBO reste LUMIERE" "$(echo "$CL" | J "[i['type'] for i in d['items'] if i['designation']=='Godox FL-100 COMBO'][0]")" "LUMIERE"
t "type 'objectif' normalisé" "$(echo "$CL" | J "[i['type'] for i in d['items'] if 'FE 24-105' in i['designation']][0]")" "OPTIQUE"
t "sous-type ZOOM déduit du 24-105" "$(echo "$CL" | J "[i['sous_type'] for i in d['items'] if 'FE 24-105' in i['designation']][0]")" "ZOOM"
t "type 'batterie' normalisé" "$(echo "$CL" | J "[i['type'] for i in d['items'] if 'VLock Swit' in i['designation']][0]")" "ENERGIE"
t "catégorie corrigée depuis le type" "$(echo "$CL" | J "[i['categorie'] for i in d['items'] if 'VLock Swit' in i['designation']][0]")" "ENERGIE"
t "AUDIO conservé (aucun type)" "$(echo "$CL" | J "[i['categorie'] for i in d['items'] if 'cravate' in i['designation']][0]")" "AUDIO"
t "'lightweight' pas confondu avec light" "$(echo "$CL" | J "[i['type'] for i in d['items'] if 'lightweight' in i['designation']][0] or 'vide'")" "vide"
t "quantité 'x4' interprétée" "$(echo "$CL" | J "[i['quantite'] for i in d['items'] if i['designation']=='Quantite bizarre'][0]")" "4"
t "phases créées selon le matériel" "$(echo "$CL" | J "len(d['phases'])")" "8"
t "checks générés sur une caméra" "$(echo "$CL" | J "len([i for i in d['items'] if i['type']=='CAMERA'][0]['checks'])>20")" "True"
t "import vide refusé" "$(curl -s -o /dev/null -w '%{http_code}' -X POST $BASE/api/projects/$PID/checklist/import -H 'Content-Type: application/json' -d '{"items":[]}')" "400"
t "designation manquante refusée" "$(curl -s -o /dev/null -w '%{http_code}' -X POST $BASE/api/projects/$PID/checklist/import -H 'Content-Type: application/json' -d '{"items":[{"quantite":1}]}')" "400"

echo "── Checks, présence, notes"
ITEM=$(echo "$CL" | J "[i['id'] for i in d['items'] if i['type']=='CAMERA'][0]")
CHK=$(echo "$CL" | J "[i['checks'][0]['id'] for i in d['items'] if i['type']=='CAMERA'][0]")
curl -s -X PUT $BASE/api/checklist-checks/$CHK -H 'Content-Type: application/json' -d '{"done":true}' >/dev/null
t "check coché" "$(curl -s $BASE/api/projects/$PID/checklist | J "[c['done'] for i in d['items'] for c in i['checks'] if c['id']=='$CHK'][0]")" "1"
curl -s -X POST $BASE/api/checklist-items/$ITEM/quick-ok -H 'Content-Type: application/json' -d '{"done":true}' >/dev/null
t "quick-ok épargne les avancés" "$(curl -s $BASE/api/projects/$PID/checklist | J "sum(1 for i in d['items'] if i['id']=='$ITEM' for c in i['checks'] if c['avance']==1 and c['done']==0)>0")" "True"
NOTE=$(curl -s -X POST $BASE/api/checklist-items/$ITEM/notes -H 'Content-Type: application/json' -d '{"text":"Rayure sur la monture"}' | J "d['id']")
t "note ajoutée" "$(curl -s $BASE/api/projects/$PID/checklist | J "[i['notes'][0]['text'] for i in d['items'] if i['id']=='$ITEM'][0]")" "Rayure sur la monture"
curl -s -X POST $BASE/api/projects/$PID/checklist/presence-bulk -H 'Content-Type: application/json' -d '{"categorie":"CAMERA","presence":true}' >/dev/null
t "présence en masse" "$(curl -s $BASE/api/projects/$PID/checklist | J "sum(1 for i in d['items'] if i['categorie']=='CAMERA' and i['presence_cochee']==1)")" "5"
curl -s -X POST $BASE/api/projects/$PID/checklist/reset-all -H 'Content-Type: application/json' -d '{}' >/dev/null
t "nouvelle prépa : tout décoché" "$(curl -s $BASE/api/projects/$PID/checklist | J "sum(i['presence_cochee'] for i in d['items'])+sum(c['done'] for i in d['items'] for c in i['checks'])")" "0"

echo "── Phases"
PH=$(curl -s -X POST $BASE/api/projects/$PID/checklist-phases -H 'Content-Type: application/json' -d "{\"label\":\"Ma phase\",\"item_ids\":[\"$ITEM\"]}" | J "d['id']")
t "phase personnalisée créée" "$(curl -s $BASE/api/projects/$PID/checklist | J "[p['label'] for p in d['phases'] if p['id']=='$PH'][0]")" "Ma phase"
t "item déplacé dans la phase" "$(curl -s $BASE/api/projects/$PID/checklist | J "[i['phase_id'] for i in d['items'] if i['id']=='$ITEM'][0]")" "$PH"
curl -s -X DELETE $BASE/api/checklist-phases/$PH >/dev/null
t "suppression : item rendu à l'inventaire" "$(curl -s $BASE/api/projects/$PID/checklist | J "[i['phase_id'] for i in d['items'] if i['id']=='$ITEM'][0] or 'vide'")" "vide"

echo "── Profils caméra"
PROF=$(curl -s -X POST $BASE/api/projects/$PID/camera-profiles -H 'Content-Type: application/json' -d '{"label":"Profil A","color":"#ff0000"}' | J "d['id']")
curl -s -X POST $BASE/api/camera-profiles/$PROF/settings -H 'Content-Type: application/json' -d '{"text":"Shutter 180"}' >/dev/null
t "profil + réglage" "$(curl -s $BASE/api/projects/$PID/camera-profiles | J "d[0]['settings'][0]['text']")" "Shutter 180"
t "couleur invalide rejetée" "$(curl -s -X POST $BASE/api/projects/$PID/camera-profiles -H 'Content-Type: application/json' -d '{"label":"X","color":"javascript:alert(1)"}' >/dev/null; curl -s $BASE/api/projects/$PID/camera-profiles | J "d[1]['color']")" "#2ed6b3"
curl -s -X POST $BASE/api/camera-profiles/$PROF/validate -H 'Content-Type: application/json' -d '{}' >/dev/null
t "profil confirmé" "$(curl -s $BASE/api/projects/$PID/camera-profiles | J "d[0]['validated']")" "1"

echo "── Manques"
MQ=$(curl -s -X POST $BASE/api/projects/$PID/manques -H 'Content-Type: application/json' -d '{"label":"Bonnette manquante","qty":"2"}' | J "d['id']")
t "manque créé" "$(curl -s $BASE/api/projects/$PID/manques | J "d[0]['label']")" "Bonnette manquante"

echo "── Comptes-rendus"
CR=$(curl -s -X POST $BASE/api/projects/$PID/compte-rendus -H 'Content-Type: application/json' -d '{"semaine_label":"S14","date":"2026-08-20"}' | J "d['id']")
curl -s -X POST $BASE/api/compte-rendus/$CR/notes -H 'Content-Type: application/json' -d '{"text":"RAS","color":"rouge"}' >/dev/null
t "note colorée" "$(curl -s $BASE/api/compte-rendus/$CR | J "d['notes'][0]['color']")" "rouge"
t "couleur inconnue → noir" "$(curl -s -X POST $BASE/api/compte-rendus/$CR/notes -H 'Content-Type: application/json' -d '{"text":"X","color":"<script>"}' >/dev/null; curl -s $BASE/api/compte-rendus/$CR | J "d['notes'][1]['color']")" "noir"
DEF=$(curl -s -X POST $BASE/api/compte-rendus/$CR/defauts -F "nom_objet=Viseur" -F "note=Fissure" | J "d['id']")
t "défaut créé" "$(curl -s $BASE/api/compte-rendus/$CR | J "d['defauts'][0]['nom_objet']")" "Viseur"

echo "── Compte-rendu de prépa archivé"
RAP=$(curl -s -X POST $BASE/api/projects/$PID/prepa-reports -H 'Content-Type: application/json' -d '{"label":"Prépa du 20/08","data":{"project":{"name":"TEST"},"phases":[]}}' | J "d['id']")
t "rapport archivé" "$(curl -s $BASE/api/prepa-reports/$RAP | J "d['data']['project']['name']")" "TEST"
t "liste sans le contenu lourd" "$(curl -s $BASE/api/projects/$PID/prepa-reports | J "'data' in d[0]")" "False"

echo "── Sécurité"
t "hôte inconnu refusé" "$(curl -s -o /dev/null -w '%{http_code}' -H 'Host: evil.com' $BASE/api/projects)" "403"
t "origine croisée refusée" "$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Origin: http://evil.com' -H 'Content-Type: application/json' -d '{"name":"x"}' $BASE/api/projects)" "403"
t "en-tête CSP présent" "$(curl -s -D- -o /dev/null $BASE/ | grep -ci 'content-security-policy')" "1"
t "nosniff présent" "$(curl -s -D- -o /dev/null $BASE/ | grep -ci 'x-content-type-options')" "1"
t "x-powered-by masqué" "$(curl -s -D- -o /dev/null $BASE/ | grep -ci 'x-powered-by')" "0"
t "upload .svg refusé" "$(printf '<svg onload=alert(1)>' > /tmp/x.svg; curl -s -o /dev/null -w '%{http_code}' -X POST $BASE/api/projects/$PID/prepa/attachments -F 'file=@/tmp/x.svg')" "415"
t "upload .html refusé" "$(printf '<script>x</script>' > /tmp/x.html; curl -s -o /dev/null -w '%{http_code}' -X POST $BASE/api/projects/$PID/prepa/attachments -F 'file=@/tmp/x.html')" "415"
t "route API inconnue → 404 JSON" "$(curl -s $BASE/api/nawak | J "d['error']")" "Route inconnue"
t "JSON malformé → 400" "$(curl -s -o /dev/null -w '%{http_code}' -X POST $BASE/api/projects -H 'Content-Type: application/json' -d '{cassé')" "400"
t "compression active" "$(curl -s -H 'Accept-Encoding: gzip' -D- -o /dev/null $BASE/api/projects/$PID/checklist | grep -ci 'content-encoding: gzip')" "1"

echo "── Nettoyage"
curl -s -X DELETE $BASE/api/projects/$PID >/dev/null
t "projet supprimé" "$(curl -s -o /dev/null -w '%{http_code}' $BASE/api/projects/$PID)" "404"
t "cascade : checklist vidée" "$(curl -s $BASE/api/projects/$PID/checklist | J "len(d['items'])")" "0"

echo
echo "─────────────────────────────"
echo " $ok réussis, $ko en échec"
[ $ko -eq 0 ] && echo " ✅ TOUT PASSE" || echo " ❌ ÉCHECS"
exit $ko
