var express    = require("express");
var bodyParser = require("body-parser");
var router     = express.Router();
var db         = require("../connection");
var jsonParser = bodyParser.json();
const { v4: uuidv4 } = require("uuid");

function query(sql, params) {
  return new Promise((resolve, reject) =>
    db.query(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)))
  );
}

function adminOnly(req, res) {
  const roles = req.user?.["https://myapp.example.com/roles"] ?? [];
  if (!roles.includes("admin")) {
    res.status(403).json({ message: "Acesso negado" });
    return false;
  }
  return true;
}

async function resolveEvent(eventCode, res) {
  const rows = await query("SELECT idEvent FROM Events WHERE eventCode = ?", [eventCode]);
  if (!rows.length) { res.status(404).json({ message: "Evento não encontrado" }); return null; }
  return rows[0].idEvent;
}

// ── GET /api/impact-days ──────────────────────────────────────────────────────
router.get("/", async (req, res) => {
  const eventCode = req.headers["eventcode"];
  if (!eventCode) return res.status(400).json({ message: "Header 'eventCode' obrigatório" });
  try {
    const eventId = await resolveEvent(eventCode, res);
    if (!eventId) return;
    const rows = await query(
      "SELECT * FROM ImpactDays WHERE Events_idEvent = ? ORDER BY sortOrder, idDay",
      [eventId]
    );
    res.json(rows);
  } catch (err) {
    console.error("❌ GET /impact-days:", err.message);
    res.status(500).json({ message: "Erro interno" });
  }
});

// ── POST /api/impact-days ─────────────────────────────────────────────────────
router.post("/", jsonParser, async (req, res) => {
  if (!adminOnly(req, res)) return;
  const eventCode = req.headers["eventcode"];
  if (!eventCode) return res.status(400).json({ message: "Header 'eventCode' obrigatório" });
  const { label, sortOrder = 0 } = req.body;
  if (!label) return res.status(400).json({ message: "Campo 'label' obrigatório" });
  try {
    const eventId = await resolveEvent(eventCode, res);
    if (!eventId) return;
    const idDay = uuidv4();
    await query(
      "INSERT INTO ImpactDays (idDay, label, sortOrder, Events_idEvent) VALUES (?, ?, ?, ?)",
      [idDay, label, sortOrder, eventId]
    );
    res.status(201).json({ idDay, label, sortOrder, Events_idEvent: eventId });
  } catch (err) {
    console.error("❌ POST /impact-days:", err.message);
    res.status(500).json({ message: "Erro interno" });
  }
});

// ── PUT /api/impact-days/:id ──────────────────────────────────────────────────
router.put("/:id", jsonParser, async (req, res) => {
  if (!adminOnly(req, res)) return;
  const { label } = req.body;
  if (!label) return res.status(400).json({ message: "Campo 'label' obrigatório" });
  try {
    await query("UPDATE ImpactDays SET label = ? WHERE idDay = ?", [label, req.params.id]);
    res.json({ message: "Dia atualizado" });
  } catch (err) {
    console.error("❌ PUT /impact-days/:id:", err.message);
    res.status(500).json({ message: "Erro interno" });
  }
});

// ── DELETE /api/impact-days/:id ───────────────────────────────────────────────
// ON DELETE CASCADE em ImpactSlots cuida da limpeza automaticamente.
router.delete("/:id", async (req, res) => {
  if (!adminOnly(req, res)) return;
  try {
    await query("DELETE FROM ImpactDays WHERE idDay = ?", [req.params.id]);
    res.json({ message: "Dia removido" });
  } catch (err) {
    console.error("❌ DELETE /impact-days/:id:", err.message);
    res.status(500).json({ message: "Erro interno" });
  }
});

module.exports = router;
