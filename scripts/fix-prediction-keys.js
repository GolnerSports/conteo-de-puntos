/**
 * GOLNER SPORTS — Corrección de matchKeys en predicciones de participantes
 * Busca predicciones cuyos matchKey no coinciden con ningún partido en
 * Firestore y las actualiza al matchKey correcto.
 */

const admin = require("firebase-admin");

const serviceAccount = {
  type: "service_account",
  project_id: "conteo-de-puntos-golner-sports",
  private_key_id: process.env.SA_PRIVATE_KEY_ID,
  private_key: (process.env.SA_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
  client_email: process.env.SA_CLIENT_EMAIL,
  client_id: process.env.SA_CLIENT_ID,
  token_uri: "https://oauth2.googleapis.com/token",
};

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: "conteo-de-puntos-golner-sports",
});

const db = admin.firestore();

const ESPN_NAME_MAP = {
  "united states": "estados unidos", "usa": "estados unidos", "ee.uu.": "estados unidos",
  "ee uu": "estados unidos", "eeuu": "estados unidos", "eua": "estados unidos", "us": "estados unidos",
  "saudi arabia": "arabia saudi", "arabia saudita": "arabia saudi",
  "czechia": "republica checa", "czech republic": "republica checa", "chequia": "republica checa",
  "rep. checa": "republica checa", "rep checa": "republica checa",
  "south korea": "corea del sur", "korea republic": "corea del sur", "korea": "corea del sur",
  "ivory coast": "costa de marfil", "cote d'ivoire": "costa de marfil", "cote divoire": "costa de marfil",
  "south africa": "sudafrica",
  "dr congo": "rd congo", "congo dr": "rd congo", "democratic republic of congo": "rd congo",
  "bosnia-herzegovina": "bosnia", "bosnia and herzegovina": "bosnia",
  "bosnia & herzegovina": "bosnia", "bosnia herzegovina": "bosnia",
  "bosnia herz": "bosnia", "bosnia herz.": "bosnia",
  "turkiye": "turquia", "turkey": "turquia",
  "netherlands": "paises bajos", "holland": "paises bajos",
  "algeria": "argelia", "germany": "alemania", "belgium": "belgica",
  "switzerland": "suiza", "sweden": "suecia", "norway": "noruega",
  "morocco": "marruecos", "egypt": "egipto", "tunisia": "tunez",
  "cape verde": "cabo verde", "curacao": "curazao", "jordan": "jordania",
  "scotland": "escocia", "england": "inglaterra", "haiti": "haiti",
  "iran": "iran", "iraq": "irak", "austria": "austria",
  "qatar": "catar", "new zealand": "nueva zelanda",
  "n. zelanda": "nueva zelanda", "n zelanda": "nueva zelanda",
  "nva. zelanda": "nueva zelanda", "nva zelanda": "nueva zelanda",
  "panama": "panama", "croatia": "croacia", "senegal": "senegal",
  "colombia": "colombia", "ghana": "ghana", "portugal": "portugal",
  "argentina": "argentina", "france": "francia", "spain": "espana",
  "brazil": "brasil", "ecuador": "ecuador", "japan": "japon",
  "mexico": "mexico", "canada": "canada", "australia": "australia",
  "uruguay": "uruguay", "uzbekistan": "uzbekistan", "paraguay": "paraguay",
};

function normalize(s) {
  const clean = (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  return ESPN_NAME_MAP[clean] || clean;
}

function buildMatchKey(home, away) {
  return normalize(home) + "_vs_" + normalize(away);
}

async function main() {
  const [matchSnap, partSnap] = await Promise.all([
    db.collection("matches").get(),
    db.collection("participants").get(),
  ]);

  const allMatches = matchSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  // Índice de todos los matchKeys posibles → match correcto
  const matchIndex = {};
  for (const m of allMatches) {
    if (m.matchKey) matchIndex[m.matchKey] = m;
    const nk = buildMatchKey(m.homeTeam || "", m.awayTeam || "");
    if (nk) matchIndex[nk] = m;
    const nkR = buildMatchKey(m.awayTeam || "", m.homeTeam || "");
    if (nkR) matchIndex[nkR] = m;
  }

  console.log(`📋 ${allMatches.length} partidos | 👥 ${partSnap.size} participantes\n`);

  let totalFixed = 0;
  const batch = db.batch();

  for (const partDoc of partSnap.docs) {
    const p = partDoc.data();
    const preds = p.predictions || {};
    const newPreds = { ...preds };
    let changed = false;

    for (const [dictKey, pred] of Object.entries(preds)) {
      const mk = pred.matchKey || dictKey;

      // Si el matchKey ya existe en Firestore exactamente → ok
      if (matchIndex[mk] && matchIndex[mk].matchKey === mk) continue;

      // Buscar el partido correcto por normalización
      const normKey  = buildMatchKey(pred.homeTeam || "", pred.awayTeam || "");
      const normKeyR = buildMatchKey(pred.awayTeam || "", pred.homeTeam || "");

      const fsMatch = matchIndex[mk] || matchIndex[normKey] || matchIndex[normKeyR];
      if (!fsMatch) continue; // no encontrado, dejar igual

      const correctKey = fsMatch.matchKey;
      if (correctKey === mk && correctKey === dictKey) continue; // ya está bien

      // Corregir
      console.log(`  ✏️  ${p.name || partDoc.id}: "${dictKey}" → "${correctKey}"`);

      // Eliminar entrada vieja, agregar con clave correcta
      delete newPreds[dictKey];
      newPreds[correctKey] = {
        ...pred,
        matchKey: correctKey,
        homeTeam: fsMatch.homeTeam,
        awayTeam: fsMatch.awayTeam,
      };
      changed = true;
      totalFixed++;
    }

    if (changed) {
      batch.update(partDoc.ref, { predictions: newPreds });
    }
  }

  if (totalFixed > 0) {
    await batch.commit();
    console.log(`\n✅ ${totalFixed} predicciones corregidas en Firestore`);
  } else {
    console.log(`✅ Todas las predicciones ya tienen matchKeys correctos`);
  }

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
