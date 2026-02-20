/**
 * AccuDefend - AI-Powered Chargeback Defense Platform
 * Documents Controller - Supporting Documents Management
 */

const { prisma } = require('../config/database');
const storage = require('../config/storage');
const logger = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

/**
 * Get all supporting documents
 */
const getDocuments = async (req, res) => {
  try {
    const documents = await prisma.supportingDocument.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        uploadedBy: {
          select: { id: true, firstName: true, lastName: true, email: true }
        }
      }
    });

    res.json({
      success: true,
      documents: documents.map(doc => ({
        id: doc.id,
        filename: doc.filename,
        originalName: doc.originalName,
        category: doc.category,
        description: doc.description,
        size: doc.size,
        mimeType: doc.mimeType,
        storageKey: doc.storageKey,
        uploadedAt: doc.createdAt,
        uploadedBy: doc.uploadedBy ? `${doc.uploadedBy.firstName} ${doc.uploadedBy.lastName}` : 'System'
      }))
    });
  } catch (error) {
    logger.error('Failed to fetch documents:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch documents' });
  }
};

/**
 * Upload a new supporting document
 */
const uploadDocument = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    const { category, description } = req.body;
    const file = req.file;

    // Generate storage key
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const uniqueId = uuidv4().substring(0, 8);
    const sanitizedFilename = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    const storageKey = `documents/${category || 'GENERAL'}/${timestamp}-${uniqueId}-${sanitizedFilename}`;

    // Upload to storage
    const uploadResult = await storage.uploadFile(
      file.buffer,
      storageKey,
      file.mimetype
    );

    // Save document record to database
    const document = await prisma.supportingDocument.create({
      data: {
        id: uuidv4(),
        filename: sanitizedFilename,
        originalName: file.originalname,
        category: category || 'GENERAL',
        description: description || '',
        size: file.size,
        mimeType: file.mimetype,
        storageKey: storageKey,
        storageUrl: uploadResult.url,
        storageType: uploadResult.storage,
        uploadedById: req.user?.id || null
      }
    });

    logger.info(`Document uploaded: ${document.filename} by user ${req.user?.email}`);

    res.status(201).json({
      success: true,
      document: {
        id: document.id,
        filename: document.filename,
        originalName: document.originalName,
        category: document.category,
        description: document.description,
        size: document.size,
        mimeType: document.mimeType,
        uploadedAt: document.createdAt
      }
    });
  } catch (error) {
    logger.error('Failed to upload document:', error);
    res.status(500).json({ success: false, error: 'Failed to upload document' });
  }
};

/**
 * Download a document
 */
const downloadDocument = async (req, res) => {
  try {
    const { id } = req.params;

    const document = await prisma.supportingDocument.findUnique({
      where: { id }
    });

    if (!document) {
      return res.status(404).json({ success: false, error: 'Document not found' });
    }

    // Get download URL or stream
    const downloadUrl = await storage.getPresignedDownloadUrl(document.storageKey);

    // For local storage, stream the file directly
    if (document.storageType === 'local') {
      const fileStream = await storage.getFileStream(document.storageKey);
      res.setHeader('Content-Type', document.mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${document.originalName}"`);
      fileStream.pipe(res);
    } else {
      // For S3, redirect to presigned URL
      res.redirect(downloadUrl);
    }
  } catch (error) {
    logger.error('Failed to download document:', error);
    res.status(500).json({ success: false, error: 'Failed to download document' });
  }
};

/**
 * Delete a document
 */
const deleteDocument = async (req, res) => {
  try {
    const { id } = req.params;

    const document = await prisma.supportingDocument.findUnique({
      where: { id }
    });

    if (!document) {
      return res.status(404).json({ success: false, error: 'Document not found' });
    }

    // Delete from storage
    await storage.deleteFile(document.storageKey);

    // Delete from database
    await prisma.supportingDocument.delete({
      where: { id }
    });

    logger.info(`Document deleted: ${document.filename} by user ${req.user?.email}`);

    res.json({ success: true, message: 'Document deleted successfully' });
  } catch (error) {
    logger.error('Failed to delete document:', error);
    res.status(500).json({ success: false, error: 'Failed to delete document' });
  }
};

/**
 * Get document by ID
 */
const getDocumentById = async (req, res) => {
  try {
    const { id } = req.params;

    const document = await prisma.supportingDocument.findUnique({
      where: { id },
      include: {
        uploadedBy: {
          select: { id: true, firstName: true, lastName: true, email: true }
        }
      }
    });

    if (!document) {
      return res.status(404).json({ success: false, error: 'Document not found' });
    }

    res.json({
      success: true,
      document: {
        id: document.id,
        filename: document.filename,
        originalName: document.originalName,
        category: document.category,
        description: document.description,
        size: document.size,
        mimeType: document.mimeType,
        storageKey: document.storageKey,
        uploadedAt: document.createdAt,
        uploadedBy: document.uploadedBy ? `${document.uploadedBy.firstName} ${document.uploadedBy.lastName}` : 'System'
      }
    });
  } catch (error) {
    logger.error('Failed to fetch document:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch document' });
  }
};

/**
 * Update document metadata
 */
const updateDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const { category, description } = req.body;

    const document = await prisma.supportingDocument.findUnique({
      where: { id }
    });

    if (!document) {
      return res.status(404).json({ success: false, error: 'Document not found' });
    }

    const updatedDocument = await prisma.supportingDocument.update({
      where: { id },
      data: {
        category: category || document.category,
        description: description !== undefined ? description : document.description,
        updatedAt: new Date()
      }
    });

    logger.info(`Document updated: ${document.filename} by user ${req.user?.email}`);

    res.json({
      success: true,
      document: {
        id: updatedDocument.id,
        filename: updatedDocument.filename,
        category: updatedDocument.category,
        description: updatedDocument.description,
        updatedAt: updatedDocument.updatedAt
      }
    });
  } catch (error) {
    logger.error('Failed to update document:', error);
    res.status(500).json({ success: false, error: 'Failed to update document' });
  }
};

module.exports = {
  getDocuments,
  uploadDocument,
  downloadDocument,
  deleteDocument,
  getDocumentById,
  updateDocument
};
