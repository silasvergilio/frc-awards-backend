const AWS = require("aws-sdk");

const s3 = new AWS.S3({
  accessKeyId:     process.env.BUCKETEER_AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.BUCKETEER_AWS_SECRET_ACCESS_KEY,
  region:          process.env.BUCKETEER_AWS_REGION || "us-east-1",
});

/**
 * Upload a buffer to S3.
 * @param {string} key - S3 object key (e.g. "awards/uuid.jpg")
 * @param {Buffer} body
 * @param {string} contentType
 */
async function upload(key, body, contentType) {
  await s3
    .upload({
      Bucket:      process.env.BUCKETEER_BUCKET_NAME,
      Key:         key,
      Body:        body,
      ContentType: contentType,
    })
    .promise();
}

/**
 * Generate a presigned GET URL (valid for 1 hour).
 * Returns null if key is falsy.
 * @param {string|null} key
 */
function signedUrl(key) {
  if (!key) return null;
  return s3.getSignedUrl("getObject", {
    Bucket:  process.env.BUCKETEER_BUCKET_NAME,
    Key:     key,
    Expires: 3600,
  });
}

module.exports = { s3, upload, signedUrl };
