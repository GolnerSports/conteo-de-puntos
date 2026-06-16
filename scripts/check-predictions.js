/**
 * GOLNER SPORTS — Diagnóstico completo de predicciones
 * Verifica que cada predicción de cada participante
 * pueda encontrar su partido en Firestore.
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
  "ee uu": "estados unidos", "eeuu": "estados unidos", "eua": "estados unidos",
  "saudi arabia": "arabia saudi", "arabia saudita": "arabia saudi",
  "czechia": "republica checa", "czech republic": "republica checa", "chequia": "republica checa",
  "south korea": "corea del sur", "korea republic": "corea del sur", "korea": "corea del sur",
  "ivory coast": "costa de marfil", "cote d'ivoire": "costa de marfil",
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
  const allParticipants = partSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  console.log(`📋 ${allMatches.length} partidos | 👥 ${allParticipants.length} participantes\n`);

  // Construir índice de matchKeys de Firestore (todas las variantes)
  const firestoreKeys = new Set();
  for (const m of allMatches) {
    if (m.matchKey) firestoreKeys.add(m.matchKey);
    firestoreKeys.add(buildMatchKey(m.homeTeam || "", m.awayTeam || ""));
    firestoreKeys.add(buildMatchKey(m.awayTeam || "", m.homeTeam || ""));
  }

  let totalPreds = 0;
  let orphaned = 0;
  const orphanedKeys = new Map(); // matchKey → lista de participantes

  for (const p of allParticipants) {
    const preds = p.predictions || {};
    for (const [dictKey, pred] of Object.entries(preds)) {
      totalPreds++;
      const mk = pred.matchKey || dictKey;
      const normKey  = buildMatchKey(pred.homeTeam || "", pred.awayTeam || "");
      const normKeyR = buildMatchKey(pred.awayTeam || "", pred.homeTeam || "");

      const found = firestoreKeys.has(mk) || firestoreKeys.has(normKey) || firestoreKeys.has(normKeyR);

      if (!found) {
        orphaned++;
        const label = `${pred.homeTeam || "?"} vs ${pred.awayTeam || "?"} (key: ${mk})`;
        if (!orphanedKeys.has(label)) orphanedKeys.set(label, []);
        orphanedKeys.get(label).push(p.name || p.id);
      }
    }
  }

  console.log(`── RESULTADO ───────────────────────────────────────────`);
  console.log(`  Total predicciones: ${totalPreds}`);
  console.log(`  Sin partido asignado: ${orphaned}\n`);

  if (orphaned === 0) {
    console.log(`✅ PERFECTO — Todas las predicciones encuentran su partido en Firestore`);
  } else {
    console.log(`❌ PREDICCIONES HUÉRFANAS (no encuentran partido en Firestore):`);
    for (const [label, names] of orphanedKeys.entries()) {
      console.log(`\n  ❌ ${label}`);
      console.log(`     Participantes: ${names.join(", ")}`);
    }
  }

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
