/**
 * GOLNER SPORTS — Verificación de tipos de homeScore/awayScore en predictions
 * Revisa todos los participantes y reporta cualquier predicción donde
 * homeScore o awayScore estén guardados como string en lugar de number.
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

async function main() {
  const snap = await db.collection("participants").get();
  console.log(`\n📋 Revisando ${snap.size} participantes...\n`);

  let totalPreds = 0;
  let problems = 0;
  const toFix = []; // { docId, name, matchKey, field, value }

  for (const doc of snap.docs) {
    const p = doc.data();
    const preds = p.predictions || {};

    for (const [matchKey, pred] of Object.entries(preds)) {
      totalPreds++;

      if (pred.homeScore !== null && pred.homeScore !== undefined && typeof pred.homeScore === "string") {
        console.log(`  ⚠️  ${p.name || doc.id} | ${matchKey} | homeScore="${pred.homeScore}" (string!)`);
        toFix.push({ docId: doc.id, name: p.name, matchKey, field: "homeScore", value: pred.homeScore });
        problems++;
      }
      if (pred.awayScore !== null && pred.awayScore !== undefined && typeof pred.awayScore === "string") {
        console.log(`  ⚠️  ${p.name || doc.id} | ${matchKey} | awayScore="${pred.awayScore}" (string!)`);
        toFix.push({ docId: doc.id, name: p.name, matchKey, field: "awayScore", value: pred.awayScore });
        problems++;
      }
    }
  }

  console.log(`\n📊 Total predicciones revisadas: ${totalPreds}`);

  if (problems === 0) {
    console.log(`✅ Todo correcto. Ningún homeScore/awayScore guardado como texto.`);
    process.exit(0);
  }

  console.log(`\n🔧 Encontrados ${problems} problemas. Corrigiendo automáticamente...`);

  // Agrupar por documento para hacer una sola escritura por participante
  const byDoc = {};
  for (const item of toFix) {
    if (!byDoc[item.docId]) byDoc[item.docId] = { name: item.name, fixes: [] };
    byDoc[item.docId].fixes.push(item);
  }

  const batch = db.batch();
  for (const [docId, info] of Object.entries(byDoc)) {
    const docRef = db.collection("participants").doc(docId);
    const docSnap = await docRef.get();
    const preds = { ...(docSnap.data().predictions || {}) };

    for (const fix of info.fixes) {
      if (preds[fix.matchKey]) {
        preds[fix.matchKey] = {
          ...preds[fix.matchKey],
          [fix.field]: parseInt(fix.value, 10),
        };
      }
    }
    batch.update(docRef, { predictions: preds });
    console.log(`  ✏️  Corregido: ${info.name} (${info.fixes.length} campo(s))`);
  }

  await batch.commit();
  console.log(`\n✅ Correcciones aplicadas en Firestore.`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
