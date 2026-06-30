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
  "chequia":                "republica checa",
  "rep. checa":             "republica checa",
  "rep checa":              "republica checa",
  "república checa":        "republica checa",

  // ── Corea del Sur ──
  "south korea":            "corea del sur",
  "korea republic":         "corea del sur",
  "korea":                  "corea del sur",

  // ── Costa de Marfil ──
  "ivory coast":            "costa de marfil",
  "cote d'ivoire":          "costa de marfil",
  "cote divoire":           "costa de marfil",

  // ── Arabia Saudita ──
  "saudi arabia":           "arabia saudi",
  "arabia saudita":         "arabia saudi",

  // ── Sudáfrica ──
  "south africa":           "sudafrica",

  // ── RD Congo ──
  "dr congo":               "rd congo",
  "congo dr":               "rd congo",
  "democratic republic of congo": "rd congo",
  "drc":                    "rd congo",
  "congo, dr":              "rd congo",

  // ── Bosnia Herzegovina ──
  "bosnia-herzegovina":     "bosnia",
  "bosnia and herzegovina": "bosnia",
  "bosnia & herzegovina":   "bosnia",
  "bosnia herzegovina":     "bosnia",
  "bosnia herz":            "bosnia",
  "bosnia herz.":           "bosnia",

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
  "n. zelanda":             "nueva zelanda",
  "n zelanda":              "nueva zelanda",
  "nva. zelanda":           "nueva zelanda",
  "nva zelanda":            "nueva zelanda",
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
  let exactScores = 0;
  let correctResults = 0;

  // Indexar predicciones con múltiples claves para máxima cobertura
  const predMap = {};
  const addToPredMap = (key, val) => { if (key && key !== "_vs_") predMap[key] = val; };

  for (const [dictKey, p] of Object.entries(predictions)) {
    const mk = p.matchKey || dictKey;
    const entry = { ...p, matchKey: mk };

    // 1. Clave tal como está guardada en el dict
    addToPredMap(dictKey, entry);
    // 2. matchKey interno del objeto (si difiere)
    if (mk !== dictKey) addToPredMap(mk, entry);
    // 3. Normalizado por homeTeam/awayTeam (si existen en el objeto)
    const normKey = buildMatchKey(p.homeTeam || "", p.awayTeam || "");
    if (normKey !== mk && normKey !== dictKey) addToPredMap(normKey, entry);
    // 4. Re-normalizar el dictKey dividiéndolo por "_vs_"
    //    Resuelve casos donde el key fue guardado con nombres de equipo en versión anterior
    //    Ej: "suiza_vs_bosnia herz." → "suiza_vs_bosnia"
    //    Ej: "espana_vs_arabia saudita" → "espana_vs_arabia saudi"
    if (dictKey.includes("_vs_")) {
      const vsIdx = dictKey.indexOf("_vs_");
      const rawHome = dictKey.slice(0, vsIdx).replace(/_/g, " ");
      const rawAway = dictKey.slice(vsIdx + 4).replace(/_/g, " ");
      const rNormKey = buildMatchKey(rawHome, rawAway);
      if (rNormKey !== mk && rNormKey !== dictKey && rNormKey !== normKey) {
        addToPredMap(rNormKey, entry);
      }
    }
  }

  // Deduplicar: allResults puede tener el mismo partido con dos claves distintas
  const seenMatches = new Set();
  for (const [matchKey, real] of Object.entries(allResults)) {
    if (!real.played) continue;
    // Usar homeTeam+awayTeam normalizado como clave única del partido
    const dedupeKey = buildMatchKey(real.homeTeam || "", real.awayTeam || "");
    if (seenMatches.has(dedupeKey)) continue;
    seenMatches.add(dedupeKey);
    // Buscar predicción: exacto, luego normalizado del partido real
    const altKey = buildMatchKey(real.homeTeam || "", real.awayTeam || "");
    const pred = predMap[matchKey] || predMap[altKey] || { prediction: null, homeScore: null, awayScore: null };
    const pts  = calcMatchPoints(pred, real);
    totalPoints += pts.total;
    if (pts.hitScore)  exactScores++;
    if (pts.hitWinner) correctResults++;
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
  return { totalPoints, weekPoints, phasePoints, matchBreakdown, exactScores, correctResults };
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

function espnDateStr(date) {
  const yyyy = date.getUTCFullYear();
  const mm   = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd   = String(date.getUTCDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

async function fetchESPNMatches() {
  // Consultar ESPN por DOS fechas: la fecha UTC actual Y la fecha en hora México (UTC-6)
  // Esto cubre partidos que empiezan después de las 6 PM México (medianoche UTC del día siguiente)
  const nowUtc = new Date();
  const nowMex = new Date(Date.now() - 6 * 60 * 60 * 1000);
  const dateUtc = espnDateStr(nowUtc);
  const dateMex = espnDateStr(nowMex);

  // Obtener fechas únicas a consultar
  const datesToFetch = [...new Set([dateUtc, dateMex])];
  console.log(`📡 ESPN fechas a consultar: ${datesToFetch.join(", ")}`);

  let allEvents = [];
  for (const dateStr of datesToFetch) {
    const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=${dateStr}`;
    let data;
    try {
      data = await httpGet(url);
    } catch(e) {
      console.log(`⚠️ Error al consultar ESPN (${dateStr}): ${e.message}. Se omite este ciclo.`);
      return null;
    }
    allEvents.push(...(data.events || []));
  }

  // Deduplicar por ID de evento
  const seen = new Set();
  const events = allEvents.filter(ev => {
    if (seen.has(ev.id)) return false;
    seen.add(ev.id);
    return true;
  });

  return events.map(ev => {
    const comp       = ev.competitions?.[0];
    const home       = comp?.competitors?.find(c => c.homeAway === "home");
    const away       = comp?.competitors?.find(c => c.homeAway === "away");
    const statusType   = comp?.status?.type?.name || "";
    const completed    = comp?.status?.type?.completed === true;
    const clock        = comp?.status?.displayClock || "";
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
    // Marcador de penales: ESPN lo puede poner en shootoutScore, penaltyScore,
    // o en el último linescore (periodo de penales).
    // Intentamos todas las variantes posibles.
    const linescores = comp?.linescores || [];
    const penLinescore = linescores.find(ls =>
      (ls.type || "").toLowerCase().includes("pen") ||
      (ls.displayName || "").toLowerCase().includes("pen") ||
      (ls.abbreviation || "").toLowerCase() === "p"
    );
    const homePenRaw = home?.shootoutScore ?? home?.penaltyScore ??
      (penLinescore ? penLinescore.home ?? penLinescore.homeScore : undefined);
    const awayPenRaw = away?.shootoutScore ?? away?.penaltyScore ??
      (penLinescore ? penLinescore.away ?? penLinescore.awayScore : undefined);
    const penHome = homePenRaw !== undefined && homePenRaw !== null ? parseInt(homePenRaw) : NaN;
    const penAway = awayPenRaw !== undefined && awayPenRaw !== null ? parseInt(awayPenRaw) : NaN;
    return {
      homeTeam:          home?.team?.displayName || "",
      awayTeam:          away?.team?.displayName || "",
      homeScore:         parseInt(home?.score   || "0"),
      awayScore:         parseInt(away?.score   || "0"),
      penaltyHomeScore:  isNaN(penHome) ? null : penHome,  // marcador de penales (si aplica)
      penaltyAwayScore:  isNaN(penAway) ? null : penAway,
      completed,
      inProgress,
      statusType,
      clock,       // minuto del partido (ej. "45'", "90'+2")
      period:      comp?.status?.period   || 0,  // 1=1er tiempo, 2=2do tiempo, 3+=tiempo extra/penales
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
      const msg = e.message || "";
      const isRetryable =
        e.code === 8  || e.code === 14 ||
        msg.includes("RESOURCE_EXHAUSTED") ||
        msg.includes("UNAVAILABLE") ||
        msg.includes("DEADLINE_EXCEEDED") ||
        msg.includes("timeout") ||
        msg.includes("INTERNAL");
      if (isRetryable && attempt < retries) {
        const wait = delayMs * attempt;
        console.log(`⏳ Intento ${attempt}/${retries} fallido (${e.code || msg.slice(0,40)}). Reintentando en ${wait/1000}s...`);
        await new Promise(r => setTimeout(r, wait));
      } else {
        throw e;
      }
    }
  }
}

// Escribe en Firestore dividiendo en lotes de máx. 499 ops (límite de Firestore)
async function commitInBatches(db, updates) {
  const BATCH_LIMIT = 499;
  for (let i = 0; i < updates.length; i += BATCH_LIMIT) {
    const chunk = updates.slice(i, i + BATCH_LIMIT);
    const batch = db.batch();
    for (const { ref, data } of chunk) {
      batch.update(ref, data);
    }
    await withRetry(() => batch.commit());
    if (updates.length > BATCH_LIMIT) {
      console.log(`  📦 Lote ${Math.floor(i/BATCH_LIMIT)+1}/${Math.ceil(updates.length/BATCH_LIMIT)} guardado`);
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
    const matchKey    = buildMatchKey(espn.homeTeam, espn.awayTeam);
    const matchKeyRev = buildMatchKey(espn.awayTeam,  espn.homeTeam);
    const fsMatch = allMatches.find(m =>
      m.matchKey === matchKey ||
      m.matchKey === matchKeyRev ||
      buildMatchKey(m.homeTeam, m.awayTeam) === matchKey ||
      buildMatchKey(m.homeTeam, m.awayTeam) === matchKeyRev
    );
    if (fsMatch && !fsMatch.finalized) {
      const update = {
        live: true,
        liveHomeScore: espn.homeScore,
        liveAwayScore: espn.awayScore,
        liveClock: espn.clock || "",
      };
      // Guardar score90 SOLO durante el segundo tiempo (period 2).
      // Esto captura el marcador de los 90 min incluyendo tiempo de compensación.
      // Una vez que empieza el tiempo extra (period >= 3), ya NO se actualiza score90
      // para conservar el marcador exacto al finalizar los 90 min.
      if (espn.period === 2) {
        update.score90Home = espn.homeScore;
        update.score90Away = espn.awayScore;
        fsMatch.score90Home = espn.homeScore;
        fsMatch.score90Away = espn.awayScore;
      }
      await withRetry(() =>
        db.collection("matches").doc(fsMatch.id).update(update)
      );
      fsMatch.live = true;
      fsMatch.liveHomeScore = espn.homeScore;
      fsMatch.liveAwayScore = espn.awayScore;
      const periodLabel = espn.period >= 3 ? " [T.E.]" : "";
      console.log(`🟢 En vivo: ${espn.homeTeam} ${espn.homeScore}-${espn.awayScore} ${espn.awayTeam}${periodLabel} (period ${espn.period})`);
      invalidateCache();
    }
  }

  // 3b. Verificar si hay partidos nuevos por procesar
  const newlyFinished = finished.filter(espn => {
    const matchKey    = buildMatchKey(espn.homeTeam, espn.awayTeam);
    const matchKeyRev = buildMatchKey(espn.awayTeam,  espn.homeTeam);
    const fsMatch = allMatches.find(m =>
      m.matchKey === matchKey ||
      m.matchKey === matchKeyRev ||
      buildMatchKey(m.homeTeam, m.awayTeam) === matchKey ||
      buildMatchKey(m.homeTeam, m.awayTeam) === matchKeyRev
    );
    return fsMatch && !(fsMatch.played && fsMatch.finalized);
  });

  // 3c. Reparar partidos de penales ya finalizados que no tengan penaltyHomeScore guardado
  for (const espn of finished) {
    if (espn.statusType !== "STATUS_FINAL_PEN") continue;
    if (espn.penaltyHomeScore === null || espn.penaltyAwayScore === null) continue;
    const matchKey    = buildMatchKey(espn.homeTeam, espn.awayTeam);
    const matchKeyRev = buildMatchKey(espn.awayTeam, espn.homeTeam);
    const fsMatch = allMatches.find(m =>
      m.matchKey === matchKey || m.matchKey === matchKeyRev ||
      buildMatchKey(m.homeTeam, m.awayTeam) === matchKey ||
      buildMatchKey(m.homeTeam, m.awayTeam) === matchKeyRev
    );
    if (!fsMatch || !fsMatch.finalized) continue;
    if (fsMatch.penaltyHomeScore != null) continue; // ya tiene el dato
    console.log(`🔧 Reparando marcador de penales: ${espn.homeTeam} vs ${espn.awayTeam} → ${espn.penaltyHomeScore}-${espn.penaltyAwayScore}`);
    await withRetry(() =>
      db.collection("matches").doc(fsMatch.id).update({
        penaltyHomeScore: espn.penaltyHomeScore,
        penaltyAwayScore: espn.penaltyAwayScore,
      })
    );
    fsMatch.penaltyHomeScore = espn.penaltyHomeScore;
    fsMatch.penaltyAwayScore = espn.penaltyAwayScore;
    invalidateCache();
  }

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
      const updates = allParticipants.map(p => {
        const { totalPoints, weekPoints, phasePoints, matchBreakdown, exactScores, correctResults } = calcParticipantTotal(p.predictions || {}, allResults);
        return { ref: db.collection("participants").doc(p.id), data: { totalPoints, weekPoints, phasePoints, matchBreakdown, exactScores, correctResults, updatedAt: admin.firestore.FieldValue.serverTimestamp() } };
      });
      await commitInBatches(db, updates);
      console.log(`  ✅ ${allParticipants.length} participantes recalculados`);
      invalidateCache();
    }
    return;
  }

  console.log(`🆕 ${newlyFinished.length} partido(s) nuevos para procesar`);

  // 5. Procesar cada partido terminado
  let anyUpdated = false;
  for (const espn of finished) {
    const matchKey    = buildMatchKey(espn.homeTeam, espn.awayTeam);
    const matchKeyRev = buildMatchKey(espn.awayTeam,  espn.homeTeam);
    console.log(`\n🔍 ${espn.homeTeam} ${espn.homeScore}-${espn.awayScore} ${espn.awayTeam}`);
    console.log(`   matchKey: ${matchKey}`);

    const fsMatch = allMatches.find(m =>
      m.matchKey === matchKey ||
      m.matchKey === matchKeyRev ||
      buildMatchKey(m.homeTeam, m.awayTeam) === matchKey ||
      buildMatchKey(m.homeTeam, m.awayTeam) === matchKeyRev
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

    // ── Determinar marcador que cuenta para puntos ──────────────
    // Para tiempo extra (AET) o penales (PEN): usar el score90 guardado durante
    // el segundo tiempo, que refleja el marcador exacto a los 90 minutos.
    // Para partidos que terminan en 90 min (FULL_TIME): usar el score de ESPN directamente.
    const isAET = espn.statusType === "STATUS_FINAL_AET";
    const isPEN = espn.statusType === "STATUS_FINAL_PEN";
    const needsScore90 = isAET || isPEN;

    let finalHomeScore, finalAwayScore;
    let score90Missing = false;

    if (needsScore90 && fsMatch.score90Home != null && fsMatch.score90Away != null) {
      // ✅ Caso normal: usar el marcador de 90 min guardado durante el segundo tiempo
      finalHomeScore = fsMatch.score90Home;
      finalAwayScore = fsMatch.score90Away;
      console.log(`  ⏱️  ${isAET ? "Tiempo extra" : "Penales"} — usando score90: ${finalHomeScore}-${finalAwayScore} (ESPN final: ${espn.homeScore}-${espn.awayScore})`);
    } else if (needsScore90) {
      // ⚠️  FALLBACK: score90 no disponible (script estuvo inactivo durante el 2do tiempo).
      // Un partido SOLO puede ir a T.E. o penales si estaba EMPATADO a los 90 min.
      // → El resultado para quiniela SIEMPRE es "draw".
      // Usamos el marcador ESPN pero FORZAMOS empate para que los puntos sean correctos:
      //   - Quienes predijeron empate reciben 3 pts ✓
      //   - Nadie recibe bonus de marcador exacto (score90 desconocido) ✓
      //   - Nadie recibe puntos por "local" o "visitante" incorrectamente ✓
      finalHomeScore = espn.homeScore;
      finalAwayScore = espn.awayScore;
      score90Missing = true;
      console.log(`  🚨 ALERTA: score90 no disponible para ${espn.homeTeam} vs ${espn.awayTeam}.`);
      console.log(`     Resultado forzado a EMPATE para proteger puntos. Revisar manualmente en admin.`);
    } else {
      // ✅ Partido terminó en 90 min — score de ESPN es el correcto
      finalHomeScore = espn.homeScore;
      finalAwayScore = espn.awayScore;
    }

    // Para AET/PEN el resultado de 90 min SIEMPRE es empate (de lo contrario no habría T.E.)
    // Si score90 falta, forzamos "draw" para que los puntos sean correctos.
    const result = (needsScore90 && score90Missing)
      ? "draw"
      : finalHomeScore > finalAwayScore ? "home"
      : finalAwayScore > finalHomeScore ? "away"
      : "draw";

    // Actualizar partido en Firestore — NO sobreescribir matchKey original
    // para no romper las búsquedas de predicciones que usan el matchKey guardado
    await withRetry(() =>
      db.collection("matches").doc(fsMatch.id).update({
        live: false, played: true, finalized: true,
        result,
        homeScore: finalHomeScore,   // marcador de 90 min (el que cuenta para puntos)
        awayScore: finalAwayScore,
        finalHomeScore: espn.homeScore,  // marcador al final del T.E. (para display)
        finalAwayScore: espn.awayScore,
        penaltyHomeScore: espn.penaltyHomeScore ?? null,  // marcador de penales (solo si isPEN)
        penaltyAwayScore: espn.penaltyAwayScore ?? null,
        statusType: espn.statusType,     // STATUS_FULL_TIME / STATUS_FINAL_AET / STATUS_FINAL_PEN
        autoUpdated: true, updatedAt: admin.firestore.FieldValue.serverTimestamp()
      })
    );
    console.log(`  ✅ Partido actualizado — resultado: ${result} (${finalHomeScore}-${finalAwayScore})`);
    anyUpdated = true;

    // Actualizar en memoria para cálculos
    fsMatch.played         = true;
    fsMatch.finalized      = true;
    fsMatch.result         = result;
    fsMatch.homeScore      = finalHomeScore;
    fsMatch.awayScore      = finalAwayScore;
    fsMatch.finalHomeScore = espn.homeScore;
    fsMatch.finalAwayScore = espn.awayScore;
    fsMatch.statusType     = espn.statusType;

    // Agregar al mapa de resultados (con variante normalizada para predMap lookup)
    const newEntry = {
      played: true, result,
      homeScore: finalHomeScore, awayScore: finalAwayScore,  // 90 min score para puntos
      homeTeam: fsMatch.homeTeam, awayTeam: fsMatch.awayTeam,
      week: fsMatch.week, phase: fsMatch.phase || "groups"
    };
    allResults[matchKey] = newEntry;
    const normResKey = buildMatchKey(fsMatch.homeTeam || "", fsMatch.awayTeam || "");
    if (normResKey && normResKey !== matchKey) allResults[normResKey] = newEntry;
    if (fsMatch.matchKey && fsMatch.matchKey !== matchKey) allResults[fsMatch.matchKey] = newEntry;

    // Recalcular puntos de todos los participantes
    const updates = allParticipants.map(p => {
      const { totalPoints, weekPoints, phasePoints, matchBreakdown, exactScores, correctResults } = calcParticipantTotal(p.predictions || {}, allResults);
      return { ref: db.collection("participants").doc(p.id), data: { totalPoints, weekPoints, phasePoints, matchBreakdown, exactScores, correctResults, updatedAt: admin.firestore.FieldValue.serverTimestamp() } };
    });
    await commitInBatches(db, updates);
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
    const updates = allParticipants.map(p => {
      const { totalPoints, weekPoints, phasePoints, matchBreakdown, exactScores, correctResults } = calcParticipantTotal(p.predictions || {}, allResults);
      return { ref: db.collection("participants").doc(p.id), data: { totalPoints, weekPoints, phasePoints, matchBreakdown, exactScores, correctResults, updatedAt: admin.firestore.FieldValue.serverTimestamp() } };
    });
    await commitInBatches(db, updates);
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
