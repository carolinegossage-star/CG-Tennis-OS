const AWS = require('aws-sdk');
const logger = require('../utils/logger');

// ─── Cloudflare R2 Configuration ───────────────────────────────────────────────
const s3 = new AWS.S3({
  accessKeyId: process.env.R2_ACCESS_KEY_ID,
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  endpoint: process.env.R2_ENDPOINT,
  s3ForcePathStyle: true,
  signatureVersion: 'v4',
  region: 'auto',
});

const R2_BUCKET = process.env.R2_BUCKET_NAME || 'tennis-coaching-os';

// ─── Upload File to R2 ─────────────────────────────────────────────────────────
async function uploadFile(fileBuffer, fileName, mimeType) {
  try {
    const params = {
      Bucket: R2_BUCKET,
      Key: `${Date.now()}-${fileName}`,
      Body: fileBuffer,
      ContentType: mimeType,
      ACL: 'public-read',
    };

    const result = await s3.upload(params).promise();
    logger.info('File uploaded to R2', { key: result.Key, size: fileBuffer.length });

    return {
      url: result.Location,
      key: result.Key,
      size: fileBuffer.length,
    };
  } catch (err) {
    logger.error('R2 upload failed', { error: err.message, fileName });
    throw new Error(`Failed to upload file to R2: ${err.message}`);
  }
}

// ─── Delete File from R2 ───────────────────────────────────────────────────────
async function deleteFile(fileKey) {
  try {
    const params = {
      Bucket: R2_BUCKET,
      Key: fileKey,
    };

    await s3.deleteObject(params).promise();
    logger.info('File deleted from R2', { key: fileKey });
  } catch (err) {
    logger.error('R2 delete failed', { error: err.message, fileKey });
    throw new Error(`Failed to delete file from R2: ${err.message}`);
  }
}

// ─── Generate Signed URL for Temporary Access ──────────────────────────────────
async function getSignedUrl(fileKey, expiresIn = 3600) {
  try {
    const params = {
      Bucket: R2_BUCKET,
      Key: fileKey,
      Expires: expiresIn,
    };

    const url = await s3.getSignedUrlPromise('getObject', params);
    return url;
  } catch (err) {
    logger.error('R2 signed URL generation failed', { error: err.message, fileKey });
    throw new Error(`Failed to generate signed URL: ${err.message}`);
  }
}

module.exports = {
  uploadFile,
  deleteFile,
  getSignedUrl,
};
