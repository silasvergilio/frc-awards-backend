var express = require("express");
var bodyParser = require("body-parser");
var router = express.Router();
var db = require("../connection");
const fileparser = require("../fileparser");
const multer = require("multer");

const { v4: uuidv4 } = require("uuid");


const storage = multer.memoryStorage();
const fileFilter = (req, file, cb) => {
  if (file.mimetype === "image/jpeg" || file.mimetype === "image/png") {
    cb(null, true);
  } else {
    cb(null, false);
  }
};

const AWS = require("aws-sdk");
const s3 = new AWS.S3({
  accessKeyId: process.env.BUCKETEER_AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.BUCKETEER_AWS_SECRET_ACCESS_KEY,
});

const upload = multer({ storage: storage, fileFilter: fileFilter });

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

    res.json(result);
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

    res.json({ success: true });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error });
  }
});

router.delete("/", jsonParser, function (req, res) {
  var sql = "DELETE FROM Awards WHERE Teams_idTeams = ? AND awardName = ? ";
  var values = [req.body.id, req.body.award];

  db.query(sql, values, function (err, result) {
    if (err) throw err;
    console.log("1 record deleted");
    res.send("Deleted");
  });
});

//https://bucketeer-dd8b11fb-c2ce-40a9-84a9-db3c9d5a341c.s3.us-east-1.amazonaws.com/standard.png


router.post("/", upload.single("file"), async function (req, res) {
  const file = req.file;
  console.log(req.body);
  const reqData = (req.body);
  console.log("Body", reqData);

  if (file) {
    const params = {
      Bucket: process.env.BUCKETEER_BUCKET_NAME,
      Key: `${reqData.value}-${req.params.award}`,
      Body: file.buffer,
      ContentType: file.mimetype,
    };

    try {
      await s3.upload(params).promise();
      console.log("File uploaded to S3 successfully!");
    } catch (error) {
      console.error(error);
    }
  }

  var sql =
    "INSERT INTO Awards (idAwards,awardName,motive,nominated,judge,category,Teams_idTeams, Events_idEvent) VALUES (?,?,?,true,?,?,(SELECT idTeams FROM Teams WHERE value = ?), (SELECT idEvent FROM Events WHERE eventCode = ?))";
  var values = [uuidv4(), reqData.awardName, reqData.motive, reqData.judge, reqData.category, reqData.value, req.headers["eventcode"]];
  console.log(values)
  db.query(sql, values, function (err, result) {
    if (err) {
      console.log(err);
      res.status(500).send({
        SqlError: err,
        errno: 1010,
        Status: 500,
      });
    } else {
      console.log("1 record inserted");
      res.send("Inserted");
    }
  });
});

module.exports = router;
