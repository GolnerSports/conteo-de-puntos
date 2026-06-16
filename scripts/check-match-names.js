/**
 * GOLNER SPORTS — Diagnóstico de nombres de equipos en Firestore
 * Lista todos los equipos y señala cuáles NO coinciden con ESPN.
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

// Nombres canónicos que ESPN usa (después de nuestro mapa)
const CANONICAL = new Set([
  "Arabia Saudi","Argelia","Argentina","Australia","Austria",
  "Belgica","Bosnia","Brasil","Cabo Verde","Canada",
  "Corea del Sur","Costa de Marfil","Croacia","Catar","Curazao",
  "Colombia","Ecuador","Egipto","Escocia","Espana","Estados Unidos",
  "Francia","Alemania","Ghana","Haiti","Inglaterra",
  "Irak","Iran","Japon","Jordania","Marruecos",
  "Mexico","Nigeria","Noruega","Nueva Zelanda","Nueva Caledonia",
  "Paises Bajos","Panama","Paraguay","Portugal","RD Congo",
  "Republica Checa","Senegal","Sudafrica","Suecia","Suiza",
  "Tunez","Turquia","Uruguay","Uzbekistan",
]);

async function main() {
  const snap = await db.collection("matches").get();
  console.log(`📋 ${snap.size} partidos en Firestore\n`);

  const allTeams = new Set();
  const problems = [];

  for (const doc of snap.docs) {
    const m = doc.data();
    allTeams.add(m.homeTeam);
    allTeams.add(m.awayTeam);

    const homeOk = CANONICAL.has(m.homeTeam);
    const awayOk = CANONICAL.has(m.awayTeam);

    if (!homeOk || !awayOk) {
      problems.push({
        id: doc.id,
        home: m.homeTeam,
        away: m.awayTeam,
        matchKey: m.matchKey,
        homeOk,
        awayOk,
      });
    }
  }

  console.log("── TODOS LOS EQUIPOS ENCONTRADOS ──────────────────────");
  [...allTeams].sort().forEach(t => {
    const ok = CANONICAL.has(t);
    console.log(`  ${ok ? "✅" : "❌"} "${t}"`);
  });

  console.log("\n── PARTIDOS CON NOMBRES PROBLEMÁTICOS ─────────────────");
  if (problems.length === 0) {
    console.log("  ✅ Todos los partidos tienen nombres correctos");
  } else {
    for (const p of problems) {
      console.log(`  ❌ ${p.home} vs ${p.away}`);
      if (!p.homeOk) console.log(`     ↳ homeTeam "${p.home}" no es canónico`);
      if (!p.awayOk) console.log(`     ↳ awayTeam "${p.away}" no es canónico`);
      console.log(`     matchKey: ${p.matchKey}`);
    }
  }

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
