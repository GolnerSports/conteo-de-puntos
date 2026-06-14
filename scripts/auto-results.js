/**
 * GOLNER SPORTS — Auto Results Script
 * Usa Firebase Admin SDK para acceso completo a Firestore.
 * Consulta ESPN cada 5 min, detecta partidos terminados,
 * actualiza resultados, recalcula puntos y envía notificaciones.
 *
 * Caché local (scripts/firestore-cache.json) para reducir lecturas de Firestore.
 */

const https = require("https");
const fs    = require("fs");
const path  = require("path");

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

// ── CACHÉ LOCAL ───────────────────────────────────────────────────────────────
const CACHE_FILE = path.join(__dirname, "firestore-cache.json");
const CACHE_TTL  = 30 * 60 * 1000; // 30 minutos

function loadCache() {
  try {
    if (!fs.existsSync(CACHE_FILE)) return null;
    const raw = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
    const age = Date.now() - (raw.savedAt || 0);
    if (age > CACHE_TTL) {
      console.log(`⏰ Caché expirado (${Math.round(age/60000)} min). Recargando Firestore.`);
      return null;
    }
    console.log(`💾 Usando caché local (${Math.round(age/60000)} min de antigüedad)`);
    return raw;
  } catch(e) {
    return null;
  }
}

function saveCache(data) {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify({ ...data, savedAt: Date.now() }, null, 2));
    console.log(`💾 Caché guardado`);
  } catch(e) {
    console.log(`⚠️ No se pudo guardar caché: ${e.message}`);
  }
}

function invalidateCache() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const raw = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
      // Marcar como expirado
      raw.savedAt = 0;
      fs.writeFileSync(CACHE_FILE, JSON.stringify(raw, null, 2));
    }
  } catch(e) {}
}

