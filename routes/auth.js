const router  = require("express").Router();
const bcrypt  = require("bcryptjs");
const jwt     = require("jsonwebtoken");
const db      = require("../db");

const sign = (user) =>
  jwt.sign(
    { id: user.id, email: user.email, role: user.role || "user", plan: user.plan, rank: user.rank || "free" },
    process.env.JWT_SECRET,
    { expiresIn: "30d" }
  );

// ── POST /api/auth/register ──
router.post("/register", async (req, res) => {
  try {
    const { nom, email, password, pays } = req.body;
    if (!nom || !email || !password) return res.status(400).json({ error: "Champs obligatoires manquants." });
    if (password.length < 8) return res.status(400).json({ error: "Mot de passe : 8 caractères minimum." });

    const [exist] = await db.query("SELECT id FROM users WHERE email = ?", [email]);
    if (exist.length) return res.status(409).json({ error: "Email déjà utilisé." });

    const hash = await bcrypt.hash(password, 10);
    const [result] = await db.query(
      "INSERT INTO users (nom, email, password, pays, plan, `rank`, status, joined) VALUES (?,?,?,?,?,?,?,CURDATE())",
      [nom, email, hash, pays || "CA", "free", "free", "actif"]
    );
    const user = { id: result.insertId, nom, email, pays: pays || "CA", plan: "free", rank: "free", status: "actif", role: "user" };
    res.status(201).json({ token: sign(user), user });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erreur serveur." });
  }
});

// ── POST /api/auth/login ──
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email et mot de passe requis." });

    // Admin hardcodé
    if (email === process.env.ADMIN_EMAIL && password === process.env.ADMIN_PASSWORD) {
      const admin = { id: 0, nom: "Admin", email, plan: "premium", rank: "gold", status: "actif", role: "admin" };
      return res.json({ token: sign(admin), user: admin });
    }

    const [rows] = await db.query("SELECT * FROM users WHERE email = ?", [email]);
    if (!rows.length) return res.status(401).json({ error: "Identifiants incorrects." });
    const u = rows[0];
    if (u.status === "suspendu") return res.status(403).json({ error: "Compte suspendu. Contactez le support." });

    const ok = await bcrypt.compare(password, u.password);
    if (!ok) return res.status(401).json({ error: "Identifiants incorrects." });

    await db.query("UPDATE users SET last_login = NOW() WHERE id = ?", [u.id]);
    const user = {
      id: u.id, nom: u.nom, email: u.email, pays: u.pays,
      plan: u.plan, rank: u.rank || "free", status: u.status, role: "user"
    };
    res.json({ token: sign(user), user });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erreur serveur." });
  }
});

// ── GET /api/auth/me ──
router.get("/me", require("../middleware/auth").auth, async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT id, nom, email, pays, plan, `rank`, status, photo, adresse, tel, whatsapp, joined, last_login FROM users WHERE id = ?",
      [req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: "Utilisateur introuvable." });
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: "Erreur serveur." });
  }
});

module.exports = router;