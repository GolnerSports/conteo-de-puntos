/**
 * GOLNER SPORTS — Corrección de nombres de equipos en Firestore
 * Compara cada partido contra la lista oficial de ESPN y corrige
 * nombres y matchKeys que no coincidan.
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

// Mapa completo ESPN inglés → español correcto
const ESPN_MAP = {
  "united states":"Estados Unidos","usa":"Estados Unidos","ee.uu.":"Estados Unidos","ee uu":"Estados Unidos","eeuu":"Estados Unidos","eua":"Estados Unidos",
  "saudi arabia":"Arabia Saudi","arabia saudita":"Arabia Saudi",
  "czechia":"Republica Checa","czech republic":"Republica Checa","chequia":"Republica Checa","república checa":"Republica Checa","republica checa":"Republica Checa",
  "south korea":"Corea del Sur","korea republic":"Corea del Sur",
  "ivory coast":"Costa de Marfil","cote d'ivoire":"Costa de Marfil",
  "south africa":"Sudafrica","sudáfrica":"Sudafrica","sudafrica":"Sudafrica",
  "dr congo":"RD Congo","congo dr":"RD Congo","rd congo":"RD Congo","república democrática del congo":"RD Congo","republica democratica del congo":"RD Congo",
  "bosnia-herzegovina":"Bosnia","bosnia and herzegovina":"Bosnia","bosnia herzegovina":"Bosnia","bosnia y herzegovina":"Bosnia","bosnia & herzegovina":"Bosnia",
  "turkiye":"Turquia","turkey":"Turquia","turquía":"Turquia","turquia":"Turquia",
  "netherlands":"Paises Bajos","holland":"Paises Bajos","países bajos":"Paises Bajos","paises bajos":"Paises Bajos",
  "algeria":"Argelia","argelia":"Argelia",
  "germany":"Alemania","alemania":"Alemania",
  "belgium":"Belgica","bélgica":"Belgica","belgica":"Belgica",
  "switzerland":"Suiza","suiza":"Suiza",
  "sweden":"Suecia","suecia":"Suecia",
  "norway":"Noruega","noruega":"Noruega",
  "morocco":"Marruecos","marruecos":"Marruecos",
  "egypt":"Egipto","egipto":"Egipto",
  "tunisia":"Tunez","túnez":"Tunez","tunez":"Tunez",
  "cape verde":"Cabo Verde","cabo verde":"Cabo Verde",
  "curacao":"Curazao","curaçao":"Curazao","curazao":"Curazao",
  "jordan":"Jordania","jordania":"Jordania",
  "scotland":"Escocia","escocia":"Escocia",
  "england":"Inglaterra","inglaterra":"Inglaterra",
  "iran":"Iran","irán":"Iran",
  "iraq":"Irak","irak":"Irak",
  "qatar":"Catar","katar":"Catar","catar":"Catar","قطر":"Catar",
  "new zealand":"Nueva Zelanda","nueva zelanda":"Nueva Zelanda",
  "n. zelanda":"Nueva Zelanda","n zelanda":"Nueva Zelanda","nva zelanda":"Nueva Zelanda","nva. zelanda":"Nueva Zelanda",
  "panama":"Panama","panamá":"Panama",
  "croatia":"Croacia","croacia":"Croacia",
  "france":"Francia","francia":"Francia",
  "spain":"Espana","españa":"Espana","espana":"Espana",
  "brazil":"Brasil","brasil":"Brasil",
  "japan":"Japon","japón":"Japon","japon":"Japon",
  "mexico":"Mexico","méxico":"Mexico",
  "australia":"Australia",
  "senegal":"Senegal",
  "colombia":"Colombia",
  "ghana":"Ghana",
  "portugal":"Portugal",
  "argentina":"Argentina",
  "canada":"Canada","canadá":"Canada",
  "uruguay":"Uruguay",
  "ecuador":"Ecuador",
  "austria":"Austria",
  "haiti":"Haiti","haití":"Haiti",
  "uzbekistan":"Uzbekistan","uzbekistán":"Uzbekistan",
  "paraguay":"Paraguay",
  "nigeria":"Nigeria","nigeria":"Nigeria",
  "new caledonia":"Nueva Caledonia",
};

function normalize(s) {
  return (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();
}

function correctName(name) {
  const n = normalize(name);
  return ESPN_MAP[n] || name; // si no está en el mapa, lo deja igual
}

function buildMatchKey(home, away) {
  return normalize(correctName(home)) + "_vs_" + normalize(correctName(away));
}

async function main() {
  console.log("🔄 Cargando partidos de Firestore...");
  const snap = await db.collection("matches").get();
  console.log(`📋 ${snap.size} partidos encontrados\n`);

  let fixed = 0, ok = 0;
  const batch = db.batch();

  for (const docSnap of snap.docs) {
    const m = docSnap.data();
    const correctedHome = correctName(m.homeTeam || "");
    const correctedAway = correctName(m.awayTeam || "");
    const correctedKey  = normalize(correctedHome) + "_vs_" + normalize(correctedAway);

    const changed = correctedHome !== m.homeTeam || correctedAway !== m.awayTeam || correctedKey !== m.matchKey;

    if (changed) {
      console.log(`  ✏️  "${m.homeTeam} vs ${m.awayTeam}" → "${correctedHome} vs ${correctedAway}"`);
      if (m.matchKey !== correctedKey) console.log(`      key: "${m.matchKey}" → "${correctedKey}"`);
      batch.update(docSnap.ref, {
        homeTeam: correctedHome,
        awayTeam: correctedAway,
        matchKey: correctedKey,
      });
      fixed++;
    } else {
      ok++;
    }
  }

  if (fixed > 0) {
    await batch.commit();
    console.log(`\n✅ ${fixed} partidos corregidos, ${ok} ya estaban bien`);
  } else {
    console.log(`\n✅ Todos los partidos ya tenían nombres correctos`);
  }

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
