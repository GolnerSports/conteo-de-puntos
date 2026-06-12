/**
 * GOLNER SPORTS — Auto Results Script
 * Usa Firebase Admin SDK para acceso completo a Firestore.
 * Consulta ESPN cada 5 min, detecta partidos terminados,
 * actualiza resultados, recalcula puntos y envía notificaciones.
 */

const https = require("https");

// Firebase Admin SDK
const admin = require("firebase-admin");

// Service account desde env vars (GitHub Secrets)
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

// ── ESPN TEAM NAME MAP ────────────────────────────────────────────────────────
const ESPN_NAME_MAP = {
  "south korea": "corea del sur", "korea republic": "corea del sur",
  "czechia": "chequia", "czech republic": "chequia",
  "united states": "estados unidos", "usa": "estados unidos",
  "ivory coast": "costa de marfil", "cote d'ivoire": "costa de marfil",
  "saudi arabia": "arabia saudita",
  "south africa": "sudafrica",
  "congo dr": "congo dr", "dr congo": "congo dr", "democratic republic of congo": "congo dr",
  "new zealand": "nueva zelanda",
  "bosnia-herzegovina": "bosnia", "bosnia and herzegovina": "bosnia",
  "turkiye": "turquia", "turkey": "turquia",
  "netherlands": "paises bajos", "holland": "paises bajos",
  "algeria": "argelia", "germany": "alemania", "belgium": "belgica",
  "switzerland": "suiza", "sweden": "suecia", "norway": "noruega",
  "morocco": "marruecos", "egypt": "egipto", "tunisia": "tunez",
  "cape verde": "cabo verde", "uzbekistan": "uzbekistan",
  "curacao": "curazao", "jordan": "jordania", "scotland": "escocia",
  "england": "inglaterra", "haiti": "haiti", "iran": "iran",
  "iraq": "irak", "austria": "austria", "qatar": "catar",
};

function normalize(s) {
  const clean = (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  return ESPN_NAME_MAP[clean] || clean;
}

function buildMatchKey(home, away) {
  return normalize(home) + "_vs_" + normalize(away);
}

// ── SCORING ───────────────────────────────────────────────────────────────────
function calcMatchPoints(pred, real) {
  if (!real || real.result === undefined) return { total: 0, hitWinner: false, hitScore: false };
  const hitWinner = pred.prediction !== null && pred.prediction === real.result;
  const hitScore  = hitWinner &&
    pred.homeScore !== null && pred.awayScore !== null &&
    pred.homeScore === real.homeScore && pred.awayScore === real.awayScore;
  return { total: (hitWinner ? 3 : 0) + (hitScore ? 2 : 0), hitWinner, hitScore };
}

function calcParticipantTotal(predictions, allResults) {
  const weekPoints  = { 1: 0, 2: 0, 3: 0 };
  const phasePoints = {};
  const matchBreakdown = [];
  let totalPoints = 0;

  const predMap = {};
  for (const p of predictions) predMap[p.matchKey] = p;

  for (const [matchKey, real] of Object.entries(allResults)) {
    if (!real.played) continue;
    const pred = predMap[matchKey] || { prediction: null, homeScore: null, awayScore: null };
    const pts  = calcMatchPoints(pred, real);
    totalPoints += pts.total;
    const week  = real.week;
    if (week && weekPoints[week] !== undefined) weekPoints[week] += pts.total;
    const phase = real.phase || "groups";
    phasePoints[phase] = (phasePoints[phase] || 0) + pts.total;
    matchBreakdown.push({
      matchKey, homeTeam: real.homeTeam, awayTeam: real.awayTeam, week, phase, ...pts,
      predHome: pred.homeScore, predAway: pred.awayScore,
      realHome: real.homeScore, realAway: real.awayScore,
      predResult: pred.prediction, realResult: real.result
    });
  }
  return { totalPoints, weekPoints, phasePoints, matchBreakdown };
}

// ── ESPN ──────────────────────────────────────────────────────────────────────
function httpGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => { try { resolve(JSON.parse(data)); } catch(e) { reject(e); } });
    }).on("error", reject);
  });
}

