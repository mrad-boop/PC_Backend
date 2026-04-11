const router = require("express").Router();
const db     = require("../db");
const { adminAuth } = require("../middleware/auth");

// ── GET /api/packs ── (public)
router.get("/", async (req, res) => {
  try {
    const [rows] = await db.query("SELECT * FROM packs ORDER BY sort_order");
    const packs = rows.map(p => ({
      ...p,
      features:  JSON.parse(p.features  || "[]"),
      highlight: !!p.highlight,
    }));
    res.json(packs);
  } catch (e) {
    res.status(500).json({ error: "Erreur serveur." });
  }
});

// ── PUT /api/packs/:id ── (admin)
router.put("/:id", adminAuth, async (req, res) => {
  try {
    const { name, price, acces, color, ribbon, highlight, bonus, features } = req.body;
    await db.query(
      "UPDATE packs SET name=?, price=?, acces=?, color=?, ribbon=?, highlight=?, bonus=?, features=? WHERE id=?",
      [name, price, acces, color, ribbon, highlight ? 1 : 0, bonus, JSON.stringify(features || []), req.params.id]
    );
    res.json({ message: "Pack mis à jour." });
  } catch (e) {
    res.status(500).json({ error: "Erreur serveur." });
  }
});

// ── GET /api/config ── (public — config landing)
router.get("/config", async (req, res) => {
  try {
    const [rows] = await db.query("SELECT cle, valeur FROM site_config");
    const config = {};
    rows.forEach(r => { config[r.cle] = r.valeur; });
    res.json(config);
  } catch (e) {
    res.status(500).json({ error: "Erreur serveur." });
  }
});

// ── PUT /api/config ── (admin — mettre à jour une clé)
router.put("/config", adminAuth, async (req, res) => {
  try {
    const entries = Object.entries(req.body);
    for (const [cle, valeur] of entries) {
      await db.query(
        "INSERT INTO site_config (cle, valeur) VALUES (?,?) ON DUPLICATE KEY UPDATE valeur=VALUES(valeur)",
        [cle, valeur]
      );
    }
    res.json({ message: "Configuration mise à jour." });
  } catch (e) {
    res.status(500).json({ error: "Erreur serveur." });
  }
});

module.exports = router;