// ── ESPN TEAM NAME MAP ────────────────────────────────────────────────────────
// Mapea nombres en inglés / variantes → nombre canónico en español (sin acentos)
// para que buildMatchKey() siempre produzca el mismo key sin importar la fuente.
const ESPN_NAME_MAP = {
  // ── Estados Unidos ──
  "united states":          "estados unidos",
  "usa":                    "estados unidos",
  "ee.uu.":                 "estados unidos",
  "ee uu":                  "estados unidos",
  "eeuu":                   "estados unidos",
  "u.s.":                   "estados unidos",
  "us":                     "estados unidos",

  // ── República Checa ──
  "czechia":                "republica checa",
  "czech republic":         "republica checa",
  "chequia":                "republica checa",   // variante usada en semana 1

  // ── Corea del Sur ──
  "south korea":            "corea del sur",
  "korea republic":         "corea del sur",
  "korea":                  "corea del sur",

  // ── Costa de Marfil ──
  "ivory coast":            "costa de marfil",
  "cote d'ivoire":          "costa de marfil",
  "cote divoire":           "costa de marfil",

  // ── Arabia Saudita ──
  "saudi arabia":           "arabia saudita",

  // ── Sudáfrica ──
  "south africa":           "sudafrica",

  // ── RD Congo ──
  "dr congo":               "rd congo",
  "congo dr":               "rd congo",
  "democratic republic of congo": "rd congo",
  "drc":                    "rd congo",
  "congo, dr":              "rd congo",

  // ── Bosnia Herzegovina ──
  "bosnia-herzegovina":     "bosnia herzegovina",
  "bosnia and herzegovina": "bosnia herzegovina",
  "bosnia & herzegovina":   "bosnia herzegovina",

  // ── Turquía ──
  "turkiye":                "turquia",
  "turkey":                 "turquia",

  // ── Países Bajos ──
  "netherlands":            "paises bajos",
  "holland":                "paises bajos",

  // ── Resto del mundo (inglés → español) ──
  "algeria":                "argelia",
  "germany":                "alemania",
  "belgium":                "belgica",
  "switzerland":            "suiza",
  "sweden":                 "suecia",
  "norway":                 "noruega",
  "morocco":                "marruecos",
  "egypt":                  "egipto",
  "tunisia":                "tunez",
  "cape verde":             "cabo verde",
  "curacao":                "curazao",
  "jordan":                 "jordania",
  "scotland":               "escocia",
  "england":                "inglaterra",
  "haiti":                  "haiti",
  "iran":                   "iran",
  "iraq":                   "irak",
  "austria":                "austria",
  "qatar":                  "catar",
  "new zealand":            "nueva zelanda",
  "panama":                 "panama",
  "croatia":                "croacia",
  "senegal":                "senegal",
  "colombia":               "colombia",
  "ghana":                  "ghana",
  "portugal":               "portugal",
  "argentina":              "argentina",
  "france":                 "francia",
  "spain":                  "espana",
  "brazil":                 "brasil",
  "ecuador":                "ecuador",
  "japan":                  "japon",
  "mexico":                 "mexico",
  "canada":                 "canada",
  "australia":              "australia",
  "uruguay":                "uruguay",
  "uzbekistan":             "uzbekistan",
  "paraguay":               "paraguay",

  // ── Variantes con acento que llegan sin NFD ──
  "belgica":                "belgica",
  "espana":                 "espana",
  "tunez":                  "tunez",
  "japon":                  "japon",
  "turquia":                "turquia",
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

  // Indexar predicciones usando TANTO la clave del dict como el campo matchKey interno
  const predMap = {};
  for (const [dictKey, p] of Object.entries(predictions)) {
    const mk = p.matchKey || dictKey;  // usar clave del dict si el objeto no tiene matchKey
    predMap[dictKey] = { ...p, matchKey: mk };
    if (mk !== dictKey) predMap[mk] = { ...p, matchKey: mk };
    // También indexar por matchKey normalizado (resuelve EE.UU. → estados unidos, etc.)
    const normKey = buildMatchKey(p.homeTeam || "", p.awayTeam || "");
    if (normKey && normKey !== mk && normKey !== dictKey) predMap[normKey] = { ...p, matchKey: mk };
  }

  for (const [matchKey, real] of Object.entries(allResults)) {
    if (!real.played) continue;
    // Buscar predicción: exacto, luego normalizado del partido real
    const altKey = buildMatchKey(real.homeTeam || "", real.awayTeam || "");
    const pred = predMap[matchKey] || predMap[altKey] || { prediction: null, homeScore: null, awayScore: null };
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

// Estados de ESPN que indican que el partido está en curso
// (incluye tiempo normal, medio tiempo, tiempo extra y penales)
const LIVE_STATUSES = new Set([
  "STATUS_IN_PROGRESS",
  "STATUS_FIRST_HALF",
  "STATUS_SECOND_HALF",
  "STATUS_HALFTIME",
  "STATUS_END_PERIOD",
  "STATUS_OVERTIME",
  "STATUS_EXTRA_TIME",
  "STATUS_PENALTY",
  "STATUS_SHOOTOUT",
  "STATUS_PAUSE",
  "STATUS_DELAYED",
  "STATUS_RAIN_DELAY",
]);

async function fetchESPNMatches() {
  // Hora México UTC-6
  const now  = new Date(Date.now() - 6 * 60 * 60 * 1000);
  const yyyy = now.getUTCFullYear();
  const mm   = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd   = String(now.getUTCDate()).padStart(2, "0");
  const url  = `https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=${yyyy}${mm}${dd}`;
  console.log(`📡 ESPN: ${url}`);

  let data;
  try {
    data = await httpGet(url);
  } catch(e) {
    console.log(`⚠️ Error al consultar ESPN: ${e.message}. Se omite este ciclo.`);
    return null; // null = señal de fallo, el llamador lo maneja
  }

  return (data.events || []).map(ev => {
    const comp       = ev.competitions?.[0];
    const home       = comp?.competitors?.find(c => c.homeAway === "home");
    const away       = comp?.competitors?.find(c => c.homeAway === "away");
    const statusType = comp?.status?.type?.name || "";
    const completed  = comp?.status?.type?.completed === true;
    // Un partido está en vivo si NO está completado Y su estado está en la lista
    // O si ESPN lo marca explícitamente como en progreso pero con un estado desconocido
    const inProgress = !completed && (
      LIVE_STATUSES.has(statusType) ||
      comp?.status?.type?.state === "in"   // estado genérico de ESPN para "en curso"
    );
    if (statusType && !completed && !inProgress) {
      // Log para detectar estados nuevos que ESPN pueda introducir
      console.log(`  ℹ️  Estado ESPN desconocido: "${statusType}" — ${home?.team?.displayName} vs ${away?.team?.displayName}`);
    }
    return {
      homeTeam:    home?.team?.displayName || "",
      awayTeam:    away?.team?.displayName || "",
      homeScore:   parseInt(home?.score   || "0"),
      awayScore:   parseInt(away?.score   || "0"),
      completed,
      inProgress,
      statusType, // guardarlo para debug en logs
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
        // Token inválido
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
      const isRetryable = e.code === 8 || e.code === 14 ||
        (e.message || "").includes("RESOURCE_EXHAUSTED") ||
        (e.message || "").includes("UNAVAILABLE");
      if (isRetryable && attempt < retries) {
        const wait = delayMs * attempt;
        console.log(`⏳ Intento ${attempt}/${retries} fallido. Reintentando en ${wait/1000}s...`);
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
  if (espnMatches === null) {
    console.log("❌ No se pudo conectar con ESPN. Se reintentará en el próximo ciclo (5 min).");
    return;
  }
  const finished   = espnMatches.filter(m => m.completed);
  const inProgress = espnMatches.filter(m => m.inProgress);
  console.log(`⚽ Hoy: ${espnMatches.length} partidos, ${finished.length} terminados, ${inProgress.length} en vivo`);
  if (inProgress.length) {
    console.log(`  🟢 En vivo: ${inProgress.map(m => `${m.homeTeam} ${m.homeScore}-${m.awayScore} ${m.awayTeam} [${m.statusType}]`).join(" | ")}`);
  }

  // Si no hay nada que procesar, salir temprano
  if (!finished.length && !inProgress.length) { console.log("Sin partidos activos. Fin."); return; }

  // 2. Cargar datos de Firestore (con caché para ahorrar lecturas)
  let cache = loadCache();
  let allMatches, allParticipants;

  if (cache) {
    allMatches      = cache.matches      || [];
    allParticipants = cache.participants || [];
  } else {
    console.log("📥 Cargando datos de Firestore...");
    const [matchesSnap, participantsSnap] = await Promise.all([
      withRetry(() => db.collection("matches").get()),
      withRetry(() => db.collection("participants").get()),
    ]);
    allMatches      = matchesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    allParticipants = participantsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    saveCache({ matches: allMatches, participants: allParticipants });
  }

  console.log(`📋 Partidos: ${allMatches.length} | 👥 Participantes: ${allParticipants.length}`);

  // 3a. Marcar partidos en curso como "live" automáticamente
  for (const espn of inProgress) {
    const matchKey = buildMatchKey(espn.homeTeam, espn.awayTeam);
    const fsMatch = allMatches.find(m =>
      m.matchKey === matchKey ||
      buildMatchKey(m.homeTeam, m.awayTeam) === matchKey
    );
    if (fsMatch && !fsMatch.finalized) {
      const update = {
        live: true,
        liveHomeScore: espn.homeScore,
        liveAwayScore: espn.awayScore,
      };
      await withRetry(() =>
        db.collection("matches").doc(fsMatch.id).update(update)
      );
      fsMatch.live = true;
      fsMatch.liveHomeScore = espn.homeScore;
      fsMatch.liveAwayScore = espn.awayScore;
      console.log(`🟢 En vivo: ${espn.homeTeam} ${espn.homeScore}-${espn.awayScore} ${espn.awayTeam}`);
      invalidateCache();
    }
  }

  // 3b. Verificar si hay partidos nuevos por procesar
  const newlyFinished = finished.filter(espn => {
    const matchKey = buildMatchKey(espn.homeTeam, espn.awayTeam);
    const fsMatch = allMatches.find(m =>
      m.matchKey === matchKey ||
      buildMatchKey(m.homeTeam, m.awayTeam) === matchKey
    );
    return fsMatch && !(fsMatch.played && fsMatch.finalized);
  });

  // 4. Construir mapa de resultados actuales (indexado por múltiples variantes del matchKey)
  const allResults = {};
  for (const m of allMatches) {
    if (m.played && m.matchKey) {
      const entry = {
        played: true, result: m.result,
        homeScore: m.homeScore, awayScore: m.awayScore,
        homeTeam: m.homeTeam, awayTeam: m.awayTeam,
        week: m.week, phase: m.phase || "groups"
      };
      // Indexar por la clave almacenada en Firestore
      allResults[m.matchKey] = entry;
      // Indexar también por la clave normalizada construida desde homeTeam/awayTeam
      // (resuelve desfases: "chequia" en matchKey vs "republica checa" en predicción, etc.)
      const normKey = buildMatchKey(m.homeTeam || "", m.awayTeam || "");
      if (normKey && normKey !== m.matchKey) allResults[normKey] = entry;
    }
  }

  if (!newlyFinished.length) {
    console.log("✅ Todos los partidos terminados ya están finalizados.");
    if (Object.keys(allResults).length > 0) {
      console.log("🔄 Recalculando puntos de todos los participantes...");
      const batch = db.batch();
      for (const p of allParticipants) {
        const { totalPoints, weekPoints, phasePoints, matchBreakdown } = calcParticipantTotal(p.predictions || {}, allResults);
        batch.update(db.collection("participants").doc(p.id), {
          totalPoints, weekPoints, phasePoints, matchBreakdown,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
      }
      await withRetry(() => batch.commit());
      console.log(`  ✅ ${allParticipants.length} participantes recalculados`);
      invalidateCache();
    }
    return;
  }

  console.log(`🆕 ${newlyFinished.length} partido(s) nuevos para procesar`);

  // 5. Procesar cada partido terminado
  let anyUpdated = false;
  for (const espn of finished) {
    const matchKey = buildMatchKey(espn.homeTeam, espn.awayTeam);
    console.log(`\n🔍 ${espn.homeTeam} ${espn.homeScore}-${espn.awayScore} ${espn.awayTeam}`);
    console.log(`   matchKey: ${matchKey}`);

    const fsMatch = allMatches.find(m =>
      m.matchKey === matchKey ||
      buildMatchKey(m.homeTeam, m.awayTeam) === matchKey
    );

    if (!fsMatch) {
      console.log(`  ⚠️  No encontrado en Firestore.`);
      console.log(`  Partidos disponibles: ${allMatches.map(m => buildMatchKey(m.homeTeam, m.awayTeam)).join(", ")}`);
      continue;
    }

    if (fsMatch.played && fsMatch.finalized) {
      console.log(`  ⏭️  Ya finalizado.`);
      continue;
    }

    const result = espn.homeScore > espn.awayScore ? "home" : espn.awayScore > espn.homeScore ? "away" : "draw";

    // Actualizar partido en Firestore
    await withRetry(() =>
      db.collection("matches").doc(fsMatch.id).update({
        live: false, played: true, finalized: true,
        result, homeScore: espn.homeScore, awayScore: espn.awayScore,
        matchKey, autoUpdated: true, updatedAt: admin.firestore.FieldValue.serverTimestamp()
      })
    );
    console.log(`  ✅ Partido actualizado`);
    anyUpdated = true;

    // Actualizar en memoria para cálculos
    fsMatch.played    = true;
    fsMatch.finalized = true;
    fsMatch.result    = result;
    fsMatch.homeScore = espn.homeScore;
    fsMatch.awayScore = espn.awayScore;

    // Agregar al mapa de resultados (con variante normalizada para predMap lookup)
    const newEntry = {
      played: true, result,
      homeScore: espn.homeScore, awayScore: espn.awayScore,
      homeTeam: fsMatch.homeTeam, awayTeam: fsMatch.awayTeam,
      week: fsMatch.week, phase: fsMatch.phase || "groups"
    };
    allResults[matchKey] = newEntry;
    const normResKey = buildMatchKey(fsMatch.homeTeam || "", fsMatch.awayTeam || "");
    if (normResKey && normResKey !== matchKey) allResults[normResKey] = newEntry;
    if (fsMatch.matchKey && fsMatch.matchKey !== matchKey) allResults[fsMatch.matchKey] = newEntry;

    // Recalcular puntos de todos los participantes
    const batch = db.batch();
    for (const p of allParticipants) {
      
      const { totalPoints, weekPoints, phasePoints, matchBreakdown } = calcParticipantTotal(p.predictions || {}, allResults);
      batch.update(db.collection("participants").doc(p.id), {
        totalPoints, weekPoints, phasePoints, matchBreakdown,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }
    await withRetry(() => batch.commit());
    console.log(`  👥 ${allParticipants.length} participantes actualizados`);

    // Notificación push
    const winner = result === "draw" ? "Empate" : result === "home" ? `Gana ${fsMatch.homeTeam}` : `Gana ${fsMatch.awayTeam}`;
    await sendPushToAll(
      `⚽ ${fsMatch.homeTeam} ${espn.homeScore}-${espn.awayScore} ${fsMatch.awayTeam}`,
      `${winner} · ¡Puntos actualizados! 🏆`
    );
  }

  // Si no hubo partidos nuevos pero hay partidos jugados, recalcular todos los participantes
  // (esto corrige casos donde el matchKey cambió o hubo errores previos)
  if (!anyUpdated && Object.keys(allResults).length > 0) {
    console.log("🔄 Recalculando puntos de todos los participantes...");
    const batch = db.batch();
    for (const p of allParticipants) {
      
      const { totalPoints, weekPoints, phasePoints, matchBreakdown } = calcParticipantTotal(p.predictions || {}, allResults);
      batch.update(db.collection("participants").doc(p.id), {
        totalPoints, weekPoints, phasePoints, matchBreakdown,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }
    await withRetry(() => batch.commit());
    console.log(`  ✅ ${allParticipants.length} participantes recalculados`);
    invalidateCache();
  } else if (anyUpdated) {
    invalidateCache();
  }

  console.log("\n🏁 Finalizado.");
}

main().catch(err => {
  const isQuota = err.code === 8 || (err.message || "").includes("RESOURCE_EXHAUSTED") || (err.message || "").includes("Quota");
  if (isQuota) {
    // Cuota agotada — salir sin error para no recibir emails de falla
    // La cuota se resetea a medianoche hora del Pacífico (~2am México)
    console.log("⏸️  Cuota de Firestore agotada por hoy. Se reintentará en el siguiente ciclo.");
    process.exit(0);
  }
  console.error("❌ Error:", err.message);
  process.exit(1);
});