async function fetchESPNMatches() {
  // Hora México UTC-6
  const now  = new Date(Date.now() - 6 * 60 * 60 * 1000);
  const yyyy = now.getUTCFullYear();
  const mm   = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd   = String(now.getUTCDate()).padStart(2, "0");
  const url  = `https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=${yyyy}${mm}${dd}`;
  console.log(`📡 ESPN: ${url}`);
  const data = await httpGet(url);
  return (data.events || []).map(ev => {
    const comp = ev.competitions?.[0];
    const home = comp?.competitors?.find(c => c.homeAway === "home");
    const away = comp?.competitors?.find(c => c.homeAway === "away");
    return {
      homeTeam:  home?.team?.displayName || "",
      awayTeam:  away?.team?.displayName || "",
      homeScore: parseInt(home?.score || "0"),
      awayScore: parseInt(away?.score || "0"),
      completed: comp?.status?.type?.completed === true,
    };
  });
}

// ── FCM ───────────────────────────────────────────────────────────────────────
async function sendPushToAll(title, body) {
  let snap;
  try {
    snap = await db.collection("fcmTokens").get();
  } catch(e) {
    console.log(`⚠️ No se pudieron obtener tokens FCM: ${e.message}`);
    return;
  }
  const tokens = snap.docs.map(d => d.data().token || d.id).filter(t => t && t.length > 10);
  console.log(`📲 Enviando a ${tokens.length} dispositivos...`);
  let sent = 0;
  for (const token of tokens) {
    try {
      await admin.messaging().send({ token, data: { title, body } });
      sent++;
    } catch(e) {
      if (e.code === "messaging/registration-token-not-registered") {
        // Token inválido — se puede borrar de Firestore
      }
    }
  }
  console.log(`✅ Notificaciones enviadas: ${sent}/${tokens.length}`);
}

