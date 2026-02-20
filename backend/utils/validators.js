/**
 * AccuDefend - AI-Powered Chargeback Defense Platform
 * Lightweight Validation Library (Zod-compatible safeParse API)
 *
 * No external dependencies. Provides a schema builder that mimics
 * Zod's .safeParse() returning { success, data, error }.
 */

// =============================================================================
// SCHEMA BUILDER
// =============================================================================

class ValidationError {
  constructor(errors) {
    this.errors = errors;
  }
}

class Schema {
  constructor() {
    this._fields = {};
    this._passthrough = false;
  }

  /**
   * Allow unknown fields to pass through without error
   */
  passthrough() {
    const clone = this._clone();
    clone._passthrough = true;
    return clone;
  }

  _clone() {
    const s = new Schema();
    s._fields = { ...this._fields };
    s._passthrough = this._passthrough;
    return s;
  }

  /**
   * Validate data against this schema.
   * Returns { success: true, data } or { success: false, error: { errors: [...] } }
   */
  safeParse(input) {
    const data = input || {};
    const errors = [];
    const result = {};

    for (const [key, rules] of Object.entries(this._fields)) {
      const value = data[key];
      const fieldErrors = this._validateField(key, value, rules);

      if (fieldErrors.length > 0) {
        errors.push(...fieldErrors);
      } else if (value !== undefined && value !== null) {
        // Apply transforms
        result[key] = this._applyTransforms(value, rules);
      } else if (rules.default !== undefined) {
        result[key] = typeof rules.default === 'function' ? rules.default() : rules.default;
      }
    }

    // Pass through unknown fields if enabled
    if (this._passthrough) {
      for (const key of Object.keys(data)) {
        if (!(key in this._fields) && data[key] !== undefined) {
          result[key] = data[key];
        }
      }
    }

    if (errors.length > 0) {
      return {
        success: false,
        error: new ValidationError(errors)
      };
    }

    return {
      success: true,
      data: result
    };
  }

  _validateField(key, value, rules) {
    const errors = [];
    const isNil = value === undefined || value === null || value === '';

    // Check required
    if (rules.required && isNil) {
      errors.push({
        path: [key],
        message: rules.requiredMessage || `${key} is required`,
        code: 'required'
      });
      return errors;
    }

    // If optional and not provided, skip further validation
    if (isNil) {
      return errors;
    }

    // Type checks
    if (rules.type === 'string' && typeof value !== 'string') {
      errors.push({
        path: [key],
        message: `${key} must be a string`,
        code: 'invalid_type'
      });
      return errors;
    }

    if (rules.type === 'number') {
      const num = typeof value === 'string' ? parseFloat(value) : value;
      if (typeof num !== 'number' || isNaN(num)) {
        errors.push({
          path: [key],
          message: `${key} must be a number`,
          code: 'invalid_type'
        });
        return errors;
      }
    }

    if (rules.type === 'boolean') {
      if (typeof value !== 'boolean' && value !== 'true' && value !== 'false') {
        errors.push({
          path: [key],
          message: `${key} must be a boolean`,
          code: 'invalid_type'
        });
        return errors;
      }
    }

    if (rules.type === 'array') {
      if (!Array.isArray(value)) {
        errors.push({
          path: [key],
          message: `${key} must be an array`,
          code: 'invalid_type'
        });
        return errors;
      }
    }

    if (rules.type === 'object') {
      if (typeof value !== 'object' || Array.isArray(value) || value === null) {
        errors.push({
          path: [key],
          message: `${key} must be an object`,
          code: 'invalid_type'
        });
        return errors;
      }
    }

    // String validations
    if (rules.type === 'string' && typeof value === 'string') {
      if (rules.minLength !== undefined && value.length < rules.minLength) {
        errors.push({
          path: [key],
          message: rules.minLengthMessage || `${key} must be at least ${rules.minLength} characters`,
          code: 'too_small'
        });
      }

      if (rules.maxLength !== undefined && value.length > rules.maxLength) {
        errors.push({
          path: [key],
          message: `${key} must be at most ${rules.maxLength} characters`,
          code: 'too_big'
        });
      }

      if (rules.pattern && !rules.pattern.test(value)) {
        errors.push({
          path: [key],
          message: rules.patternMessage || `${key} has invalid format`,
          code: 'invalid_string'
        });
      }

      if (rules.email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(value)) {
          errors.push({
            path: [key],
            message: 'Invalid email address',
            code: 'invalid_string'
          });
        }
      }
    }

