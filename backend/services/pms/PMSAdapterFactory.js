/**
 * AccuDefend - AI-Powered Chargeback Defense Platform
 * PMS Adapter Factory
 *
 * Central factory for creating PMS adapter instances.
 * Supports 30+ PMS systems across enterprise, boutique, vacation rental,
 * and brand-specific categories with full two-way sync.
 *
 * Usage:
 *   const { createAdapter } = require('./PMSAdapterFactory');
 *
 *   const adapter = createAdapter('OPERA_CLOUD', {
 *     baseUrl: 'https://api.oracle.com/opera/v1',
 *     credentials: { clientId: '...', clientSecret: '...', hotelId: 'HTLNYC' },
 *     propertyId: 'prop_abc123',
 *   });
 *
 *   await adapter.authenticate();
 *   const reservation = await adapter.getReservation('RES-12345');
 */

'use strict';

// ─── Enterprise / Full-Service Hotel PMS ────────────────────────────────────
const OperaCloudAdapter   = require('./OperaCloudAdapter');
const MewsAdapter         = require('./MewsAdapter');
const CloudbedsAdapter    = require('./CloudbedsAdapter');
const AutoClerkAdapter    = require('./AutoClerkAdapter');
const AgilysysAdapter     = require('./AgilysysAdapter');
const InforAdapter        = require('./InforAdapter');
const StayntouchAdapter   = require('./StayntouchAdapter');
const RoomKeyAdapter      = require('./RoomKeyAdapter');
const MaestroAdapter      = require('./MaestroAdapter');
const HotelogixAdapter    = require('./HotelogixAdapter');
const RMSCloudAdapter     = require('./RMSCloudAdapter');
const ProtelAdapter       = require('./ProtelAdapter');
const EZeeAdapter         = require('./EZeeAdapter');
const SIHOTAdapter        = require('./SIHOTAdapter');
const InnRoadAdapter      = require('./InnRoadAdapter');

// ─── Limited Service / Boutique / Independent PMS ───────────────────────────
const LittleHotelierAdapter      = require('./LittleHotelierAdapter');
const FrontdeskAnywhereAdapter   = require('./FrontdeskAnywhereAdapter');
const WebRezProAdapter           = require('./WebRezProAdapter');
const ThinkReservationsAdapter   = require('./ThinkReservationsAdapter');
const ResNexusAdapter            = require('./ResNexusAdapter');
const GuestlineAdapter           = require('./GuestlineAdapter');

// ─── Vacation Rental / Hybrid PMS ───────────────────────────────────────────
const GuestyAdapter   = require('./GuestyAdapter');
const HostawayAdapter = require('./HostawayAdapter');
const LodgifyAdapter  = require('./LodgifyAdapter');
const EscapiaAdapter  = require('./EscapiaAdapter');

// ─── Brand-Specific PMS ─────────────────────────────────────────────────────
const MarriottGXPAdapter   = require('./MarriottGXPAdapter');
const HiltonOnQAdapter     = require('./HiltonOnQAdapter');
const HyattOperaAdapter    = require('./HyattOperaAdapter');
const IHGConcertoAdapter   = require('./IHGConcertoAdapter');
const BestWesternAdapter   = require('./BestWesternAdapter');

/**
 * Map of supported PMS type identifiers to their adapter classes.
 * Keys are uppercase to allow case-insensitive lookups.
 */
