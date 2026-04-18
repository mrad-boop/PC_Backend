const router = require("express").Router();
const db     = require("../db");
const { auth } = require("../middleware/auth");

// Quotas par rang
const CV_QUOTAS = { free:0, bronze:3, silver:10, gold:30, premium:30 };

// Créer les tables si elles n'existent pas
const createTables = async () => {
  await db.query(`
    CREATE TABLE IF NOT EXISTS cv_profiles (
      id         INT AUTO_INCREMENT PRIMARY KEY,
      user_id    INT NOT NULL UNIQUE,
      data       LONGTEXT NOT NULL,
      cv_count   INT DEFAULT 0,
      updated_at DATETIME DEFAULT NOW() ON UPDATE NOW(),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);
};
createTables().catch(console.error);

// GET /api/cv — charger profil CV + compteur
router.get("/", auth, async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT data, cv_count, updated_at FROM cv_profiles WHERE user_id = ?",
      [req.user.id]
    );
    // Récupérer rang user
    const [userRows] = await db.query("SELECT rank FROM users WHERE id = ?", [req.user.id]);
    const rank = userRows[0]?.rank || req.user.plan || "free";
    const quota = CV_QUOTAS[rank] ?? 0;

    if (!rows.length) return res.json({ cv_count:0, quota, rank });
    res.json({
      ...JSON.parse(rows[0].data),
      cv_count:  rows[0].cv_count,
      updated_at: rows[0].updated_at,
      quota,
      rank,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erreur serveur." });
  }
});

// POST /api/cv/save — sauvegarder profil (sans incrémenter le compteur)
router.post("/save", auth, async (req, res) => {
  try {
    const data = JSON.stringify(req.body);
    await db.query(
      `INSERT INTO cv_profiles (user_id, data, cv_count) VALUES (?, ?, 0)
       ON DUPLICATE KEY UPDATE data = VALUES(data), updated_at = NOW()`,
      [req.user.id, data]
    );
    res.json({ message: "Profil CV sauvegardé." });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erreur serveur." });
  }
});

// POST /api/cv/generate — générer un CV (incrémente le compteur)
router.post("/generate", auth, async (req, res) => {
  try {
    // Vérifier rang et quota
    const [userRows] = await db.query("SELECT rank, plan FROM users WHERE id = ?", [req.user.id]);
    const rank = userRows[0]?.rank || userRows[0]?.plan || "free";
    const quota = CV_QUOTAS[rank] ?? 0;

    // Récupérer compteur actuel
    const [rows] = await db.query(
      "SELECT cv_count FROM cv_profiles WHERE user_id = ?",
      [req.user.id]
    );
    const currentCount = rows[0]?.cv_count || 0;

    if (currentCount >= quota) {
      return res.status(403).json({
        error: `Quota atteint. Votre plan ${rank} permet ${quota} génération(s).`,
        quota,
        cv_count: currentCount,
      });
    }

    // Incrémenter le compteur + sauvegarder données si envoyées
    const data = Object.keys(req.body).length > 0 ? JSON.stringify(req.body) : null;

    if (rows.length) {
      await db.query(
        `UPDATE cv_profiles SET cv_count = cv_count + 1${data?", data = ?":""}, updated_at = NOW() WHERE user_id = ?`,
        data ? [data, req.user.id] : [req.user.id]
      );
    } else {
      await db.query(
        "INSERT INTO cv_profiles (user_id, data, cv_count) VALUES (?, ?, 1)",
        [req.user.id, data || "{}", ]
      );
    }

    res.json({ message: "CV généré.", cv_count: currentCount + 1, quota });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erreur serveur." });
  }
});

// GET /api/cv/quota — juste vérifier le quota sans charger tout le profil
router.get("/quota", auth, async (req, res) => {
  try {
    const [userRows] = await db.query("SELECT rank, plan FROM users WHERE id = ?", [req.user.id]);
    const rank = userRows[0]?.rank || userRows[0]?.plan || "free";
    const quota = CV_QUOTAS[rank] ?? 0;
    const [rows] = await db.query("SELECT cv_count FROM cv_profiles WHERE user_id = ?", [req.user.id]);
    const cv_count = rows[0]?.cv_count || 0;
    res.json({ rank, quota, cv_count, remaining: Math.max(0, quota - cv_count) });
  } catch (e) {
    res.status(500).json({ error: "Erreur serveur." });
  }
});

module.exports = router;