    // Number validations
    if (rules.type === 'number') {
      const num = typeof value === 'string' ? parseFloat(value) : value;
      if (rules.min !== undefined && num < rules.min) {
        errors.push({
          path: [key],
          message: `${key} must be at least ${rules.min}`,
          code: 'too_small'
        });
      }

      if (rules.max !== undefined && num > rules.max) {
        errors.push({
          path: [key],
          message: `${key} must be at most ${rules.max}`,
          code: 'too_big'
        });
      }
    }

    // Enum validation
    if (rules.enum && !rules.enum.includes(value)) {
      errors.push({
        path: [key],
        message: `${key} must be one of: ${rules.enum.join(', ')}`,
        code: 'invalid_enum_value'
      });
    }

    return errors;
  }

  _applyTransforms(value, rules) {
    let result = value;

    if (rules.type === 'number' && typeof result === 'string') {
      result = parseFloat(result);
    }

    if (rules.type === 'boolean' && typeof result === 'string') {
      result = result === 'true';
    }

    if (rules.transform) {
      result = rules.transform(result);
    }

    if (rules.trim && typeof result === 'string') {
      result = result.trim();
    }

    if (rules.lowercase && typeof result === 'string') {
      result = result.toLowerCase();
    }

    if (rules.toInt && typeof result === 'string') {
      result = parseInt(result, 10);
      if (isNaN(result)) result = rules.default;
    }

    return result;
  }
}

/**
 * Create a schema definition
 * @param {Object} fields - Field definitions
 * @returns {Schema}
 */
function createSchema(fields) {
  const schema = new Schema();
  schema._fields = fields;
  return schema;
}


// =============================================================================
// AUTH SCHEMAS
// =============================================================================

const loginSchema = createSchema({
  email: {
    type: 'string',
    required: true,
    email: true,
    trim: true,
    lowercase: true,
    requiredMessage: 'Email is required'
  },
  password: {
    type: 'string',
    required: true,
    minLength: 1,
    requiredMessage: 'Password is required'
  }
});

const registerSchema = createSchema({
  email: {
    type: 'string',
    required: true,
    email: true,
    trim: true,
    lowercase: true,
    requiredMessage: 'Email is required'
  },
  password: {
    type: 'string',
    required: true,
    minLength: 8,
    minLengthMessage: 'Password must be at least 8 characters',
    requiredMessage: 'Password is required'
  },
  firstName: {
    type: 'string',
    required: true,
    trim: true,
    minLength: 1,
    maxLength: 100,
    requiredMessage: 'First name is required'
  },
  lastName: {
    type: 'string',
    required: true,
    trim: true,
    minLength: 1,
    maxLength: 100,
    requiredMessage: 'Last name is required'
  },
  role: {
    type: 'string',
    required: false,
    enum: ['ADMIN', 'MANAGER', 'STAFF', 'VIEWER'],
    default: 'STAFF'
  },
  propertyId: {
    type: 'string',
    required: false
  }
});


// =============================================================================
// ADMIN SCHEMAS
// =============================================================================

const createPropertySchema = createSchema({
  name: {
    type: 'string',
    required: true,
    trim: true,
    minLength: 1,
    maxLength: 255,
    requiredMessage: 'Property name is required'
  },
  address: {
    type: 'string',
    required: false,
    trim: true,
    maxLength: 500
  },
  city: {
    type: 'string',
    required: false,
    trim: true,
    maxLength: 100
  },
  state: {
    type: 'string',
    required: false,
    trim: true,
    maxLength: 100
  },
  zipCode: {
    type: 'string',
    required: false,
    trim: true,
    maxLength: 20
  },
  country: {
    type: 'string',
    required: false,
    trim: true,
    maxLength: 100,
    default: 'US'
  },
  phone: {
    type: 'string',
    required: false,
    trim: true,
    maxLength: 30
  },
  email: {
    type: 'string',
    required: false,
    email: true,
    trim: true,
    lowercase: true
  },
  timezone: {
    type: 'string',
    required: false,
    trim: true,
    default: 'America/New_York'
  },
  pmsType: {
    type: 'string',
    required: false,
    enum: ['OPERA', 'MEWS', 'CLOUDBEDS', 'STAYNTOUCH', 'OTHER']
  },
  roomCount: {
    type: 'number',
    required: false,
    min: 1
  }
});

