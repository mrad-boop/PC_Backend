const router = require("express").Router();
const db     = require("../db");
const { auth, adminAuth } = require("../middleware/auth");

// Middleware optionnel : lit le token si présent, mais ne bloque pas
const optionalAuth = (req, res, next) => {
  const h = req.headers.authorization;
  if (!h || !h.startsWith("Bearer ")) return next();
  const jwt = require("jsonwebtoken");
  try {
    req.user = jwt.verify(h.split(" ")[1], process.env.JWT_SECRET || "secret");
  } catch {}
  next();
};

// ── GET /api/series ── retourne toutes les séries avec leurs questions
// Accessible avec ou sans token ; les questions premium sont incluses (le contrôle se fait côté UI)
router.get("/", optionalAuth, async (req, res) => {
  try {
    const [series] = await db.query("SELECT * FROM series ORDER BY type, id");
    const result = await Promise.all(series.map(async (serie) => {
      const [questions] = await db.query(
        "SELECT * FROM questions WHERE serie_id = ? ORDER BY position",
        [serie.id]
      );
      const qs = questions.map(q => ({
        id:            q.id,
        text:          q.text,
        image:         q.image || null,
        options:       [q.option_a, q.option_b, q.option_c, q.option_d],
        correct:       Number(q.correct),
        isImageChoice: !!q.is_image_choice,
      }));
      return {
        ...serie,
        premium:   !!serie.premium,
        questions: qs,
      };
    }));
    res.json(result);
  } catch (e) {
    console.error("GET /api/series error:", e);
    res.status(500).json({ error: "Erreur serveur." });
  }
});

// ── GET /api/series/:id ── (auth requise — vérifie accès premium)
router.get("/:id", auth, async (req, res) => {
  try {
    const [series] = await db.query("SELECT * FROM series WHERE id = ?", [req.params.id]);
    if (!series.length) return res.status(404).json({ error: "Série introuvable." });
    const serie = series[0];

    // Vérification accès premium
    const isPremium = req.user.plan === "premium" || req.user.role === "admin";
    if (serie.premium && !isPremium) {
      return res.status(403).json({ error: "Accès Premium requis pour cette série." });
    }

    const [questions] = await db.query(
      "SELECT * FROM questions WHERE serie_id = ? ORDER BY position",
      [req.params.id]
    );

    const qs = questions.map(q => ({
      id:            q.id,
      text:          q.text,
      image:         q.image || null,
      options:       [q.option_a, q.option_b, q.option_c, q.option_d],
      correct:       Number(q.correct),
      isImageChoice: !!q.is_image_choice,
    }));

    res.json({ ...serie, premium: !!serie.premium, questions: qs });
  } catch (e) {
    console.error("GET /api/series/:id error:", e);
    res.status(500).json({ error: "Erreur serveur." });
  }
});

// ── POST /api/series ── (admin)
router.post("/", adminAuth, async (req, res) => {
  try {
    const { id, type, title, premium, audioUrl, questions } = req.body;
    if (!id || !type || !title) return res.status(400).json({ error: "id, type et title obligatoires." });

    await db.query(
      "INSERT INTO series (id, type, title, premium, audio_url) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE title=VALUES(title), premium=VALUES(premium), audio_url=VALUES(audio_url)",
      [id, type, title, premium ? 1 : 0, audioUrl || null]
    );

    if (questions && questions.length) {
      await db.query("DELETE FROM questions WHERE serie_id = ?", [id]);
      const rows = questions.map((q, i) => [
        id, i + 1,
        q.text || "",
        q.image || null,
        (q.options && q.options[0]) || "",
        (q.options && q.options[1]) || "",
        (q.options && q.options[2]) || "",
        (q.options && q.options[3]) || "",
        Number(q.correct) || 0,
        q.isImageChoice ? 1 : 0,
      ]);
      await db.query(
        "INSERT INTO questions (serie_id, position, text, image, option_a, option_b, option_c, option_d, correct, is_image_choice) VALUES ?",
        [rows]
      );
    }
    res.status(201).json({ message: "Série enregistrée.", id });
  } catch (e) {
    console.error("POST /api/series error:", e);
    res.status(500).json({ error: "Erreur serveur." });
  }
});

// ── DELETE /api/series/:id ── (admin)
router.delete("/:id", adminAuth, async (req, res) => {
  try {
    await db.query("DELETE FROM questions WHERE serie_id = ?", [req.params.id]);
    await db.query("DELETE FROM series WHERE id = ?", [req.params.id]);
    res.json({ message: "Série supprimée." });
  } catch (e) {
    res.status(500).json({ error: "Erreur serveur." });
  }
});

module.exports = router;