/**
 * GOLNER SPORTS — Scoring Engine
 * ────────────────────────────────
 * Sistema de puntos:
 *   • Acertar ganador / empate  = 3 pts
 *   • Acertar marcador exacto   = 2 pts extra
 *   • Máximo por partido        = 5 pts
 */

const GolnerScoring = (() => {

  const POINTS_WINNER = 3;
  const POINTS_SCORE  = 2;

  /**
   * Calcula los puntos para UNA predicción vs UN resultado real.
   *
   * @param {{
   *   prediction: "home"|"away"|"draw"|null,
   *   homeScore: number|null,
   *   awayScore: number|null
   * }} pred  — predicción del participante
   *
   * @param {{
   *   result: "home"|"away"|"draw",
   *   homeScore: number,
   *   awayScore: number
   * }} real  — resultado oficial del partido
   *
   * @returns {{
   *   winnerPoints: number,   // 3 ó 0
   *   scorePoints:  number,   // 2 ó 0
   *   total:        number,   // 0-5
   *   hitWinner:    boolean,
   *   hitScore:     boolean
   * }}
   */
  function calcMatchPoints(pred, real) {
    // Partido aún no jugado
    if (!real || real.result === undefined) {
      return { winnerPoints: 0, scorePoints: 0, total: 0, hitWinner: false, hitScore: false };
    }

    const hitWinner = pred.prediction !== null && pred.prediction === real.result;

    const hitScore =
      hitWinner &&
      pred.homeScore !== null &&
      pred.awayScore !== null &&
      pred.homeScore === real.homeScore &&
      pred.awayScore === real.awayScore;

    const winnerPoints = hitWinner ? POINTS_WINNER : 0;
    const scorePoints  = hitScore  ? POINTS_SCORE  : 0;

    return {
      winnerPoints,
      scorePoints,
      total:    winnerPoints + scorePoints,
      hitWinner,
      hitScore
    };
  }

  /**
   * Recalcula los puntos totales de UN participante contra todos
   * los resultados reales disponibles.
   *
   * @param {Array<{matchKey, prediction, homeScore, awayScore}>} predictions
   *   — predicciones del participante (indexadas por matchKey)
   *
   * @param {Object<string, {result, homeScore, awayScore, week, phase}>} results
   *   — resultados reales, clave = matchKey
   *
   * @returns {{
   *   totalPoints: number,
   *   weekPoints:  {1: number, 2: number, 3: number},
   *   phasePoints: Object<string, number>,
   *   matchBreakdown: Array<{matchKey, ...calcMatchPoints output, week, phase}>
   * }}
   */
  function calcParticipantTotal(predictions, results) {
    const weekPoints  = { 1: 0, 2: 0, 3: 0 };
    const phasePoints = {};
    const matchBreakdown = [];
    let totalPoints = 0;

    // Crear mapa de predicciones por matchKey
    const predMap = {};
    for (const p of predictions) {
      predMap[p.matchKey] = p;
    }

    // Iterar sobre resultados reales (deduplicando por homeTeam+awayTeam)
    const seenMatches = new Set();
    for (const [matchKey, real] of Object.entries(results)) {
      if (!real.played) continue;

      // Deduplicar: mismo partido puede estar indexado con dos claves distintas
      const dedupeKey = (real.homeTeam || "") + "_vs_" + (real.awayTeam || "");
      if (seenMatches.has(dedupeKey)) continue;
      seenMatches.add(dedupeKey);

      const pred = predMap[matchKey] || { prediction: null, homeScore: null, awayScore: null };
      const pts  = calcMatchPoints(pred, real);

      totalPoints += pts.total;

      // Puntos por semana (solo fase de grupos)
      const week = real.week;
      if (week && weekPoints[week] !== undefined) {
        weekPoints[week] += pts.total;
      }

      // Puntos por fase
      const phase = real.phase || "groups";
      phasePoints[phase] = (phasePoints[phase] || 0) + pts.total;

      matchBreakdown.push({
        matchKey,
        homeTeam: real.homeTeam,
        awayTeam: real.awayTeam,
        week,
        phase,
        ...pts,
        predHome: pred.homeScore,
        predAway: pred.awayScore,
        realHome: real.homeScore,
        realAway: real.awayScore,
        predResult: pred.prediction,
        realResult: real.result
      });
    }

    return { totalPoints, weekPoints, phasePoints, matchBreakdown };
  }

  /**
   * Calcula el estado de clasificación de cada participante.
   *
   * @param {Array<{id, name, totalPoints, status}>} participants  — ordenados por totalPoints DESC
   * @param {number} cutoffPct   — fracción que avanza (ej: 0.4 = top 40%)
   * @param {string} phase       — fase actual del torneo
   *
   * @returns {Array<{id, status: "classified"|"risk"|"eliminated"}>}
   */
  function calcClassification(participants, cutoffPct = 0.4, phase = "groups") {
    const total   = participants.length;
    const cutRank = Math.ceil(total * cutoffPct);
    const riskZone = Math.ceil(cutRank * 1.15); // 15% buffer

    return participants.map((p, idx) => {
      const rank = idx + 1;

      // Si ya está marcado como eliminado manualmente, respetarlo
      if (p.status === "eliminated") return { id: p.id, status: "eliminated" };

      if (rank <= cutRank)   return { id: p.id, status: "classified" };
      if (rank <= riskZone)  return { id: p.id, status: "risk" };
      return { id: p.id, status: "eliminated" };
    });
  }

  /**
   * Genera un resumen de estadísticas globales del torneo.
   *
   * @param {Array} participants
   * @param {Object} results
   * @returns {{
   *   avgPoints: number,
   *   topScorer: {name, totalPoints},
   *   exactScoreHits: number,
   *   matchAccuracy: Array<{matchKey, homeTeam, awayTeam, pct}>
   * }}
   */
  function calcGlobalStats(participants, results) {
    if (!participants.length) {
      return { avgPoints: 0, topScorer: null, exactScoreHits: 0, matchAccuracy: [] };
    }

    const totalPts     = participants.reduce((s, p) => s + (p.totalPoints || 0), 0);
    const avgPoints    = Math.round((totalPts / participants.length) * 10) / 10;
    const topScorer    = participants[0] || null;

    // Contar marcadores exactos totales
    let exactScoreHits = 0;
    // Precisión por partido
    const matchHits    = {};
    const matchTotal   = {};

    for (const p of participants) {
      const breakdown = p.matchBreakdown || [];
      for (const m of breakdown) {
        exactScoreHits += m.hitScore ? 1 : 0;
        matchHits[m.matchKey]  = (matchHits[m.matchKey]  || 0) + (m.hitWinner ? 1 : 0);
        matchTotal[m.matchKey] = (matchTotal[m.matchKey] || 0) + 1;
      }
    }

    const matchAccuracy = Object.entries(matchHits)
      .map(([matchKey, hits]) => {
        const real = results[matchKey] || {};
        return {
          matchKey,
          homeTeam: real.homeTeam || matchKey,
          awayTeam: real.awayTeam || "",
          hits,
          total: matchTotal[matchKey] || 0,
          pct: Math.round((hits / (matchTotal[matchKey] || 1)) * 100)
        };
      })
      .sort((a, b) => b.pct - a.pct);

    return { avgPoints, topScorer, exactScoreHits, matchAccuracy };
  }

  // ── PUBLIC API ────────────────────────────────────────────────
  return {
    calcMatchPoints,
    calcParticipantTotal,
    calcClassification,
    calcGlobalStats,
    POINTS_WINNER,
    POINTS_SCORE
  };

})();

if (typeof module !== "undefined") module.exports = GolnerScoring;
window.GolnerScoring = GolnerScoring;