const ADAPTERS = {
  // Enterprise / Full-Service
  OPERA_CLOUD:    OperaCloudAdapter,
  MEWS:           MewsAdapter,
  CLOUDBEDS:      CloudbedsAdapter,
  AUTOCLERK:      AutoClerkAdapter,
  AGILYSYS:       AgilysysAdapter,
  INFOR:          InforAdapter,
  STAYNTOUCH:     StayntouchAdapter,
  ROOMKEY:        RoomKeyAdapter,
  MAESTRO:        MaestroAdapter,
  HOTELOGIX:      HotelogixAdapter,
  RMS_CLOUD:      RMSCloudAdapter,
  PROTEL:         ProtelAdapter,
  EZEE:           EZeeAdapter,
  SIHOT:          SIHOTAdapter,
  INNROAD:        InnRoadAdapter,

  // Limited Service / Boutique / Independent
  LITTLE_HOTELIER:      LittleHotelierAdapter,
  FRONTDESK_ANYWHERE:   FrontdeskAnywhereAdapter,
  WEBREZPRO:            WebRezProAdapter,
  THINK_RESERVATIONS:   ThinkReservationsAdapter,
  RESNEXUS:             ResNexusAdapter,
  GUESTLINE:            GuestlineAdapter,

  // Vacation Rental / Hybrid
  GUESTY:    GuestyAdapter,
  HOSTAWAY:  HostawayAdapter,
  LODGIFY:   LodgifyAdapter,
  ESCAPIA:   EscapiaAdapter,

  // Brand-Specific
  MARRIOTT_GXP:   MarriottGXPAdapter,
  HILTON_ONQ:     HiltonOnQAdapter,
  HYATT_OPERA:    HyattOperaAdapter,
  IHG_CONCERTO:   IHGConcertoAdapter,
  BEST_WESTERN:   BestWesternAdapter,
};

/**
 * Metadata about each supported PMS (used by the UI and health dashboard).
 */
