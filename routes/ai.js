const router  = require("express").Router();
const { auth } = require("../middleware/auth");
const mammoth  = require("mammoth");

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-20250514";

const callClaude = async (messages, max_tokens = 1000) => {
  const res = await fetch(ANTHROPIC_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({ model: MODEL, max_tokens, messages }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude API error: ${res.status} — ${err}`);
  }
  const data = await res.json();
  return data.content?.find(b => b.type === "text")?.text || "";
};

const CV_PROMPT = `Analyse ce CV et extrais les informations en JSON strict (sans markdown, sans commentaire).
Retourne UNIQUEMENT ce JSON :
{
  "nom": "",
  "prenom": "",
  "email": "",
  "telephone": "",
  "adresse": "",
  "titre": "",
  "resume": "",
  "competences": "",
  "certifications": "",
  "references": "",
  "langues": [{"langue":"","niveau":""}],
  "experiences": [{"poste":"","entreprise":"","lieu":"","debutMois":"","debutAnnee":"","finMois":"","finAnnee":"","taches":[""]}],
  "formations": [{"diplome":"","etablissement":"","lieu":"","mois":"","annee":""}]
}
Si un champ est absent, laisse-le vide. Pour les listes, inclus tous les éléments trouvés.`;

// ── POST /api/ai/parse-cv ──
router.post("/parse-cv", auth, async (req, res) => {
  try {
    const { fileBase64, mimeType } = req.body;
    if (!fileBase64 || !mimeType) return res.status(400).json({ error: "fileBase64 et mimeType requis." });

    let content;
    const isWord = mimeType.includes("word") || mimeType.includes("officedocument");

    if (isWord) {
      // Extraire texte du fichier Word
      const buf    = Buffer.from(fileBase64, "base64");
      const result = await mammoth.extractRawText({ buffer: buf });
      content = [{ type: "text", text: `Voici le texte d'un CV:\n\n${result.value}\n\n${CV_PROMPT}` }];
    } else if (mimeType === "application/pdf") {
      content = [
        { type: "document", source: { type: "base64", media_type: "application/pdf", data: fileBase64 } },
        { type: "text", text: CV_PROMPT }
      ];
    } else if (mimeType.startsWith("image/")) {
      content = [
        { type: "image", source: { type: "base64", media_type: mimeType, data: fileBase64 } },
        { type: "text", text: CV_PROMPT }
      ];
    } else {
      return res.status(400).json({ error: "Format non supporté. Utilisez PDF, Word ou image." });
    }

    const text   = await callClaude([{ role: "user", content }], 1200);
    const clean  = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);
    res.json(parsed);
  } catch (e) {
    console.error("POST /api/ai/parse-cv error:", e.message);
    res.status(500).json({ error: "Erreur lors de l'analyse du CV." });
  }
});

// ── POST /api/ai/lettre ──
router.post("/lettre", auth, async (req, res) => {
  try {
    const { poste, entreprise, ton, langue, user } = req.body;
    if (!poste?.trim()) return res.status(400).json({ error: "Le poste est obligatoire." });

    const prompt = `Tu es un expert RH francophone spécialisé dans l'immigration canadienne.
Rédige une lettre de motivation ${langue === "fr" ? "en français" : "en anglais"} avec un ton ${ton}.

Candidat :
- Nom : ${user?.nom || "Non précisé"}
- Email : ${user?.email || "Non précisé"}
- Pays d'origine : ${user?.pays || "Non précisé"}

Poste visé : ${poste}
${entreprise ? `Entreprise : ${entreprise}` : ""}

Contraintes :
- 3-4 paragraphes maximum
- Mentionne le parcours d'immigration/relocalisation au Canada si pertinent
- Termine par une formule de politesse adaptée au ton
- Réponds UNIQUEMENT avec la lettre, sans aucun commentaire ni markdown`;

    const lettre = await callClaude([{ role: "user", content: prompt }], 1000);
    res.json({ lettre });
  } catch (e) {
    console.error("POST /api/ai/lettre error:", e.message);
    res.status(500).json({ error: "Erreur lors de la génération de la lettre." });
  }
});

module.exports = router;
