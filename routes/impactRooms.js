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

// ── GET /api/impact-rooms ─────────────────────────────────────────────────────
router.get("/", async (req, res) => {
  const eventCode = req.headers["eventcode"];
  if (!eventCode) return res.status(400).json({ message: "Header 'eventCode' obrigatório" });
  try {
    const eventId = await resolveEvent(eventCode, res);
    if (!eventId) return;
    const rows = await query(
      "SELECT * FROM ImpactRooms WHERE Events_idEvent = ? ORDER BY sortOrder, idRoom",
      [eventId]
    );
    res.json(rows);
  } catch (err) {
    console.error("❌ GET /impact-rooms:", err.message);
    res.status(500).json({ message: "Erro interno" });
  }
});

// ── POST /api/impact-rooms ────────────────────────────────────────────────────
router.post("/", jsonParser, async (req, res) => {
  if (!adminOnly(req, res)) return;
  const eventCode = req.headers["eventcode"];
  if (!eventCode) return res.status(400).json({ message: "Header 'eventCode' obrigatório" });
  const { name, sortOrder = 0 } = req.body;
  if (!name) return res.status(400).json({ message: "Campo 'name' obrigatório" });
  try {
    const eventId = await resolveEvent(eventCode, res);
    if (!eventId) return;
    const idRoom = uuidv4();
    await query(
      "INSERT INTO ImpactRooms (idRoom, name, sortOrder, Events_idEvent) VALUES (?, ?, ?, ?)",
      [idRoom, name, sortOrder, eventId]
    );
    res.status(201).json({ idRoom, name, sortOrder, Events_idEvent: eventId });
  } catch (err) {
    console.error("❌ POST /impact-rooms:", err.message);
    res.status(500).json({ message: "Erro interno" });
  }
});

// ── PUT /api/impact-rooms/:id ─────────────────────────────────────────────────
router.put("/:id", jsonParser, async (req, res) => {
  if (!adminOnly(req, res)) return;
  const { name } = req.body;
  if (!name) return res.status(400).json({ message: "Campo 'name' obrigatório" });
  try {
    await query("UPDATE ImpactRooms SET name = ? WHERE idRoom = ?", [name, req.params.id]);
    res.json({ message: "Sala atualizada" });
  } catch (err) {
    console.error("❌ PUT /impact-rooms/:id:", err.message);
    res.status(500).json({ message: "Erro interno" });
  }
});

// ── DELETE /api/impact-rooms/:id ──────────────────────────────────────────────
// ON DELETE CASCADE em ImpactSlots cuida da limpeza automaticamente.
router.delete("/:id", async (req, res) => {
  if (!adminOnly(req, res)) return;
  try {
    await query("DELETE FROM ImpactRooms WHERE idRoom = ?", [req.params.id]);
    res.json({ message: "Sala removida" });
  } catch (err) {
    console.error("❌ DELETE /impact-rooms/:id:", err.message);
    res.status(500).json({ message: "Erro interno" });
  }
});

module.exports = router;