// ── RETRY ─────────────────────────────────────────────────────────────────────
async function withRetry(fn, retries = 3, delayMs = 5000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch(e) {
      const isQuota = e.code === 8 || (e.message || "").includes("RESOURCE_EXHAUSTED") || (e.message || "").includes("Quota");
      const isRetryable = isQuota || e.code === 14; // 14 = UNAVAILABLE
      if (isRetryable && attempt < retries) {
        const wait = delayMs * attempt;
        console.log(`⏳ Intento ${attempt}/${retries} fallido (${e.message}). Reintentando en ${wait/1000}s...`);
        await new Promise(r => setTimeout(r, wait));
      } else {
        throw e;
      }
    }
  }
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log("🚀 GOLNER SPORTS — Auto Results", new Date().toISOString());

  // 1. ESPN matches de hoy
  const espnMatches = await fetchESPNMatches();
  const finished = espnMatches.filter(m => m.completed);
  console.log(`⚽ Hoy: ${espnMatches.length} partidos, ${finished.length} terminados`);

  if (!finished.length) { console.log("Sin partidos terminados. Fin."); return; }

  // 2. Cargar todos los partidos de Firestore
  const matchesSnap = await withRetry(() =>
    db.collection("matches").get()
  );
  const allMatches = matchesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const pendingMatches = allMatches.filter(m => !(m.played && m.finalized));
  console.log(`📋 Partidos en Firestore: ${allMatches.length} (${pendingMatches.length} pendientes)`);

  // 3. Verificar si hay algo nuevo que procesar
  const newlyFinished = finished.filter(espn => {
    const matchKey = buildMatchKey(espn.homeTeam, espn.awayTeam);
    const fsMatch = pendingMatches.find(m =>
      m.matchKey === matchKey ||
      buildMatchKey(m.homeTeam, m.awayTeam) === matchKey
    );
    return fsMatch && !(fsMatch.played && fsMatch.finalized);
  });

  if (!newlyFinished.length) {
    console.log("Todos los partidos terminados ya están finalizados. Fin.");
    return;
  }

  // 4. Cargar todos los participantes (solo si hay partidos nuevos)
  const participantsSnap = await withRetry(() =>
    db.collection("participants").get()
  );
  const allParticipants = participantsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  console.log(`👥 Participantes: ${allParticipants.length}`);

  // 5. Construir mapa de resultados actuales
  const allResults = {};
  for (const m of allMatches) {
    if (m.played && m.matchKey) {
      allResults[m.matchKey] = {
        played: true, result: m.result,
        homeScore: m.homeScore, awayScore: m.awayScore,
        homeTeam: m.homeTeam, awayTeam: m.awayTeam,
        week: m.week, phase: m.phase || "groups"
      };
    }
  }

  // 6. Procesar cada partido terminado
  for (const espn of finished) {
    const matchKey = buildMatchKey(espn.homeTeam, espn.awayTeam);
    console.log(`\n🔍 ${espn.homeTeam} ${espn.homeScore}-${espn.awayScore} ${espn.awayTeam}`);
    console.log(`   matchKey: ${matchKey}`);

    // Buscar en Firestore (primero en pendientes, luego en todos)
    const fsMatch = allMatches.find(m =>
      m.matchKey === matchKey ||
      buildMatchKey(m.homeTeam, m.awayTeam) === matchKey
    );

    if (!fsMatch) {
      console.log(`  ⚠️  No encontrado en Firestore.`);
      console.log(`  Partidos pendientes: ${pendingMatches.map(m => buildMatchKey(m.homeTeam, m.awayTeam)).join(", ")}`);
      continue;
    }

    if (fsMatch.played && fsMatch.finalized) {
      console.log(`  ⏭️  Ya finalizado.`);
      continue;
    }

    const result = espn.homeScore > espn.awayScore ? "home" : espn.awayScore > espn.homeScore ? "away" : "draw";

    // Actualizar partido
    await withRetry(() =>
      db.collection("matches").doc(fsMatch.id).update({
        live: false, played: true, finalized: true,
        result, homeScore: espn.homeScore, awayScore: espn.awayScore,
        matchKey, autoUpdated: true, updatedAt: admin.firestore.FieldValue.serverTimestamp()
      })
    );
    console.log(`  ✅ Partido actualizado`);

    // Agregar al mapa de resultados
    allResults[matchKey] = {
      played: true, result,
      homeScore: espn.homeScore, awayScore: espn.awayScore,
      homeTeam: fsMatch.homeTeam, awayTeam: fsMatch.awayTeam,
      week: fsMatch.week, phase: fsMatch.phase || "groups"
    };

    // Recalcular puntos de todos los participantes
    const batch = db.batch();
    let updated = 0;
    for (const p of allParticipants) {
      const preds = Object.values(p.predictions || {});
      const { totalPoints, weekPoints, phasePoints, matchBreakdown } = calcParticipantTotal(preds, allResults);
      // Actualizar siempre para asegurar consistencia
      batch.update(db.collection("participants").doc(p.id), {
        totalPoints, weekPoints, phasePoints, matchBreakdown,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      updated++;
    }
    await withRetry(() => batch.commit());
    console.log(`  👥 ${updated} participantes actualizados`);

    // Notificación push
    const winner = result === "draw" ? "Empate" : result === "home" ? `Gana ${fsMatch.homeTeam}` : `Gana ${fsMatch.awayTeam}`;
    await sendPushToAll(
      `⚽ ${fsMatch.homeTeam} ${espn.homeScore}-${espn.awayScore} ${fsMatch.awayTeam}`,
      `${winner} · ¡Puntos actualizados! 🏆`
    );
  }

  console.log("\n🏁 Finalizado.");
}

main().catch(err => {
  console.error("❌ Error:", err.message);
  process.exit(1);
});
