/**
 * אישורטאבו - Main Entry Point
 *
 * This file serves as the main entry point for the automation engine.
 * It provides a simplified API for common use cases.
 */

require('dotenv').config();

const {
  processOrder,
  submitViaEmail,
  submitViaMast,
  submitViaPortal,
  preparePhysicalSubmission,
  logger
} = require('./automation');

const config = require('./config.example');

/**
 * Main API Class
 */
class AshurTaboEngine {
  constructor(configOverrides = {}) {
    this.config = { ...config, ...configOverrides };
    this.statusCallbacks = this.config.statusCallbacks || {};
    logger.info('AshurTabo Engine initialized');
  }

  /**
   * Process an order with automatic municipality lookup
   */
  async submitOrder(orderId, propertyAddress, parcelNumber, documents, municipalityName = null) {
    logger.info('Processing order via main API', { orderId, propertyAddress });

    const order = {
      id: orderId,
      propertyAddress,
      parcelNumber,
      documents,
      ownerName: propertyAddress, // Should be provided separately in real use
      senderName: 'User',
      senderEmail: process.env.SENDER_EMAIL,
      senderPhone: 'Not provided'
    };

    let municipality = null;

    if (municipalityName) {
      municipality = this.config.municipalities[municipalityName];
      if (!municipality) {
        throw new Error(`Municipality not configured: ${municipalityName}`);
      }
    } else {
      // Auto-detect based on address
      municipality = this.autoDetectMunicipality(propertyAddress);
      if (!municipality) {
        throw new Error('Could not auto-detect municipality from address');
      }
    }

    const onStatusChange = (id, status, details) => {
      this.statusCallbacks.onStatusChange?.(id, status, details);
    };

    return processOrder(order, municipality, onStatusChange);
  }

  /**
   * Auto-detect municipality from address (simple implementation)
   */
  autoDetectMunicipality(address) {
    const addressLower = address.toLowerCase();

    for (const [name, config] of Object.entries(this.config.municipalities)) {
      if (addressLower.includes(config.city.toLowerCase())) {
        return config;
      }
    }

    return null;
  }

  /**
   * Get configured municipalities
   */
  getMunicipalities() {
    return Object.keys(this.config.municipalities);
  }

  /**
   * Get municipality details
   */
  getMunicipalityDetails(municipalityName) {
    return this.config.municipalities[municipalityName] || null;
  }

  /**
   * Validate order data
   */
  validateOrder(order) {
    const requiredFields = ['id', 'propertyAddress', 'parcelNumber', 'documents'];
    const missingFields = requiredFields.filter(field => !order[field]);

    if (missingFields.length > 0) {
      throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
    }

    const requiredDocs = ['poa', 'saleContract', 'idCopies', 'arnonaForm'];
    const missingDocs = requiredDocs.filter(doc => !order.documents[doc]);

    if (missingDocs.length > 0) {
      logger.warn(`Missing documents: ${missingDocs.join(', ')}`);
    }

    return true;
  }

  /**
   * Submit order with full validation
   */
  async submitOrderWithValidation(order, municipality) {
    this.validateOrder(order);

    const onStatusChange = (id, status, details) => {
      this.statusCallbacks.onStatusChange?.(id, status, details);
    };

    return processOrder(order, municipality, onStatusChange);
  }

  /**
   * Get submission history (placeholder for database integration)
   */
  async getSubmissionHistory(orderId) {
    logger.info('Retrieving submission history', { orderId });
    // This would connect to a database in production
    return {
      orderId,
      submissions: [],
      message: 'Database integration required for history'
    };
  }

  /**
   * Retry a failed submission
   */
  async retrySubmission(orderId, municipality) {
    logger.info('Retrying submission', { orderId });
    // Would retrieve order from database and resubmit
    throw new Error('Database integration required for retry functionality');
  }
}

/**
 * Export main API and utilities
 */
module.exports = {
  AshurTaboEngine,
  processOrder,
  submitViaEmail,
  submitViaMast,
  submitViaPortal,
  preparePhysicalSubmission,
  logger
};

/**
 * Convenience function for quick submission
 */
async function quickSubmit(order, municipalityName) {
  const engine = new AshurTaboEngine();
  return engine.submitOrderWithValidation(order, engine.getMunicipalityDetails(municipalityName));
}

// Export quick submit
module.exports.quickSubmit = quickSubmit;

// Example: If run directly
if (require.main === module) {
  console.log('אישורטאבו Automation Engine');
  console.log('=============================\n');
  console.log('Usage:');
  console.log('  const { AshurTaboEngine } = require("./index");');
  console.log('  const engine = new AshurTaboEngine();');
  console.log('  const result = await engine.submitOrder(...);');
  console.log('\nSee example-usage.js for detailed examples.');
}
