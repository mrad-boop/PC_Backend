const router = require("express").Router();
const db     = require("../db");
const { auth, adminAuth } = require("../middleware/auth");

// Tunisie = UTC+1 (heure standard)
const toTunisiaTime = (dt) => {
  if (!dt) return null;
  const d = new Date(dt);
  d.setHours(d.getHours() + 1); // UTC+1
  return d.toISOString().replace("T", " ").substring(0, 19);
};

// Ajouter colonnes si elles n'existent pas
const migrate = async () => {
  await db.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS `rank` VARCHAR(20) DEFAULT 'free'").catch(()=>{});
  await db.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS `total_time` INT DEFAULT 0 COMMENT 'Temps total en secondes'").catch(()=>{});
  await db.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS `session_start` DATETIME DEFAULT NULL").catch(()=>{});
};
migrate();

// GET /api/users — liste complète (admin)
router.get("/", adminAuth, async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT id, nom, email, pays, plan, `rank`, status, joined, last_login, total_time FROM users ORDER BY joined DESC"
    );
    const [cvRows] = await db.query("SELECT user_id, cv_count FROM cv_profiles").catch(()=>[[]] );
    const cvMap = {};
    cvRows.forEach(r => { cvMap[r.user_id] = r.cv_count; });
    const result = rows.map(u => ({
      ...u,
      cv_count:   cvMap[u.id] || 0,
      last_login: toTunisiaTime(u.last_login),
      joined:     toTunisiaTime(u.joined) || u.joined,
      total_time: u.total_time || 0,
    }));
    res.json(result);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erreur serveur." });
  }
});

// POST /api/users/session/start — début de session
router.post("/session/start", auth, async (req, res) => {
  try {
    await db.query("UPDATE users SET session_start = NOW(), last_login = NOW() WHERE id = ?", [req.user.id]);
    res.json({ message: "Session démarrée." });
  } catch (e) {
    res.status(500).json({ error: "Erreur serveur." });
  }
});

// POST /api/users/session/end — fin de session (ajoute la durée)
router.post("/session/end", auth, async (req, res) => {
  try {
    await db.query(
      `UPDATE users
       SET total_time = total_time + GREATEST(0, TIMESTAMPDIFF(SECOND, session_start, NOW())),
           session_start = NULL
       WHERE id = ? AND session_start IS NOT NULL`,
      [req.user.id]
    );
    res.json({ message: "Session terminée." });
  } catch (e) {
    res.status(500).json({ error: "Erreur serveur." });
  }
});

// POST /api/users/session/ping — heartbeat toutes les minutes
router.post("/session/ping", auth, async (req, res) => {
  try {
    const [rows] = await db.query("SELECT session_start FROM users WHERE id = ?", [req.user.id]);
    if (!rows[0]?.session_start) {
      // Re-démarrer si session perdue
      await db.query("UPDATE users SET session_start = NOW() WHERE id = ?", [req.user.id]);
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "Erreur serveur." });
  }
});

// PUT /api/users/me — profil utilisateur connecté
router.put("/me", auth, async (req, res) => {
  try {
    const { nom, email, pays, adresse, tel, whatsapp, photo } = req.body;
    await db.query(
      "UPDATE users SET nom=?, email=?, pays=?, adresse=?, tel=?, whatsapp=?, photo=? WHERE id=?",
      [nom, email, pays, adresse, tel, whatsapp, photo, req.user.id]
    );
    res.json({ message: "Profil mis à jour." });
  } catch (e) {
    res.status(500).json({ error: "Erreur serveur." });
  }
});

// PUT /api/users/:id — admin modifie plan, statut et rang
router.put("/:id", adminAuth, async (req, res) => {
  try {
    const { plan, status, rank } = req.body;
    await db.query(
      "UPDATE users SET plan=?, status=?, `rank`=? WHERE id=?",
      [plan, status, rank || "free", req.params.id]
    );
    res.json({ message: "Utilisateur mis à jour." });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erreur serveur." });
  }
});

// DELETE /api/users/:id — admin
router.delete("/:id", adminAuth, async (req, res) => {
  try {
    await db.query("DELETE FROM users WHERE id=?", [req.params.id]);
    res.json({ message: "Utilisateur supprimé." });
  } catch (e) {
    res.status(500).json({ error: "Erreur serveur." });
  }
});

module.exports = router;