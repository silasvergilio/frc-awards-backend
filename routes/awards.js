var express = require("express");
var bodyParser = require("body-parser");
var router = express.Router();
var db = require("../connection");
const fileparser = require("../fileparser");
const multer = require("multer");

const { v4: uuidv4 } = require("uuid");

const { upload: s3Upload, signedUrl } = require("../lib/s3");
const socketManager = require("../lib/socket");

// Look up eventCode by Teams_idTeams (fire-and-forget socket helper)
function emitByTeam(teamId) {
  db.query(
    `SELECT e.eventCode FROM Teams t
     JOIN Events e ON e.idEvent = t.Events_idEvent
     WHERE t.idTeams = ? LIMIT 1`,
    [teamId],
    (err, rows) => {
      if (!err && rows?.[0]?.eventCode) {
        socketManager.emit(rows[0].eventCode, "awards:changed");
      }
    }
  );
}

function emitByAward(awardId) {
  db.query(
    `SELECT e.eventCode FROM Awards a
     JOIN Events e ON e.idEvent = a.Events_idEvent
     WHERE a.idAwards = ? LIMIT 1`,
    [awardId],
    (err, rows) => {
      if (!err && rows?.[0]?.eventCode) {
        socketManager.emit(rows[0].eventCode, "awards:changed");
      }
    }
  );
}

const fileFilter = (req, file, cb) => {
  if (file.mimetype === "image/jpeg" || file.mimetype === "image/png") {
    cb(null, true);
  } else {
    cb(new Error("Formato de imagem inválido"), false);
  }
};

const upload = multer({ storage: multer.memoryStorage(), fileFilter });

// create application/json parser
var jsonParser = bodyParser.json();

// /* GET teams listing. */
// router.get("/", function (req, res, next) {
//   // var paramsGetFiles = {
//   //   Bucket: process.env.BUCKETEER_BUCKET_NAME,
//   // };
//   // var myFilesData = [];
//   // s3.listObjects(paramsGetFiles, function (err, data) {
//   //   if (err) throw err;
//   //   myFilesData = data.Contents;

//     var sql =
//       "SELECT * FROM Awards WHERE ";
//     let values = [req.params.award, req.params.award, req.params.award];
//     db.query(sql, values, (err, result) => {
//       if (err) throw err;
//       // result.forEach((element) => {
//       //   imageFile = myFilesData.filter((file) => {
//       //     return (
//       //       file.Key.includes(element.value) &&
//       //       file.Key.includes(req.params.award)
//       //     );
//       //   });
//       //   if (imageFile.length > 0) {
//       //     console.log("Image File", imageFile);
//       //     element.imageLink = `https://bucketeer-bb581943-573c-48b1-8ec2-b31b1cc21958.s3.us-east-1.amazonaws.com/${element.value}-${req.params.award}`;
//       //   }
//       // });
//       res.send(result);
//     });
//   });
// //});

/* GET awards listing filtered by eventCode (from header) */
router.get("/", function (req, res, next) {
  const eventCode = req.headers.eventcode;

  if (!eventCode) {
    return res.status(400).json({ error: "Header 'eventCode' é obrigatório." });
  }

  // A query faz JOIN com Events para filtrar pelo código do evento
  const sql = `
    SELECT 
      a.*,
      t.value AS teamNumber,
      t.text AS teamName,
      t.school,
      t.state
    FROM Awards a
    JOIN Events e ON a.Events_idEvent = e.idEvent
    JOIN Teams t ON a.Teams_idTeams = t.idTeams
    WHERE e.eventCode = ?
    ORDER BY sort_order;
  `;

  const values = [eventCode];

  db.query(sql, values, (err, result) => {
    if (err) {
      console.error("Erro ao buscar prêmios:", err);
      return res.status(500).json({ error: "Erro interno ao buscar prêmios." });
    }

    // Replace stored S3 keys with presigned URLs so the frontend can display them
    const signed = result.map((row) => ({
      ...row,
      imagePath: row.imagePath ? signedUrl(row.imagePath) : null,
    }));

    res.json(signed);
  });
});


router.get("/non-nominated/teams", jsonParser, function (req, res) {
  const eventCode = req.headers.eventcode;

  const sql = `
    SELECT t.*
    FROM Teams t
    JOIN Events e ON e.idEvent = t.Events_idEvent
    LEFT JOIN Awards a
      ON a.Teams_idTeams = t.idTeams
      AND a.Events_idEvent = e.idEvent
    WHERE e.eventCode = ?
    AND a.idAwards IS NULL 
    ORDER BY CAST(value AS UNSIGNED)
  `;

  db.query(sql, [eventCode], (err, result) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: err });
    }

    res.json(result);
  });
});