const createProviderSchema = createSchema({
  name: {
    type: 'string',
    required: true,
    trim: true,
    minLength: 1,
    maxLength: 255,
    requiredMessage: 'Provider name is required'
  },
  type: {
    type: 'string',
    required: true,
    enum: ['PAYMENT_PROCESSOR', 'PMS', 'CRM', 'GATEWAY', 'OTHER'],
    requiredMessage: 'Provider type is required'
  },
  apiEndpoint: {
    type: 'string',
    required: false,
    trim: true
  },
  credentials: {
    type: 'object',
    required: false
  },
  webhookUrl: {
    type: 'string',
    required: false,
    trim: true
  },
  webhookSecret: {
    type: 'string',
    required: false,
    trim: true
  },
  isActive: {
    type: 'boolean',
    required: false,
    default: true
  }
});


// =============================================================================
// CASE SCHEMAS
// =============================================================================

const createCaseSchema = createSchema({
  propertyId: {
    type: 'string',
    required: true,
    requiredMessage: 'Property ID is required'
  },
  providerId: {
    type: 'string',
    required: false
  },
  guestName: {
    type: 'string',
    required: true,
    trim: true,
    minLength: 1,
    maxLength: 255,
    requiredMessage: 'Guest name is required'
  },
  guestEmail: {
    type: 'string',
    required: false,
    email: true,
    trim: true,
    lowercase: true
  },
  guestPhone: {
    type: 'string',
    required: false,
    trim: true
  },
  amount: {
    type: 'number',
    required: true,
    min: 0.01,
    requiredMessage: 'Amount is required'
  },
  currency: {
    type: 'string',
    required: false,
    trim: true,
    default: 'USD'
  },
  reasonCode: {
    type: 'string',
    required: true,
    trim: true,
    requiredMessage: 'Reason code is required'
  },
  reasonDescription: {
    type: 'string',
    required: false,
    trim: true
  },
  cardBrand: {
    type: 'string',
    required: false,
    enum: ['VISA', 'MASTERCARD', 'AMEX', 'DISCOVER', 'OTHER']
  },
  cardLastFour: {
    type: 'string',
    required: false,
    trim: true,
    pattern: /^\d{4}$/,
    patternMessage: 'Card last four must be exactly 4 digits'
  },
  transactionId: {
    type: 'string',
    required: false,
    trim: true
  },
  processorDisputeId: {
    type: 'string',
    required: false,
    trim: true
  },
  confirmationNumber: {
    type: 'string',
    required: false,
    trim: true
  },
  roomNumber: {
    type: 'string',
    required: false,
    trim: true
  },
  roomType: {
    type: 'string',
    required: false,
    trim: true
  },
  disputeDate: {
    type: 'string',
    required: true,
    requiredMessage: 'Dispute date is required'
  },
  dueDate: {
    type: 'string',
    required: false
  },
  checkInDate: {
    type: 'string',
    required: true,
    requiredMessage: 'Check-in date is required'
  },
  checkOutDate: {
    type: 'string',
    required: true,
    requiredMessage: 'Check-out date is required'
  }
});

const updateCaseSchema = createSchema({
  guestName: {
    type: 'string',
    required: false,
    trim: true,
    minLength: 1,
    maxLength: 255
  },
  guestEmail: {
    type: 'string',
    required: false,
    email: true,
    trim: true,
    lowercase: true
  },
  guestPhone: {
    type: 'string',
    required: false,
    trim: true
  },
  amount: {
    type: 'number',
    required: false,
    min: 0.01
  },
  reasonCode: {
    type: 'string',
    required: false,
    trim: true
  },
  reasonDescription: {
    type: 'string',
    required: false,
    trim: true
  },
  cardBrand: {
    type: 'string',
    required: false,
    enum: ['VISA', 'MASTERCARD', 'AMEX', 'DISCOVER', 'OTHER']
  },
  cardLastFour: {
    type: 'string',
    required: false,
    trim: true,
    pattern: /^\d{4}$/,
    patternMessage: 'Card last four must be exactly 4 digits'
  },
  roomNumber: {
    type: 'string',
    required: false,
    trim: true
  },
  roomType: {
    type: 'string',
    required: false,
    trim: true
  },
  confirmationNumber: {
    type: 'string',
    required: false,
    trim: true
  },
  dueDate: {
    type: 'string',
    required: false
  },
  confidenceScore: {
    type: 'number',
    required: false,
    min: 0,
    max: 100
  },
  recommendation: {
    type: 'string',
    required: false,
    enum: ['AUTO_SUBMIT', 'REVIEW_RECOMMENDED', 'GATHER_MORE_EVIDENCE', 'UNLIKELY_TO_WIN']
  }
}).passthrough();

