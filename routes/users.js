const router = require("express").Router();
const db     = require("../db");
const { auth, adminAuth } = require("../middleware/auth");

// ── GET /api/users ── (admin — liste complète)
router.get("/", adminAuth, async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT id, nom, email, pays, plan, status, joined, last_login FROM users ORDER BY joined DESC"
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: "Erreur serveur." });
  }
});

// ── PUT /api/users/me ── (profil — utilisateur connecté)
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

// ── PUT /api/users/:id ── (admin — modifier plan/statut)
router.put("/:id", adminAuth, async (req, res) => {
  try {
    const { plan, status } = req.body;
    await db.query("UPDATE users SET plan=?, status=? WHERE id=?", [plan, status, req.params.id]);
    res.json({ message: "Utilisateur mis à jour." });
  } catch (e) {
    res.status(500).json({ error: "Erreur serveur." });
  }
});

// ── DELETE /api/users/:id ── (admin)
router.delete("/:id", adminAuth, async (req, res) => {
  try {
    await db.query("DELETE FROM users WHERE id=?", [req.params.id]);
    res.json({ message: "Utilisateur supprimé." });
  } catch (e) {
    res.status(500).json({ error: "Erreur serveur." });
  }
});

module.exports = router;
