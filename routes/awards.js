var express = require("express");
var bodyParser = require("body-parser");
var router = express.Router();
var db = require("../connection");
const fileparser = require("../fileparser");
const multer = require("multer");

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

/* GET teams listing. */
router.get("/:award", function (req, res, next) {
  var paramsGetFiles = {
    Bucket: process.env.BUCKETEER_BUCKET_NAME,
  };
  var myFilesData = [];
  s3.listObjects(paramsGetFiles, function (err, data) {
    if (err) throw err;
    myFilesData = data.Contents;

    var sql =
      "SELECT * FROM Teams INNER JOIN ?? ON ??.Teams_idTime = Teams.idTime";
    let values = [req.params.award, req.params.award, req.params.award];
    db.query(sql, values, (err, result) => {
      if (err) throw err;
      result.forEach((element) => {
        imageFile = myFilesData.filter((file) => {
          return (
            file.Key.includes(element.value) &&
            file.Key.includes(req.params.award)
          );
        });
        if (imageFile.length > 0) {
          console.log("Image File", imageFile);
          element.imageLink = `https://bucketeer-bb581943-573c-48b1-8ec2-b31b1cc21958.s3.us-east-1.amazonaws.com/${element.value}-${req.params.award}`;
        }
      });
      res.send(result);
    });
  });
});

router.get("/non-nominated/teams", jsonParser, function (req, res) {
  var sql =
    "SELECT * FROM Teams t1 WHERE NOT EXISTS(SELECT NULL FROM Autonomous t2 WHERE t2.Teams_idTime = t1.idTime )" +
    " AND NOT EXISTS (SELECT NULL FROM Creativity t3 WHERE t3.Teams_idTime = t1.idTime)" +
    " AND NOT EXISTS (SELECT NULL FROM ExcellenceEngineering t4 WHERE t4.Teams_idTime = t1.idTime)" +
    " AND NOT EXISTS (SELECT NULL FROM IndustrialDesign t5 WHERE t5.Teams_idTime = t1.idTime)" +
    " AND NOT EXISTS (SELECT NULL FROM InnovationControl t6 WHERE t6.Teams_idTime = t1.idTime)" +
    " AND NOT EXISTS (SELECT NULL FROM Quality t7 WHERE t7.Teams_idTime = t1.idTime)" +
    " AND NOT EXISTS (SELECT NULL FROM EngineeringInspiration t8 WHERE t8.Teams_idTime = t1.idTime)" +
    " AND NOT EXISTS (SELECT NULL FROM RookieInspiration t9 WHERE t9.Teams_idTime = t1.idTime)" +
    " AND NOT EXISTS (SELECT NULL FROM Ras t10 WHERE t10.Teams_idTime = t1.idTime)" +
    " AND NOT EXISTS (SELECT NULL FROM TeamSustainability t11 WHERE t11.Teams_idTime = t1.idTime)" +
    " AND NOT EXISTS (SELECT NULL FROM Judges t12 WHERE t12.Teams_idTime = t1.idTime)" +
    " AND NOT EXISTS (SELECT NULL FROM Gracious t13 WHERE t13.Teams_idTime = t1.idTime)" +
    " AND NOT EXISTS (SELECT NULL FROM Imagery t14 WHERE t14.Teams_idTime = t1.idTime)" +
    " AND NOT EXISTS (SELECT NULL FROM TeamSpirit t15 WHERE t15.Teams_idTime = t1.idTime)";

  //var values = [req.params.award, req.body.id];

  db.query(sql, function (err, result) {
    if (err) throw err;
    console.log("RemainingTeams");
    res.send(result);
  });
});

router.put("/:award", jsonParser, function (req, res) {
  var sql = "UPDATE ?? SET nominated = ? WHERE Teams_idTime = ? ";
  var values = [req.params.award, req.body.nominated, req.body.id];

  db.query(sql, values, function (err, result) {
    if (err) throw err;
    console.log("1 record updated");
    res.send("Inserted");
  });
});

router.delete("/:award", jsonParser, function (req, res) {
  var sql = "DELETE FROM ?? WHERE Teams_idTime = ?";
  var values = [req.params.award, req.body.id];

  db.query(sql, values, function (err, result) {
    if (err) throw err;
    console.log("1 record deleted");
    res.send("Deleted");
  });
});

//https://bucketeer-dd8b11fb-c2ce-40a9-84a9-db3c9d5a341c.s3.us-east-1.amazonaws.com/standard.png


router.post("/:award", upload.single("file"), async function (req, res) {
  const file = req.file;
  console.log(req.body.bodyReq);
  const reqData = JSON.parse(req.body.bodyReq);
  console.log(reqData);

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
    "INSERT INTO ?? (motive,nominated,judge,Teams_idTime) VALUES (?,true,?,(SELECT idTime FROM Teams WHERE value = ?))";
  var values = [req.params.award, reqData.motive, reqData.judge, reqData.value];

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
