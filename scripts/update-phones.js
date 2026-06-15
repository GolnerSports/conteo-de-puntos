/**
 * GOLNER SPORTS — Actualización masiva de teléfonos
 * Ejecutar: node scripts/update-phones.js
 */

const admin = require("firebase-admin");

const serviceAccount = {
  type:                        "service_account",
  project_id:                  "conteo-de-puntos-golner-sports",
  private_key_id:              process.env.SA_PRIVATE_KEY_ID,
  private_key:                 (process.env.SA_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
  client_email:                process.env.SA_CLIENT_EMAIL,
  client_id:                   process.env.SA_CLIENT_ID,
  token_uri:                   "https://oauth2.googleapis.com/token",
};

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId:  "conteo-de-puntos-golner-sports",
});

const db = admin.firestore();

// Mapa ID Golner → teléfono (solo dígitos, sin código de país)
const PHONE_MAP = {
  "GN7001": "5611116394",
  "GN7002": "5566281269",
  "GN7003": "5519505006",
  "GN7004": "5574832492",
  "GN7005": "5559535939",
  "GN7006": "5510528603",
  "GN7007": "5611718119",
  "GN7008": "5566948978",
  "GN7009": "5530403479",
  "GN7010": "5654069718",
  "GN7011": "5628181828",
  "GN7012": "5551028485",
  "GN7013": "5611859777",
  "GN7014": "5623930093",
  "GN7015": "5624479820",
  "GN7016": "5565716240",
  "GN7017": "5578102770",
  "GN7018": "5530072239",
  "GN7019": "561110278",
  "GN7020": "5636941919",
  "GN7021": "5621545404",
  "GN7022": "5611201473",
  "GN7023": "5581844934",
  "GN7024": "5586779837",
  "GN7025": "5611259897",
  "GN7026": "5610075887",
  "GN7027": "5567368422",
  "GN7028": "5630557317",
  "GN7029": "5582400030",
  "GN7030": "5622142110",
  "GN7031": "5567676720",
  "GN7032": "5621545404",
  "GN7033": "5639673753",
  "GN7034": "5627163700",
  "GN7035": "5550327545",
  "GN7036": "7201424694",
  "GN7037": "5625298380",
  "GN7038": "5510226920",
  "GN7039": "5566775636",
  "GN7040": "5582394213",
  "GN7041": "5550327545",
  "GN7042": "67022631",
  "GN7043": "5548901316",
  "GN7044": "5552962578",
  "GN7045": "5530433122",
  "GN7046": "5532385725",
  "GN7047": "50761548307",
  "GN7048": "5655000435",
  "GN7049": "5568184941",
  "GN7050": "5627163700",
  "DENY_ATTIE": "5530433122",
  "700012": "5551028485",
};

async function main() {
  console.log("🔄 Cargando participantes...");
  const snap = await db.collection("participants").get();
  console.log(`📋 ${snap.size} participantes encontrados`);

  let updated = 0, skipped = 0, notFound = 0;
  const batch = db.batch();

  for (const doc of snap.docs) {
    const data = doc.data();
    const golnerId = (data.golnerId || "").toUpperCase().trim();
    const phone = PHONE_MAP[golnerId] || PHONE_MAP[golnerId.replace("GN","").replace(/^0+/,"")];

    if (!phone) {
      console.log(`  ⚠️  Sin teléfono en mapa: ${golnerId} (${data.name})`);
      notFound++;
      continue;
    }

    if (data.phone === phone) {
      skipped++;
      continue;
    }

    batch.update(doc.ref, { phone });
    console.log(`  ✅ ${golnerId} (${data.name}): ${phone}`);
    updated++;
  }

  if (updated > 0) {
    await batch.commit();
    console.log(`\n✅ ${updated} teléfonos actualizados, ${skipped} ya correctos, ${notFound} sin datos`);
  } else {
    console.log(`\nℹ️  Todos los teléfonos ya estaban actualizados`);
  }

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