router.put("/", jsonParser, function (req, res) {
  console.log("PUT")
  var sql = "UPDATE awards SET nominated = ? WHERE Teams_idTeams = ? AND awardName = ? ";
  var values = [req.body.nominated, req.body.id, req.body.award];

  db.query(sql, values, function (err, result) {
    if (err) throw err;
    console.log("1 record updated");
    emitByTeam(req.body.id);
    res.send("Inserted");
  });
});

router.put("/awarded", jsonParser, function (req, res) {
  var sql = "UPDATE awards SET awarded = ? WHERE Teams_idTeams = ? AND awardName = ? ";
  var sql2 = `UPDATE Awards SET nominated = ? WHERE Teams_idTeams = ? AND awardName <> ?`;
  var values = [req.body.awarded, req.body.id, req.body.award];
  var values2 = [!req.body.awarded, req.body.id, req.body.award];


  db.query(sql, values, function (err, result) {
    if (err) throw err;
    console.log("1 record updated");
  });

  db.query(sql2, values2, function (err, result) {
    if (err) throw err;
    console.log("1 record updated 2");
    emitByTeam(req.body.id);
    res.send("Inserted");
  });


});

router.put("/order", jsonParser, async function (req, res) {
  const updates = req.body.awards;
  console.log("updates", updates)

  try {
    const promises = updates.map(item => {
      return new Promise((resolve, reject) => {
        db.query(
          "UPDATE Awards SET `sort_order` = ? WHERE idAwards = ?",
          [item.order, item.id],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });
    });

    await Promise.all(promises);

    // Emit after all orders updated — look up eventCode from first award
    if (updates.length > 0) emitByAward(updates[0].id);

    res.json({ success: true });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error });
  }
});

router.patch("/:idAwards", jsonParser, function (req, res) {
  const { motive, awardName, judge, category } = req.body;
  const fields = [];
  const values = [];

  if (motive    !== undefined) { fields.push("motive = ?");    values.push(motive); }
  if (awardName !== undefined) { fields.push("awardName = ?"); values.push(awardName); }
  if (judge     !== undefined) { fields.push("judge = ?");     values.push(judge); }
  if (category  !== undefined) { fields.push("category = ?");  values.push(category); }

  if (fields.length === 0) {
    return res.status(400).json({ error: "Nothing to update" });
  }

  values.push(req.params.idAwards);

  db.query(
    `UPDATE Awards SET ${fields.join(", ")} WHERE idAwards = ?`,
    values,
    function (err) {
      if (err) {
        console.error("PATCH /awards/:id:", err);
        return res.status(500).json({ error: err.message });
      }
      emitByAward(req.params.idAwards);
      res.json({ success: true });
    }
  );
});

router.delete("/", jsonParser, function (req, res) {
  var sql = "DELETE FROM Awards WHERE Teams_idTeams = ? AND awardName = ? ";
  var values = [req.body.id, req.body.award];

  // Capture eventCode before deletion (row won't exist after)
  emitByTeam(req.body.id);

  db.query(sql, values, function (err, result) {
    if (err) throw err;
    console.log("1 record deleted");
    res.send("Deleted");
  });
});

//https://bucketeer-dd8b11fb-c2ce-40a9-84a9-db3c9d5a341c.s3.us-east-1.amazonaws.com/standard.png


router.post("/", upload.single("image"), async function (req, res) {
  const image   = req.file;
  const reqData = req.body;

  let imageKey = null;

  if (image) {
    const ext = (image.originalname.split(".").pop() || "jpg").toLowerCase();
    imageKey = `awards/${uuidv4()}.${ext}`;
    try {
      await s3Upload(imageKey, image.buffer, image.mimetype);
    } catch (err) {
      console.error("S3 upload error:", err);
      return res.status(500).json({ error: "Erro ao enviar imagem para S3." });
    }
  }

  const sql =
    "INSERT INTO Awards (idAwards,awardName,motive,nominated,judge,category,Teams_idTeams,Events_idEvent,imagePath) " +
    "VALUES (?,?,?,true,?,?,(SELECT idTeams FROM Teams WHERE value = ?),(SELECT idEvent FROM Events WHERE eventCode = ?),?)";
  const values = [
    uuidv4(), reqData.awardName, reqData.motive,
    reqData.judge, reqData.category, reqData.value,
    req.headers["eventcode"], imageKey,
  ];

  db.query(sql, values, function (err) {
    if (err) {
      console.error("DB insert error:", err);
      return res.status(500).json({ SqlError: err, errno: 1010, Status: 500 });
    }
    socketManager.emit(req.headers["eventcode"], "awards:changed");
    res.json({ success: true });
  });
});

module.exports = router;
