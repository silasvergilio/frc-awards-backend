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

// ── GET /api/impact-slots?dayId=&roomId= ─────────────────────────────────────
// dayId e roomId são obrigatórios para filtrar por dia × sala.
router.get("/", async (req, res) => {
  const eventCode = req.headers["eventcode"];
  if (!eventCode) return res.status(400).json({ message: "Header 'eventCode' obrigatório" });
  const { dayId, roomId } = req.query;
  if (!dayId || !roomId) return res.status(400).json({ message: "Query params 'dayId' e 'roomId' obrigatórios" });
  try {
    const eventId = await resolveEvent(eventCode, res);
    if (!eventId) return;
    const rows = await query(
      `SELECT * FROM ImpactSlots
       WHERE ImpactDays_idDay = ? AND ImpactRooms_idRoom = ? AND Events_idEvent = ?
       ORDER BY sortOrder, idSlot`,
      [dayId, roomId, eventId]
    );
    res.json(rows);
  } catch (err) {
    console.error("❌ GET /impact-slots:", err.message);
    res.status(500).json({ message: "Erro interno" });
  }
});

// ── POST /api/impact-slots ────────────────────────────────────────────────────
router.post("/", jsonParser, async (req, res) => {
  if (!adminOnly(req, res)) return;
  const eventCode = req.headers["eventcode"];
  if (!eventCode) return res.status(400).json({ message: "Header 'eventCode' obrigatório" });

  const {
    slotTime,
    slotType = "team",
    teamNumber = null,
    teamName   = null,
    Teams_idTeams = null,
    dayId,
    roomId,
    sortOrder = 0,
  } = req.body;

  if (!slotTime) return res.status(400).json({ message: "Campo 'slotTime' obrigatório" });
  if (!dayId)    return res.status(400).json({ message: "Campo 'dayId' obrigatório" });
  if (!roomId)   return res.status(400).json({ message: "Campo 'roomId' obrigatório" });
  if (!["team", "lunch", "break"].includes(slotType))
    return res.status(400).json({ message: "slotType deve ser 'team', 'lunch' ou 'break'" });

  try {
    const eventId = await resolveEvent(eventCode, res);
    if (!eventId) return;
    const idSlot = uuidv4();
    await query(
      `INSERT INTO ImpactSlots
         (idSlot, slotTime, slotType, teamNumber, teamName, Teams_idTeams,
          ImpactDays_idDay, ImpactRooms_idRoom, sortOrder, Events_idEvent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [idSlot, slotTime, slotType, teamNumber, teamName, Teams_idTeams,
       dayId, roomId, sortOrder, eventId]
    );
    res.status(201).json({
      idSlot, slotTime, slotType, teamNumber, teamName, Teams_idTeams,
      ImpactDays_idDay: dayId, ImpactRooms_idRoom: roomId, sortOrder,
      Events_idEvent: eventId,
    });
  } catch (err) {
    console.error("❌ POST /impact-slots:", err.message);
    res.status(500).json({ message: "Erro interno" });
  }
});

// ── PUT /api/impact-slots/:id ─────────────────────────────────────────────────
router.put("/:id", jsonParser, async (req, res) => {
  if (!adminOnly(req, res)) return;
  const {
    slotTime,
    slotType,
    teamNumber = null,
    teamName   = null,
    Teams_idTeams = null,
  } = req.body;
  try {
    await query(
      `UPDATE ImpactSlots
       SET slotTime = ?, slotType = ?, teamNumber = ?, teamName = ?, Teams_idTeams = ?
       WHERE idSlot = ?`,
      [slotTime, slotType, teamNumber, teamName, Teams_idTeams, req.params.id]
    );
    res.json({ message: "Slot atualizado" });
  } catch (err) {
    console.error("❌ PUT /impact-slots/:id:", err.message);
    res.status(500).json({ message: "Erro interno" });
  }
});

// ── DELETE /api/impact-slots/:id ──────────────────────────────────────────────
router.delete("/:id", async (req, res) => {
  if (!adminOnly(req, res)) return;
  try {
    await query("DELETE FROM ImpactSlots WHERE idSlot = ?", [req.params.id]);
    res.json({ message: "Slot removido" });
  } catch (err) {
    console.error("❌ DELETE /impact-slots/:id:", err.message);
    res.status(500).json({ message: "Erro interno" });
  }
});

module.exports = router;
