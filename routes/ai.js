const router  = require("express").Router();
const { auth } = require("../middleware/auth");
const mammoth  = require("mammoth");

const GEMINI_API = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent";

const callGemini = async (parts) => {
  const url = `${GEMINI_API}?key=${process.env.GEMINI_API_KEY}`;
  const res  = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts }] }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API error: ${res.status} — ${err}`);
  }
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
};

const CV_PROMPT = `Analyse ce CV et extrais les informations en JSON strict (sans markdown, sans commentaire).
Retourne UNIQUEMENT ce JSON :
{"nom":"","prenom":"","email":"","telephone":"","adresse":"","titre":"","resume":"","competences":"","certifications":"","references":"","langues":[{"langue":"","niveau":""}],"experiences":[{"poste":"","entreprise":"","lieu":"","debutMois":"","debutAnnee":"","finMois":"","finAnnee":"","taches":[""]}],"formations":[{"diplome":"","etablissement":"","lieu":"","mois":"","annee":""}]}
Si un champ est absent, laisse-le vide.`;

router.post("/parse-cv", auth, async (req, res) => {
  try {
    const { fileBase64, mimeType } = req.body;
    if (!fileBase64 || !mimeType) return res.status(400).json({ error: "fileBase64 et mimeType requis." });
    let parts;
    const isWord = mimeType.includes("word") || mimeType.includes("officedocument");
    if (isWord) {
      const buf = Buffer.from(fileBase64, "base64");
      const result = await mammoth.extractRawText({ buffer: buf });
      parts = [{ text: `CV:\n\n${result.value}\n\n${CV_PROMPT}` }];
    } else if (mimeType === "application/pdf") {
      parts = [{ inline_data: { mime_type: "application/pdf", data: fileBase64 } }, { text: CV_PROMPT }];
    } else if (mimeType.startsWith("image/")) {
      parts = [{ inline_data: { mime_type: mimeType, data: fileBase64 } }, { text: CV_PROMPT }];
    } else {
      return res.status(400).json({ error: "Format non supporté." });
    }
    const text = await callGemini(parts);
    const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
    res.json(parsed);
  } catch (e) {
    console.error("parse-cv error:", e.message);
    res.status(500).json({ error: "Erreur lors de l'analyse du CV." });
  }
});

router.post("/lettre", auth, async (req, res) => {
  try {
    const { poste, entreprise, descPoste, cvText, ton, langue, user } = req.body;
    if (!poste?.trim()) return res.status(400).json({ error: "Poste obligatoire." });
    const prompt = `Rédige une lettre de motivation ${langue==="fr"?"en français":"en anglais"} ton ${ton}.
Candidat: ${user?.nom||""}, ${user?.email||""}, pays: ${user?.pays||""}
${cvText?`CV:\n${cvText}`:""}
Poste: ${poste}${entreprise?`, Entreprise: ${entreprise}`:""}
${descPoste?`Description poste:\n${descPoste}`:""}
3-4 paragraphes. Réponds UNIQUEMENT avec la lettre.`;
    const lettre = await callGemini([{ text: prompt }]);
    res.json({ lettre });
  } catch (e) {
    console.error("lettre error:", e.message);
    res.status(500).json({ error: "Erreur génération lettre." });
  }
});

module.exports = router;
