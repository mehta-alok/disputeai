/**
 * AccuDefend - AI-Powered Chargeback Defense Platform
 * File Storage Configuration (Local + S3 support)
 *
 * Uses local storage by default, or S3 if configured
 */

const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

// Check if S3 is configured
const useS3 = !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY && process.env.AWS_S3_BUCKET);

// Local storage directory
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
const BASE_URL = process.env.BASE_URL || 'http://localhost:8000';

// S3 imports (only load if needed)
let s3Client, S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand, getSignedUrl;

if (useS3) {
  const s3Module = require('@aws-sdk/client-s3');
  S3Client = s3Module.S3Client;
  PutObjectCommand = s3Module.PutObjectCommand;
  GetObjectCommand = s3Module.GetObjectCommand;
  DeleteObjectCommand = s3Module.DeleteObjectCommand;
  HeadObjectCommand = s3Module.HeadObjectCommand;
  getSignedUrl = require('@aws-sdk/s3-request-presigner').getSignedUrl;
}

/**
 * Initialize storage
 */
async function initializeStorage() {
  if (useS3) {
    logger.info('AccuDefend: Using AWS S3 for file storage');
    s3Client = new S3Client({
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
      }
    });
    return { type: 's3', bucket: process.env.AWS_S3_BUCKET };
  } else {
    logger.info('AccuDefend: Using local file storage');
    // Create uploads directory if it doesn't exist
    await fs.mkdir(UPLOADS_DIR, { recursive: true });
    return { type: 'local', path: UPLOADS_DIR };
  }
}

/**
 * Generate storage key for evidence files
 * Format: chargebacks/{chargebackId}/{evidenceType}/{timestamp}-{uuid}-{filename}
 */
function generateS3Key(chargebackId, evidenceType, originalFilename) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const uniqueId = uuidv4().substring(0, 8);
  const sanitizedFilename = originalFilename.replace(/[^a-zA-Z0-9.-]/g, '_');

  return `chargebacks/${chargebackId}/${evidenceType}/${timestamp}-${uniqueId}-${sanitizedFilename}`;
}

/**
 * Upload file to storage
 */
async function uploadFile(buffer, key, contentType) {
  if (useS3) {
    return uploadToS3(buffer, key, contentType);
  } else {
    return uploadToLocal(buffer, key, contentType);
  }
}

/**
 * Upload file to local storage
 */
async function uploadToLocal(buffer, key, contentType) {
  const filePath = path.join(UPLOADS_DIR, key);
  const dir = path.dirname(filePath);

  // Create directory structure
  await fs.mkdir(dir, { recursive: true });

  // Write file
  await fs.writeFile(filePath, buffer);

  // Store metadata
  const metadataPath = `${filePath}.meta.json`;
  await fs.writeFile(metadataPath, JSON.stringify({
    contentType,
    uploadedAt: new Date().toISOString(),
    size: buffer.length
  }));

  logger.info(`File uploaded to local storage: ${key}`);

  return {
    storage: 'local',
    key,
    url: `${BASE_URL}/uploads/${key}`
  };
}

/**
 * Upload file to S3
 */
async function uploadToS3(buffer, key, contentType) {
  const bucket = process.env.AWS_S3_BUCKET;

  const command = new PutObjectCommand({
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

  await s3Client.send(command);
  logger.info(`File uploaded to S3: ${key}`);

  return {
    storage: 's3',
    bucket,
    key,
    url: `s3://${bucket}/${key}`
  };
}

/**
 * Get download URL for file
 */
async function getPresignedDownloadUrl(key, expiresIn = null) {
  if (useS3) {
    return getS3DownloadUrl(key, expiresIn);
  } else {
    return getLocalDownloadUrl(key);
  }
}

/**
 * Get local file download URL
 */
function getLocalDownloadUrl(key) {
  return `${BASE_URL}/uploads/${key}`;
}

/**
 * Get S3 presigned download URL
 */
async function getS3DownloadUrl(key, expiresIn = null) {
  const bucket = process.env.AWS_S3_BUCKET;
  const expiry = expiresIn || parseInt(process.env.AWS_S3_PRESIGNED_EXPIRY) || 3600;

  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key
  });

  const url = await getSignedUrl(s3Client, command, { expiresIn: expiry });
  return url;
}