const PMS_METADATA = {
  // ── Enterprise / Full-Service ──────────────────────────────────────────────
  OPERA_CLOUD: {
    displayName: 'Oracle Opera Cloud',
    category: 'enterprise',
    authType: 'oauth2',
    supportsWebhooks: true,
    supportsPush: true,
    supportsDocuments: true,
    twoWaySync: true,
    features: ['reservations', 'folios', 'profiles', 'rates', 'notes', 'flags', 'webhooks'],
  },
  MEWS: {
    displayName: 'Mews Systems',
    category: 'enterprise',
    authType: 'api_key',
    supportsWebhooks: true,
    supportsPush: true,
    supportsDocuments: false,
    twoWaySync: true,
    features: ['reservations', 'folios', 'profiles', 'rates', 'notes', 'flags', 'webhooks'],
  },
  CLOUDBEDS: {
    displayName: 'Cloudbeds',
    category: 'enterprise',
    authType: 'oauth2',
    supportsWebhooks: true,
    supportsPush: true,
    supportsDocuments: false,
    twoWaySync: true,
    features: ['reservations', 'folios', 'profiles', 'rates', 'notes', 'webhooks'],
  },
  AUTOCLERK: {
    displayName: 'AutoClerk PMS',
    category: 'enterprise',
    authType: 'api_key',
    supportsWebhooks: true,
    supportsPush: true,
    supportsDocuments: true,
    twoWaySync: true,
    features: ['reservations', 'folios', 'profiles', 'rates', 'notes', 'flags', 'webhooks', 'documents', 'signature_capture', 'id_verification', 'audit_trail'],
  },
  AGILYSYS: {
    displayName: 'Agilysys LMS/Stay',
    category: 'enterprise',
    authType: 'api_key',
    supportsWebhooks: true,
    supportsPush: true,
    supportsDocuments: true,
    twoWaySync: true,
    features: ['reservations', 'folios', 'profiles', 'rates', 'notes', 'flags', 'webhooks', 'spa', 'golf', 'dining'],
  },
  INFOR: {
    displayName: 'Infor Hospitality HMS',
    category: 'enterprise',
    authType: 'oauth2',
    supportsWebhooks: true,
    supportsPush: true,
    supportsDocuments: true,
    twoWaySync: true,
    features: ['reservations', 'folios', 'profiles', 'rates', 'notes', 'flags', 'webhooks'],
  },
  STAYNTOUCH: {
    displayName: 'StayNTouch',
    category: 'enterprise',
    authType: 'oauth2',
    supportsWebhooks: true,
    supportsPush: true,
    supportsDocuments: true,
    twoWaySync: true,
    features: ['reservations', 'folios', 'profiles', 'rates', 'notes', 'flags', 'webhooks', 'digital_signatures', 'mobile_checkin'],
  },
  ROOMKEY: {
    displayName: 'RoomKeyPMS',
    category: 'enterprise',
    authType: 'api_key',
    supportsWebhooks: true,
    supportsPush: true,
    supportsDocuments: false,
    twoWaySync: true,
    features: ['reservations', 'folios', 'profiles', 'rates', 'notes', 'flags', 'webhooks'],
  },
  MAESTRO: {
    displayName: 'Maestro PMS',
    category: 'enterprise',
    authType: 'basic',
    supportsWebhooks: true,
    supportsPush: true,
    supportsDocuments: true,
    twoWaySync: true,
    features: ['reservations', 'folios', 'profiles', 'rates', 'notes', 'flags', 'spa', 'activities'],
  },
  HOTELOGIX: {
    displayName: 'Hotelogix',
    category: 'enterprise',
    authType: 'api_key',
    supportsWebhooks: true,
    supportsPush: true,
    supportsDocuments: false,
    twoWaySync: true,
    features: ['reservations', 'folios', 'profiles', 'rates', 'notes', 'webhooks'],
  },
  RMS_CLOUD: {
    displayName: 'RMS Cloud',
    category: 'enterprise',
    authType: 'oauth2',
    supportsWebhooks: true,
    supportsPush: true,
    supportsDocuments: false,
    twoWaySync: true,
    features: ['reservations', 'folios', 'profiles', 'rates', 'notes', 'flags', 'webhooks'],
  },
  PROTEL: {
    displayName: 'protel PMS',
    category: 'enterprise',
    authType: 'basic',
    supportsWebhooks: true,
    supportsPush: true,
    supportsDocuments: true,
    twoWaySync: true,
    features: ['reservations', 'folios', 'profiles', 'rates', 'notes', 'flags'],
  },
  EZEE: {
    displayName: 'eZee Absolute',
    category: 'enterprise',
    authType: 'api_key',
    supportsWebhooks: true,
    supportsPush: true,
    supportsDocuments: false,
    twoWaySync: true,
    features: ['reservations', 'folios', 'profiles', 'rates', 'notes', 'webhooks'],
  },
  SIHOT: {
    displayName: 'SIHOT PMS',
    category: 'enterprise',
    authType: 'api_key',
    supportsWebhooks: true,
    supportsPush: true,
    supportsDocuments: true,
    twoWaySync: true,
    features: ['reservations', 'folios', 'profiles', 'rates', 'notes', 'flags', 'webhooks'],
  },
  INNROAD: {
    displayName: 'innRoad',
    category: 'enterprise',
    authType: 'oauth2',
    supportsWebhooks: true,
    supportsPush: true,
    supportsDocuments: false,
    twoWaySync: true,
    features: ['reservations', 'folios', 'profiles', 'rates', 'notes', 'webhooks'],
  },

  // ── Limited Service / Boutique / Independent ───────────────────────────────
  LITTLE_HOTELIER: {
    displayName: 'Little Hotelier',
    category: 'boutique',
    authType: 'api_key',
    supportsWebhooks: true,
    supportsPush: true,
    supportsDocuments: false,
    twoWaySync: true,
    features: ['reservations', 'folios', 'profiles', 'rates', 'notes'],
  },
  FRONTDESK_ANYWHERE: {
    displayName: 'Frontdesk Anywhere',
    category: 'boutique',
    authType: 'oauth2',
    supportsWebhooks: true,
    supportsPush: true,
    supportsDocuments: false,
    twoWaySync: true,
    features: ['reservations', 'folios', 'profiles', 'rates', 'notes', 'webhooks'],
  },
  WEBREZPRO: {
    displayName: 'WebRezPro',
    category: 'boutique',
    authType: 'api_key',
    supportsWebhooks: false,
    supportsPush: true,
    supportsDocuments: false,
    twoWaySync: true,
    features: ['reservations', 'folios', 'profiles', 'rates', 'notes'],
  },
  THINK_RESERVATIONS: {
    displayName: 'ThinkReservations',
    category: 'boutique',
    authType: 'api_key',
    supportsWebhooks: true,
    supportsPush: true,
    supportsDocuments: false,
    twoWaySync: true,
    features: ['reservations', 'folios', 'profiles', 'rates', 'notes'],
  },
  RESNEXUS: {
    displayName: 'ResNexus',
    category: 'boutique',
    authType: 'api_key',
    supportsWebhooks: true,
    supportsPush: true,
    supportsDocuments: false,
    twoWaySync: true,
    features: ['reservations', 'folios', 'profiles', 'rates', 'notes'],
  },
  GUESTLINE: {
    displayName: 'Guestline',
    category: 'boutique',
    authType: 'oauth2',
    supportsWebhooks: true,
    supportsPush: true,
    supportsDocuments: true,
    twoWaySync: true,
    features: ['reservations', 'folios', 'profiles', 'rates', 'notes', 'flags', 'webhooks'],
  },

  // ── Vacation Rental / Hybrid ───────────────────────────────────────────────
  GUESTY: {
    displayName: 'Guesty',
    category: 'vacation_rental',
    authType: 'oauth2',
    supportsWebhooks: true,
    supportsPush: true,
    supportsDocuments: false,
    twoWaySync: true,
    features: ['reservations', 'folios', 'profiles', 'rates', 'notes', 'webhooks', 'listings', 'multi_channel'],
  },
  HOSTAWAY: {
    displayName: 'Hostaway',
    category: 'vacation_rental',
    authType: 'api_key',
    supportsWebhooks: true,
    supportsPush: true,
    supportsDocuments: false,
    twoWaySync: true,
    features: ['reservations', 'folios', 'profiles', 'rates', 'notes', 'webhooks', 'listings'],
  },
  LODGIFY: {
    displayName: 'Lodgify',
    category: 'vacation_rental',
    authType: 'api_key',
    supportsWebhooks: true,
    supportsPush: true,
    supportsDocuments: false,
    twoWaySync: true,
    features: ['reservations', 'folios', 'profiles', 'rates', 'notes', 'webhooks', 'properties'],
  },
  ESCAPIA: {
    displayName: 'Escapia (HomeAway/Vrbo)',
    category: 'vacation_rental',
    authType: 'api_key',
    supportsWebhooks: true,
    supportsPush: true,
    supportsDocuments: false,
    twoWaySync: true,
    features: ['reservations', 'folios', 'profiles', 'rates', 'notes'],
  },

  // ── Brand-Specific ─────────────────────────────────────────────────────────
  MARRIOTT_GXP: {
    displayName: 'Marriott GXP/FSPMS',
    category: 'brand',
    authType: 'oauth2',
    supportsWebhooks: true,
    supportsPush: true,
    supportsDocuments: true,
    twoWaySync: true,
    brand: 'Marriott International',
    loyaltyProgram: 'Marriott Bonvoy',
    features: ['reservations', 'folios', 'profiles', 'rates', 'notes', 'flags', 'webhooks', 'loyalty', 'brand_compliance'],
  },
  HILTON_ONQ: {
    displayName: 'Hilton OnQ PMS',
    category: 'brand',
    authType: 'oauth2',
    supportsWebhooks: true,
    supportsPush: true,
    supportsDocuments: true,
    twoWaySync: true,
    brand: 'Hilton',
    loyaltyProgram: 'Hilton Honors',
    features: ['reservations', 'folios', 'profiles', 'rates', 'notes', 'flags', 'webhooks', 'loyalty', 'digital_key', 'connected_room'],
  },
  HYATT_OPERA: {
    displayName: 'Hyatt Opera PMS',
    category: 'brand',
    authType: 'oauth2',
    supportsWebhooks: true,
    supportsPush: true,
    supportsDocuments: true,
    twoWaySync: true,
    brand: 'Hyatt Hotels',
    loyaltyProgram: 'World of Hyatt',
    features: ['reservations', 'folios', 'profiles', 'rates', 'notes', 'flags', 'webhooks', 'loyalty'],
  },
  IHG_CONCERTO: {
    displayName: 'IHG Concerto',
    category: 'brand',
    authType: 'oauth2',
    supportsWebhooks: true,
    supportsPush: true,
    supportsDocuments: true,
    twoWaySync: true,
    brand: 'IHG Hotels & Resorts',
    loyaltyProgram: 'IHG One Rewards',
    features: ['reservations', 'folios', 'profiles', 'rates', 'notes', 'flags', 'webhooks', 'loyalty', 'guest_recognition'],
  },
  BEST_WESTERN: {
    displayName: 'Best Western Hotels',
    category: 'brand',
    authType: 'api_key',
    supportsWebhooks: true,
    supportsPush: true,
    supportsDocuments: false,
    twoWaySync: true,
    brand: 'Best Western Hotels & Resorts',
    loyaltyProgram: 'Best Western Rewards',
    features: ['reservations', 'folios', 'profiles', 'rates', 'notes', 'flags', 'webhooks', 'loyalty'],
  },
};

