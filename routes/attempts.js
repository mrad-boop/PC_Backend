const router = require("express").Router();
const db     = require("../db");
const { auth } = require("../middleware/auth");

// ── GET /api/attempts ── (résultats de l'utilisateur connecté)
router.get("/", auth, async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT serie_id, correct, score, level, done_at FROM attempts WHERE user_id = ?",
      [req.user.id]
    );
    // Retourner sous forme d'objet { serie_id: {...} }
    const map = {};
    rows.forEach(r => { map[r.serie_id] = r; });
    res.json(map);
  } catch (e) {
    res.status(500).json({ error: "Erreur serveur." });
  }
});

// ── POST /api/attempts ── (sauvegarder un résultat)
router.post("/", auth, async (req, res) => {
  try {
    const { serie_id, correct, score, level, answers } = req.body;
    if (!serie_id || correct === undefined) return res.status(400).json({ error: "Données manquantes." });

    // Vérifier règle Free : 1 essai par jour
    if (req.user.plan !== "premium") {
      const [existing] = await db.query(
        "SELECT done_at FROM attempts WHERE user_id = ? AND serie_id = ?",
        [req.user.id, serie_id]
      );
      if (existing.length) {
        const lastDate = new Date(existing[0].done_at).toDateString();
        const today    = new Date().toDateString();
        if (lastDate === today) {
          return res.status(429).json({ error: "Disponible demain (plan Free)." });
        }
      }
    }

    await db.query(
      `INSERT INTO attempts (user_id, serie_id, correct, score, level, answers, done_at)
       VALUES (?,?,?,?,?,?,NOW())
       ON DUPLICATE KEY UPDATE correct=VALUES(correct), score=VALUES(score), level=VALUES(level), answers=VALUES(answers), done_at=NOW()`,
      [req.user.id, serie_id, correct, score, level, JSON.stringify(answers || {})]
    );
    res.json({ message: "Résultat sauvegardé." });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erreur serveur." });
  }
});

module.exports = router;
