var express = require("express");
var bodyParser = require("body-parser");
var router = express.Router();
var db = require("../connection");
const multer = require("multer");

const { upload: s3Upload, signedUrl } = require("../lib/s3");

const fileFilter = (req, file, cb) => {
  if (file.mimetype === "image/jpeg" || file.mimetype === "image/png") {
    cb(null, true);
  } else {
    cb(null, false);
  }
};

const upload = multer({ storage: multer.memoryStorage(), fileFilter });

// create application/json parser
var jsonParser = bodyParser.json();

const axios = require("axios");

const auth = Buffer.from(
  "silasvergiliobrazil:9c6795b5-e647-4a8e-b39b-be3d0c06729e"
).toString("base64");
const instance = axios.create({
  baseURL: "https://frc-api.firstinspires.org/v3.0",
  timeout: 3000,
  headers: {
    Authorization: `Basic ${auth}`,
  },
});

// /* GET teams listing. */
// router.get("/", function (req, res, next) {
//   // var paramsGetFiles = {
//   //   Bucket: process.env.BUCKETEER_BUCKET_NAME,
//   // };
//   var myFilesData = [];
//   // s3.listObjects(paramsGetFiles, function (err, data) {
//   //   if (err) throw err;
//   //   myFilesData = data.Contents;

//     //console.log(req.user());
//     var sql = "SELECT * FROM Teams ORDER BY Teams.value ASC";
//     db.query(sql, (err, result) => {
//       if(req.query.image != "true"){ //TODO CORRECT LOGIC
//       result.forEach((element) => {
//         imageFile = myFilesData.filter((file) => {
//           return (
//             file.Key.includes(element.value) && file.Key.includes("picture")
//           );
//         });
//         if (imageFile.length > 0) {
//           console.log("Image File", imageFile);
//           element.imageLink = `https://bucketeer-bb581943-573c-48b1-8ec2-b31b1cc21958.s3.us-east-1.amazonaws.com/${element.value}-picture`;
//         }
//       });}
//       if (err) throw err;
//       res.send(result);
//     });
//   });

/* GET teams listing by eventCode (from header) */
router.get("/", function (req, res, next) {
  const eventCode = req.headers["eventcode"]; // header precisa ser "eventCode"

  if (!eventCode) {
    console.log("NO event code")
    return res.status(400).json({ message: "Header 'eventCode' é obrigatório" });
  }

  // 🔹 1. Buscar o id do evento pelo eventCode
  const sqlEvent = "SELECT idEvent FROM Events WHERE eventCode = ?";
  db.query(sqlEvent, [eventCode], (err, eventResult) => {
    if (err) {
      console.error("Erro ao buscar evento:", err);
      return res.status(500).json({ message: "Erro ao buscar evento" });
    }

    if (eventResult.length === 0) {
      return res.status(404).json({ message: "Evento não encontrado" });
    }

    console.log(eventResult[0].idEvent);
    const eventId = eventResult[0].idEvent;

    // 🔹 2. Buscar todos os times relacionados a esse evento
    const sqlTeams = "SELECT * FROM Teams WHERE Events_idEvent = ? ORDER BY CAST(value AS UNSIGNED)";
    db.query(sqlTeams, [eventId], (err, teamsResult) => {
      if (err) {
        console.error("Erro ao buscar times:", err);
        return res.status(500).json({ message: "Erro ao buscar times" });
      }

      // Replace stored S3 keys with presigned URLs
      const signed = teamsResult.map((team) => ({
        ...team,
        imageLink: team.imageLink ? signedUrl(team.imageLink) : null,
      }));

      res.json(signed);
    });
  });
});

/* GET teams listing by teamNumber. */
router.get("/:value", function (req, res, next) {
  var sql = "SELECT * FROM Teams WHERE value = ?";
  var values = [req.params.value];
  db.query(sql, values, (err, result) => {
    if (err) throw err;
    res.send(result);
  });
});

/* GET teams listing by teamNumber. */
router.put("/:value", jsonParser, function (req, res, next) {
  var sql = "UPDATE Teams SET ?? = ? WHERE value = ?";
  var values = [req.body.visit, req.body.newValue, req.params.value];
  db.query(sql, values, (err, result) => {
    if (err) throw err;
    res.send(result);
  });
});

router.post("/picture", upload.single("file"), async function (req, res) {
  const file    = req.file;
  const reqData = JSON.parse(req.body.bodyReq);

  if (!file) {
    return res.status(400).json({ message: "Nenhuma imagem enviada." });
  }

  const imageKey = `${reqData.value}-picture`;

  try {
    await s3Upload(imageKey, file.buffer, file.mimetype);

    // Persist the S3 key so GET /teams can sign it later — respond INSIDE the callback
    db.query(
      "UPDATE Teams SET imageLink = ? WHERE value = ?",
      [imageKey, reqData.value],
      (err) => {
        if (err) {
          console.error("Failed to save imageLink:", err);
          return res.status(500).json({ message: "Erro ao salvar referência da imagem." });
        }
        res.json({ message: "Foto adicionada com sucesso." });
      }
    );
  } catch (error) {
    console.error("S3 upload error:", error);
    res.status(500).json({ message: "Erro ao adicionar a foto." });
  }
});

router.post("/", jsonParser, function (req, res) {
  if (req.query.bulk == "true") {
    var count = 0;
    console.log("Bulk initiating");
    instance
      .get("2025/teams", {
        params: {
          eventCode: "RSPOR",
        },
      })
      .then(function (response) {
        console.log("Sucesso", response.data.teams);
        response.data.teams.forEach((element) => {
          var sql =
            "INSERT IGNORE INTO Teams (state,text,value,school, visitedMCI, visitedTA, visitedExtra) VALUES (?,?,?,?,false,false,false)";
          var values = [
            element.stateProv,
            element.nameShort,
            element.teamNumber,
            element.schoolName,
          ];

          db.query(sql, values, function (err, result) {
            if (err) throw err;
            count++;
            console.log("1 record inserted");
          });
        });
      })
      .catch(function (error) {
        console.log("Erro", error);
        res.sendStatus(500);
      })
      .finally(function () {
        res.send({
          count: count,
        });
      });
  } else {
    var sql =
      "INSERT INTO Teams (state,text,value,school, visitedMCI, visitedTA, visitedExtra) VALUES (?,?,?,?,false,false,false)";
    var values = [
      req.body.state,
      req.body.text,
      req.body.value,
      req.body.school,
    ];

    db.query(sql, values, function (err, result) {
      if (err) throw err;
      // console.log("1 record inserted");
    });
    res.send(req.body.state);
  }
});

module.exports = router;