/**
 * Delete file from storage
 */
async function deleteFile(key) {
  if (useS3) {
    return deleteFromS3(key);
  } else {
    return deleteFromLocal(key);
  }
}

/**
 * Delete file from local storage
 */
async function deleteFromLocal(key) {
  const filePath = path.join(UPLOADS_DIR, key);
  const metadataPath = `${filePath}.meta.json`;

  try {
    await fs.unlink(filePath);
    await fs.unlink(metadataPath).catch(() => {}); // Ignore if metadata doesn't exist
    logger.info(`File deleted from local storage: ${key}`);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }
}

/**
 * Delete file from S3
 */
async function deleteFromS3(key) {
  const bucket = process.env.AWS_S3_BUCKET;

  const command = new DeleteObjectCommand({
    Bucket: bucket,
    Key: key
  });

  await s3Client.send(command);
  logger.info(`File deleted from S3: ${key}`);
}

/**
 * Check if file exists
 */
async function fileExists(key) {
  if (useS3) {
    return fileExistsInS3(key);
  } else {
    return fileExistsLocal(key);
  }
}

/**
 * Check if file exists locally
 */
async function fileExistsLocal(key) {
  const filePath = path.join(UPLOADS_DIR, key);
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if file exists in S3
 */
async function fileExistsInS3(key) {
  const bucket = process.env.AWS_S3_BUCKET;

  try {
    const command = new HeadObjectCommand({
      Bucket: bucket,
      Key: key
    });

    await s3Client.send(command);
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
  if (useS3) {
    return getS3FileMetadata(key);
  } else {
    return getLocalFileMetadata(key);
  }
}

/**
 * Get local file metadata
 */
async function getLocalFileMetadata(key) {
  const filePath = path.join(UPLOADS_DIR, key);
  const metadataPath = `${filePath}.meta.json`;

  try {
    const stats = await fs.stat(filePath);
    let metadata = {};

    try {
      const metaContent = await fs.readFile(metadataPath, 'utf8');
      metadata = JSON.parse(metaContent);
    } catch {
      // Metadata file doesn't exist
    }

    return {
      contentType: metadata.contentType || 'application/octet-stream',
      contentLength: stats.size,
      lastModified: stats.mtime,
      metadata: metadata
    };
  } catch (error) {
    throw new Error(`File not found: ${key}`);
  }
}

/**
 * Get S3 file metadata
 */
async function getS3FileMetadata(key) {
  const bucket = process.env.AWS_S3_BUCKET;

  const command = new HeadObjectCommand({
    Bucket: bucket,
    Key: key
  });

  const response = await s3Client.send(command);
  return {
    contentType: response.ContentType,
    contentLength: response.ContentLength,
    lastModified: response.LastModified,
    metadata: response.Metadata
  };
}

/**
 * Get file stream for download
 */
async function getFileStream(key) {
  if (useS3) {
    const bucket = process.env.AWS_S3_BUCKET;
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key
    });
    const response = await s3Client.send(command);
    return response.Body;
  } else {
    const filePath = path.join(UPLOADS_DIR, key);
    const { createReadStream } = require('fs');
    return createReadStream(filePath);
  }
}

/**
 * Get storage type info
 */
function getStorageInfo() {
  return {
    type: useS3 ? 's3' : 'local',
    bucket: useS3 ? process.env.AWS_S3_BUCKET : null,
    localPath: useS3 ? null : UPLOADS_DIR
  };
}

module.exports = {
  initializeStorage,
  generateS3Key,
  uploadFile,
  getPresignedDownloadUrl,
  deleteFile,
  fileExists,
  getFileMetadata,
  getFileStream,
  getStorageInfo,
  UPLOADS_DIR
};
