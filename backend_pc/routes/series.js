const router = require("express").Router();
const db     = require("../db");
const { auth, adminAuth } = require("../middleware/auth");

// ── GET /api/series ── (public — séries sans questions)
router.get("/", async (req, res) => {
  try {
    const [series] = await db.query("SELECT * FROM series ORDER BY type, id");
    res.json(series);
  } catch (e) {
    res.status(500).json({ error: "Erreur serveur." });
  }
});

// ── GET /api/series/:id ── (avec questions — auth requise)
router.get("/:id", auth, async (req, res) => {
  try {
    const [series] = await db.query("SELECT * FROM series WHERE id = ?", [req.params.id]);
    if (!series.length) return res.status(404).json({ error: "Série introuvable." });
    const serie = series[0];

    // Vérification accès premium
    if (serie.premium && req.user.plan !== "premium" && req.user.role !== "admin") {
      return res.status(403).json({ error: "Accès Premium requis." });
    }

    const [questions] = await db.query(
      "SELECT * FROM questions WHERE serie_id = ? ORDER BY position",
      [req.params.id]
    );

    // Reformater les questions
    const qs = questions.map(q => ({
      id:           q.id,
      text:         q.text,
      image:        q.image,
      options:      [q.option_a, q.option_b, q.option_c, q.option_d],
      correct:      q.correct,
      isImageChoice: !!q.is_image_choice,
    }));

    res.json({ ...serie, questions: qs });
  } catch (e) {
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
        id, i + 1, q.text, q.image || null,
        q.options[0], q.options[1], q.options[2], q.options[3],
        q.correct, q.isImageChoice ? 1 : 0,
      ]);
      await db.query(
        "INSERT INTO questions (serie_id, position, text, image, option_a, option_b, option_c, option_d, correct, is_image_choice) VALUES ?",
        [rows]
      );
    }
    res.status(201).json({ message: "Série enregistrée.", id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erreur serveur." });
  }
});

// ── DELETE /api/series/:id ── (admin)
router.delete("/:id", adminAuth, async (req, res) => {
  try {
    await db.query("DELETE FROM series WHERE id = ?", [req.params.id]);
    res.json({ message: "Série supprimée." });
  } catch (e) {
    res.status(500).json({ error: "Erreur serveur." });
  }
});

module.exports = router;