/**
 * Create a PMS adapter instance for the given PMS type.
 *
 * @param {string} pmsType - PMS identifier (case-insensitive). See PMS_METADATA for all types.
 * @param {Object} config  - Adapter configuration.
 * @param {string} [config.baseUrl]         - Override default API base URL.
 * @param {Object}  config.credentials      - Decrypted PMS credentials.
 * @param {string} [config.propertyId]      - AccuDefend property ID.
 * @param {string} [config.integrationId]   - AccuDefend Integration row ID.
 * @param {Object} [config.httpOptions]     - Override httpClientFactory options.
 * @returns {BasePMSAdapter} Concrete adapter instance (not yet authenticated).
 * @throws {Error} If pmsType is not supported.
 */
function createAdapter(pmsType, config) {
  const key = pmsType?.toUpperCase();
  const AdapterClass = ADAPTERS[key];

  if (!AdapterClass) {
    const supported = Object.keys(ADAPTERS).join(', ');
    throw new Error(
      `No adapter available for PMS type: "${pmsType}". Supported types: ${supported}`
    );
  }

  return new AdapterClass({ ...config, pmsType: key });
}

/**
 * Get the list of all supported PMS type identifiers.
 * @returns {string[]}
 */
function getSupportedTypes() {
  return Object.keys(ADAPTERS);
}

/**
 * Check whether a PMS type is supported.
 * @param {string} pmsType - Case-insensitive PMS identifier.
 * @returns {boolean}
 */
function isSupported(pmsType) {
  return !!ADAPTERS[pmsType?.toUpperCase()];
}

/**
 * Get metadata for a specific PMS type (display name, auth type, features, etc.).
 * @param {string} pmsType
 * @returns {Object|null}
 */
function getMetadata(pmsType) {
  return PMS_METADATA[pmsType?.toUpperCase()] || null;
}

/**
 * Get metadata for all supported PMS types, keyed by type identifier.
 * @returns {Object}
 */
function getAllMetadata() {
  return { ...PMS_METADATA };
}

/**
 * Get PMS types filtered by category.
 * @param {'enterprise'|'boutique'|'vacation_rental'|'brand'} category
 * @returns {string[]}
 */
function getTypesByCategory(category) {
  return Object.entries(PMS_METADATA)
    .filter(([_, meta]) => meta.category === category)
    .map(([key]) => key);
}

module.exports = {
  createAdapter,
  getSupportedTypes,
  isSupported,
  getMetadata,
  getAllMetadata,
  getTypesByCategory,
  ADAPTERS,
  PMS_METADATA,
};
