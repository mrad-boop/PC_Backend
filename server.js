require("dotenv").config();
const express = require("express");
const cors    = require("cors");
const db      = require("./db");

const app = express();

// ── Middlewares ──
app.use(cors({
  origin: [
    process.env.FRONTEND_URL || "http://localhost:5173",
    "https://passeport-carriere-tkj9dx0zj-mrad-boops-projects.vercel.app",
    "https://passeport-carriere.vercel.app",
    "http://localhost:5173",
    "http://localhost:3000",
  ],
  credentials: true,
}));
app.use(express.json({ limit: "20mb" })); // 20mb pour les images base64

// ── Routes ──
app.use("/api/auth",     require("./routes/auth"));
app.use("/api/series",   require("./routes/series"));
app.use("/api/attempts", require("./routes/attempts"));
app.use("/api/users",    require("./routes/users"));
app.use("/api/packs",    require("./routes/packs"));

// Route config séparée
const packsRouter = require("./routes/packs");
app.get( "/api/config",     (req, res, next) => { req.url = "/config"; packsRouter(req, res, next); });
app.put( "/api/config",     (req, res, next) => { req.url = "/config"; packsRouter(req, res, next); });

// ── Health check ──
app.get("/", (req, res) => res.json({ status: "ok", app: "Passeport Carrière API", version: "1.0.0" }));
app.get("/health", (req, res) => res.json({ status: "ok" }));

// ── Démarrage ──
const PORT = process.env.PORT || 3000;

db.query("SELECT 1")
  .then(() => {
    console.log("✅ MySQL connecté");
    app.listen(PORT, () => console.log(`🚀 Serveur démarré sur le port ${PORT}`));
  })
  .catch(err => {
    console.error("❌ Erreur MySQL :", err.message);
    process.exit(1);
  });
