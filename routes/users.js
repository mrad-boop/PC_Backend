const router = require("express").Router();
const db     = require("../db");
const { auth, adminAuth } = require("../middleware/auth");

// Ajouter colonne rank si elle n'existe pas
db.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS `rank` VARCHAR(20) DEFAULT 'free'").catch(()=>{});

// GET /api/users — liste complète (admin)
router.get("/", adminAuth, async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT id, nom, email, pays, plan, `rank`, status, joined, last_login FROM users ORDER BY joined DESC"
    );
    // Joindre cv_count depuis cv_profiles
    const [cvRows] = await db.query("SELECT user_id, cv_count FROM cv_profiles");
    const cvMap = {};
    cvRows.forEach(r => { cvMap[r.user_id] = r.cv_count; });
    const result = rows.map(u => ({ ...u, cv_count: cvMap[u.id] || 0 }));
    res.json(result);
  } catch (e) {
    console.error(e);
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