const updateCaseStatusSchema = createSchema({
  status: {
    type: 'string',
    required: true,
    enum: ['PENDING', 'IN_REVIEW', 'SUBMITTED', 'WON', 'LOST', 'EXPIRED', 'CANCELLED'],
    requiredMessage: 'Status is required'
  },
  notes: {
    type: 'string',
    required: false,
    trim: true
  }
});

const caseFilterSchema = createSchema({
  status: {
    type: 'string',
    required: false,
    trim: true
  },
  propertyId: {
    type: 'string',
    required: false
  },
  providerId: {
    type: 'string',
    required: false
  },
  dateFrom: {
    type: 'string',
    required: false
  },
  dateTo: {
    type: 'string',
    required: false
  },
  search: {
    type: 'string',
    required: false,
    trim: true
  },
  page: {
    type: 'number',
    required: false,
    min: 1,
    default: 1,
    toInt: true
  },
  limit: {
    type: 'number',
    required: false,
    min: 1,
    max: 100,
    default: 20,
    toInt: true
  },
  sortBy: {
    type: 'string',
    required: false,
    enum: ['createdAt', 'updatedAt', 'amount', 'status', 'dueDate', 'confidenceScore', 'guestName'],
    default: 'createdAt'
  },
  sortOrder: {
    type: 'string',
    required: false,
    enum: ['asc', 'desc'],
    default: 'desc'
  }
}).passthrough();


// =============================================================================
// DISPUTE SCHEMA
// =============================================================================

const disputeSchema = createSchema({
  amount: {
    type: 'number',
    required: true,
    min: 0.01,
    requiredMessage: 'Amount is required'
  },
  cardholderName: {
    type: 'string',
    required: true,
    trim: true,
    minLength: 1,
    maxLength: 255,
    requiredMessage: 'Cardholder name is required'
  },
  reasonCode: {
    type: 'string',
    required: true,
    trim: true,
    requiredMessage: 'Reason code is required'
  },
  transactionId: {
    type: 'string',
    required: false,
    trim: true
  },
  cardBrand: {
    type: 'string',
    required: false,
    enum: ['VISA', 'MASTERCARD', 'AMEX', 'DISCOVER', 'OTHER']
  },
  cardLastFour: {
    type: 'string',
    required: false,
    trim: true,
    pattern: /^\d{4}$/,
    patternMessage: 'Card last four must be exactly 4 digits'
  },
  disputeDate: {
    type: 'string',
    required: false
  },
  description: {
    type: 'string',
    required: false,
    trim: true,
    maxLength: 2000
  }
});


// =============================================================================
// SETTINGS SCHEMA
// =============================================================================

const settingsSchema = createSchema({
  key: {
    type: 'string',
    required: true,
    trim: true,
    minLength: 1,
    maxLength: 255,
    requiredMessage: 'Setting key is required'
  },
  value: {
    type: 'string',
    required: true,
    requiredMessage: 'Setting value is required'
  },
  description: {
    type: 'string',
    required: false,
    trim: true,
    maxLength: 500
  }
});


// =============================================================================
// EXPORTS
// =============================================================================

module.exports = {
  // Core
  createSchema,
  Schema,

  // Auth
  loginSchema,
  registerSchema,

  // Admin
  createPropertySchema,
  createProviderSchema,

  // Cases
  createCaseSchema,
  updateCaseSchema,
  updateCaseStatusSchema,
  caseFilterSchema,

  // Disputes
  disputeSchema,

  // Settings
  settingsSchema
};
