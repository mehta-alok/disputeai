/**
 * AccuDefend System
 * AWS S3 Configuration (Evidence Storage)
 */

// Lazy-load AWS SDK to avoid hanging on import with newer Node.js versions
let _s3sdk, _presigner, _uuid;
function loadDeps() {
  if (!_s3sdk) {
    try {
      _s3sdk = require('@aws-sdk/client-s3');
      _presigner = require('@aws-sdk/s3-request-presigner');
      _uuid = require('uuid');
    } catch (e) {
      // Provide stubs when AWS SDK is unavailable
      _s3sdk = { S3Client: class {}, PutObjectCommand: class {}, GetObjectCommand: class {}, DeleteObjectCommand: class {}, HeadObjectCommand: class {} };
      _presigner = { getSignedUrl: async () => null };
      _uuid = { v4: () => 'mock-uuid' };
    }
  }
}
const logger = require('../utils/logger');

let s3Client;

/**
 * Initialize S3 client
 */
function getS3Client() {
  loadDeps();
  if (!s3Client) {
    s3Client = new _s3sdk.S3Client({
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
      }
    });
  }
  return s3Client;
}

/**
 * Initialize and verify S3 connection
 */
async function initializeS3() {
  try {
    const client = getS3Client();
    const bucket = process.env.AWS_S3_BUCKET;

    if (!bucket) {
      logger.warn('AWS_S3_BUCKET not configured, S3 features disabled');
      return null;
    }

    logger.info(`AccuDefend: S3 initialized for bucket ${bucket}`);
    return client;
  } catch (error) {
    logger.error('S3 initialization failed:', error);
    throw error;
  }
}

/**
 * Generate S3 key for evidence files
 * Format: chargebacks/{chargebackId}/{evidenceType}/{timestamp}-{uuid}-{filename}
 */
function generateS3Key(chargebackId, evidenceType, originalFilename) {
  loadDeps();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const uniqueId = _uuid.v4().substring(0, 8);
  const sanitizedFilename = originalFilename.replace(/[^a-zA-Z0-9.-]/g, '_');

  return `chargebacks/${chargebackId}/${evidenceType}/${timestamp}-${uniqueId}-${sanitizedFilename}`;
}

/**
 * Upload file to S3
 */
async function uploadFile(buffer, key, contentType) {
  const client = getS3Client();
  const bucket = process.env.AWS_S3_BUCKET;

  const command = new _s3sdk.PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: buffer,
    ContentType: contentType,
    ServerSideEncryption: 'AES256',
    Metadata: {
      'uploaded-by': 'accudefend',
      'upload-timestamp': new Date().toISOString()
    }
  });

  await client.send(command);
  logger.info(`File uploaded to S3: ${key}`);

  return {
    bucket,
    key,
    url: `s3://${bucket}/${key}`
  };
}

/**
 * Generate presigned URL for file download
 */
async function getPresignedDownloadUrl(key, expiresIn = null) {
  const client = getS3Client();
  const bucket = process.env.AWS_S3_BUCKET;
  const expiry = expiresIn || parseInt(process.env.AWS_S3_PRESIGNED_EXPIRY) || 3600;

  const command = new _s3sdk.GetObjectCommand({
    Bucket: bucket,
    Key: key
  });

  loadDeps();
  const url = await _presigner.getSignedUrl(client, command, { expiresIn: expiry });
  return url;
}

/**
 * Generate presigned URL for file upload
 */
async function getPresignedUploadUrl(key, contentType, expiresIn = 3600) {
  const client = getS3Client();
  const bucket = process.env.AWS_S3_BUCKET;

  const command = new _s3sdk.PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
    ServerSideEncryption: 'AES256'
  });

  loadDeps();
  const url = await _presigner.getSignedUrl(client, command, { expiresIn });
  return url;
}

/**
 * Delete file from S3
 */
async function deleteFile(key) {
  const client = getS3Client();
  const bucket = process.env.AWS_S3_BUCKET;

  const command = new _s3sdk.DeleteObjectCommand({
    Bucket: bucket,
    Key: key
  });

  await client.send(command);
  logger.info(`File deleted from S3: ${key}`);
}

/**
 * Check if file exists in S3
 */
async function fileExists(key) {
  const client = getS3Client();
  const bucket = process.env.AWS_S3_BUCKET;

  try {
    const command = new _s3sdk.HeadObjectCommand({
      Bucket: bucket,
      Key: key
    });

    await client.send(command);
    return true;
  } catch (error) {
    if (error.name === 'NotFound') {
      return false;
    }
    throw error;
  }
}

/**
 * Get file metadata
 */
async function getFileMetadata(key) {
  const client = getS3Client();
  const bucket = process.env.AWS_S3_BUCKET;

  const command = new _s3sdk.HeadObjectCommand({
    Bucket: bucket,
    Key: key
  });

  const response = await client.send(command);
  return {
    contentType: response.ContentType,
    contentLength: response.ContentLength,
    lastModified: response.LastModified,
    metadata: response.Metadata
  };
}

module.exports = {
  getS3Client,
  initializeS3,
  generateS3Key,
  uploadFile,
  getPresignedDownloadUrl,
  getPresignedUploadUrl,
  deleteFile,
  fileExists,
  getFileMetadata
};
