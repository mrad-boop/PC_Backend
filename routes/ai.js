const router  = require("express").Router();
const { auth } = require("../middleware/auth");
const mammoth  = require("mammoth");

const GROQ_API = "https://api.groq.com/openai/v1/chat/completions";
const MODEL    = "llama-3.1-8b-instant";

const callGroq = async (messages) => {
  const res = await fetch(GROQ_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({ model: MODEL, messages, max_tokens: 1500 }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Groq error: ${res.status} — ${err}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
};

const CV_PROMPT = `Analyse ce CV et extrais les informations en JSON strict (sans markdown, sans commentaire).
Retourne UNIQUEMENT ce JSON :
{"nom":"","prenom":"","email":"","telephone":"","adresse":"","titre":"","resume":"","competences":"","certifications":"","references":"","langues":[{"langue":"","niveau":""}],"experiences":[{"poste":"","entreprise":"","lieu":"","debutMois":"","debutAnnee":"","finMois":"","finAnnee":"","taches":[""]}],"formations":[{"diplome":"","etablissement":"","lieu":"","mois":"","annee":""}]}
Si un champ est absent, laisse-le vide. Pour les listes, inclus tous les elements trouves.`;

router.post("/parse-cv", auth, async (req, res) => {
  try {
    const { fileBase64, mimeType } = req.body;
    if (!fileBase64 || !mimeType) return res.status(400).json({ error: "fileBase64 et mimeType requis." });
    let text;
    const isWord = mimeType.includes("word") || mimeType.includes("officedocument");
    if (isWord) {
      const buf = Buffer.from(fileBase64, "base64");
      const result = await mammoth.extractRawText({ buffer: buf });
      text = result.value;
    } else if (mimeType === "application/pdf") {
      const pdfParse = require("pdf-parse");
      const buf = Buffer.from(fileBase64, "base64");
      const result = await pdfParse(buf);
      text = result.text;
    } else {
      return res.status(400).json({ error: "Format non supporte. PDF ou Word uniquement." });
    }
    const reply = await callGroq([
      { role: "system", content: "Tu es un extracteur de CV. Retourne uniquement du JSON valide." },
      { role: "user", content: `Voici le texte du CV:\n\n${text}\n\n${CV_PROMPT}` }
    ]);
    const parsed = JSON.parse(reply.replace(/```json|```/g, "").trim());
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
    const prompt = `Tu es un expert RH. Redige une lettre de motivation ${langue==="fr"?"en francais":"en anglais"} avec un ton ${ton}.
Candidat: ${user?.nom||""}, email: ${user?.email||""}, pays: ${user?.pays||""}
${cvText?`CV du candidat:\n${cvText}\n`:""}
Poste: ${poste}${entreprise?`, Entreprise: ${entreprise}`:""}
${descPoste?`Description du poste:\n${descPoste}`:""}
Instructions: 3-4 paragraphes. Reponds UNIQUEMENT avec la lettre, sans commentaire.`;
    const lettre = await callGroq([
      { role: "system", content: "Tu es un expert RH specialise dans l'immigration canadienne." },
      { role: "user", content: prompt }
    ]);
    res.json({ lettre });
  } catch (e) {
    console.error("lettre error:", e.message);
    res.status(500).json({ error: "Erreur generation lettre." });
  }
});

module.exports = router;
