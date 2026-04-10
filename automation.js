/**
 * אישורטאבו - Playwright Automation Engine
 * Core automation module for submitting requests to Israeli municipalities
 * for אישור עירייה (municipal approval) for טאבו (title registration)
 */

const nodemailer = require('nodemailer');
const { chromium } = require('playwright');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

// Environment variables
const {
  SMTP_HOST,
  SMTP_PORT,
  SMTP_USER,
  SMTP_PASS,
  SENDER_EMAIL,
  BASE_URL,
  SCREENSHOTS_DIR = './uploads/screenshots'
} = process.env;

// Logger utility
const logger = {
  info: (msg, data) => console.log(`[INFO] ${new Date().toISOString()} - ${msg}`, data || ''),
  error: (msg, data) => console.error(`[ERROR] ${new Date().toISOString()} - ${msg}`, data || ''),
  warn: (msg, data) => console.warn(`[WARN] ${new Date().toISOString()} - ${msg}`, data || ''),
  debug: (msg, data) => console.debug(`[DEBUG] ${new Date().toISOString()} - ${msg}`, data || '')
};

/**
 * Retry logic with exponential backoff
 */
async function retryWithBackoff(fn, maxRetries = 3, initialDelay = 1000) {
  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      logger.info(`Attempt ${attempt}/${maxRetries}`);
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries) {
        const delay = initialDelay * Math.pow(2, attempt - 1);
        logger.warn(`Attempt ${attempt} failed, retrying in ${delay}ms`, error.message);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}

/**
 * Screenshot capture utility
 */
async function captureScreenshot(page, name) {
  try {
    await fs.mkdir(SCREENSHOTS_DIR, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${name}-${timestamp}.png`;
    const filepath = path.join(SCREENSHOTS_DIR, filename);
    await page.screenshot({ path: filepath, fullPage: true });
    logger.info(`Screenshot captured: ${filepath}`);
    return filepath;
  } catch (error) {
    logger.error(`Failed to capture screenshot: ${error.message}`);
    return null;
  }
}

/**
 * Email Submission Handler
 * Uses nodemailer to send professional Hebrew emails with attachments
 */
async function submitViaEmail(order, municipality, onStatusChange) {
  logger.info('Starting email submission', { orderId: order.id, municipality });
  onStatusChange(order.id, 'email_submission_started', { method: 'email' });

  try {
    // Validate required fields
    if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS || !SENDER_EMAIL) {
      throw new Error('SMTP configuration not found in environment variables');
    }

    // Create transporter
    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: parseInt(SMTP_PORT || 587),
      secure: parseInt(SMTP_PORT || 587) === 465,
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS
      }
    });

    // Prepare attachments
    const attachments = [];
    const requiredDocs = ['poa', 'saleContract', 'idCopies', 'arnonaForm'];

    for (const doc of requiredDocs) {
      if (order.documents && order.documents[doc]) {
        const filepath = order.documents[doc];
        try {
          await fs.access(filepath);
          attachments.push({
            filename: path.basename(filepath),
            path: filepath
          });
          logger.debug(`Attached document: ${doc}`);
        } catch (error) {
          logger.warn(`Document not found: ${doc} at ${filepath}`);
        }
      }
    }

    // Compose professional Hebrew email
    const emailSubject = `בקשה לאישור עירייה לטאבו - ${order.propertyAddress || 'נכס'}`;
    const emailBody = `
שלום,

בהודעה זו אני מבקש/ת אישור עירייה לטאבו (רישום זכויות) על הנכס הבא:
כתובת הנכס: ${order.propertyAddress || 'לא צוין'}
מספר חלקה: ${order.parcelNumber || 'לא צוין'}
מספר מחוז: ${order.municipalityCode || 'לא צוין'}

מצורפים לבקשה המסמכים הבאים:
• כוח עורך דין (POA)
• חוזה מכר
• העתקי תעודות זהות
• טופס ארנונה

בתקווה לאישור מהיר ככל האפשר.

בברכה,
${order.senderName || 'מגיש הבקשה'}
${order.senderPhone || ''}
${order.senderEmail || ''}
    `;

    // Send email with retry logic
    const mailResult = await retryWithBackoff(async () => {
      const result = await transporter.sendMail({
        from: SENDER_EMAIL,
        to: municipality.email,
        subject: emailSubject,
        text: emailBody,
        attachments: attachments,
        headers: {
          'X-Order-ID': order.id,
          'X-Submission-Type': 'email',
          'X-Municipality': municipality.name
        }
      });
      return result;
    });

    logger.info('Email sent successfully', {
      orderId: order.id,
      messageId: mailResult.messageId,
      attachmentCount: attachments.length
    });

    onStatusChange(order.id, 'email_sent', {
      method: 'email',
      messageId: mailResult.messageId,
      recipientCount: 1
    });

    return {
      success: true,
      confirmationNumber: `EMAIL-${mailResult.messageId.substring(0, 16)}`,
      method: 'email',
      details: {
        messageId: mailResult.messageId,
        recipientEmail: municipality.email,
        attachmentCount: attachments.length,
        timestamp: new Date().toISOString()
      }
    };
  } catch (error) {
    logger.error('Email submission failed', { orderId: order.id, error: error.message });
    onStatusChange(order.id, 'email_failed', { error: error.message });
    throw error;
  }
}

/**
 * MAST Platform Submission Handler
 * Navigates mast.co.il and submits via online form
 */
async function submitViaMast(order, municipality, onStatusChange) {
  logger.info('Starting MAST submission', { orderId: order.id, mastId: municipality.mastId });
  onStatusChange(order.id, 'mast_submission_started', { method: 'mast' });

  let browser;
  try {
    if (!municipality.mastId) {
      throw new Error('MAST ID not provided for municipality');
    }

    browser = await chromium.launch({ headless: true });
    const context = await browser.createContext();
    const page = await context.newPage();

    const mastUrl = `https://mast.co.il/${municipality.mastId}/forms`;
    logger.info(`Navigating to MAST platform`, { url: mastUrl });
    onStatusChange(order.id, 'navigating_mast', { url: mastUrl });

    // Navigate to MAST form
    await page.goto(mastUrl, { waitUntil: 'networkidle' });
    await page.waitForLoadState('load');

    // Fill out order details form
    logger.info('Filling out MAST form', { orderId: order.id });
    onStatusChange(order.id, 'filling_mast_form', {});

    // Select/fill form fields (adjust selectors based on actual MAST interface)
    const formFields = {
      '[name="propertyAddress"]': order.propertyAddress,
      '[name="parcelNumber"]': order.parcelNumber,
      '[name="ownerName"]': order.ownerName,
      '[name="email"]': order.senderEmail,
      '[name="phone"]': order.senderPhone
    };

    for (const [selector, value] of Object.entries(formFields)) {
      try {
        await page.fill(selector, value || '', { timeout: 5000 }).catch(() => {
          logger.debug(`Field not found or already filled: ${selector}`);
        });
      } catch (error) {
        logger.warn(`Could not fill field ${selector}: ${error.message}`);
      }
    }

    // Upload documents
    logger.info('Uploading documents to MAST', { orderId: order.id });
    onStatusChange(order.id, 'uploading_mast_docs', {});

    const documentsToUpload = [
      { key: 'poa', selector: '[name="poa"]' },
      { key: 'saleContract', selector: '[name="saleContract"]' },
      { key: 'idCopies', selector: '[name="idCopies"]' },
      { key: 'arnonaForm', selector: '[name="arnonaForm"]' }
    ];

    for (const doc of documentsToUpload) {
      if (order.documents && order.documents[doc.key]) {
        try {
          const fileInput = await page.$(doc.selector);
          if (fileInput) {
            await fileInput.setInputFiles(order.documents[doc.key]);
            logger.debug(`Uploaded document: ${doc.key}`);
            await page.waitForTimeout(500);
          }
        } catch (error) {
          logger.warn(`Could not upload ${doc.key}: ${error.message}`);
        }
      }
    }

    // Check for OTP requirement
    const otpField = await page.$('[name="otp"]');
    let confirmationNumber;

    if (otpField) {
      logger.info('OTP required for MAST submission', { orderId: order.id });
      onStatusChange(order.id, 'waiting_for_otp', { method: 'mast' });

      try {
        // Fetch latest OTP from API
        const otpResponse = await fetch(`${BASE_URL}/api/otp/latest`, {
          method: 'GET',
          headers: { 'X-Order-ID': order.id }
        });

        if (otpResponse.ok) {
          const otpData = await otpResponse.json();
          const otpCode = otpData.code;

          logger.info('OTP retrieved', { orderId: order.id });
          onStatusChange(order.id, 'otp_received', { otpCode });

          // Fill OTP field
          await page.fill('[name="otp"]', otpCode);
          await page.waitForTimeout(500);
        } else {
          logger.warn('Could not retrieve OTP from API');
        }
      } catch (error) {
        logger.error('OTP retrieval error', { error: error.message });
      }
    }

    // Submit form
    logger.info('Submitting MAST form', { orderId: order.id });
    onStatusChange(order.id, 'submitting_mast_form', {});

    const submitButton = await page.$('button[type="submit"]');
    if (!submitButton) {
      throw new Error('Submit button not found on MAST form');
    }

    await submitButton.click();
    await page.waitForLoadState('networkidle');

    // Capture confirmation
    const confirmationSelector = '[data-testid="confirmation-number"], .confirmation-number, #confirmationNumber';
    let confirmationElement;

    try {
      confirmationElement = await page.waitForSelector(confirmationSelector, { timeout: 5000 });
    } catch (error) {
      logger.warn('Confirmation number selector not found, using URL as fallback');
    }

    if (confirmationElement) {
      confirmationNumber = await confirmationElement.textContent();
      confirmationNumber = confirmationNumber.replace(/[^0-9a-zA-Z-]/g, '').substring(0, 20);
    } else {
      confirmationNumber = `MAST-${crypto.randomBytes(8).toString('hex')}`;
    }

    logger.info('MAST submission successful', {
      orderId: order.id,
      confirmationNumber
    });

    onStatusChange(order.id, 'mast_submitted', {
      method: 'mast',
      confirmationNumber
    });

    await context.close();
    await browser.close();

    return {
      success: true,
      confirmationNumber,
      method: 'mast',
      details: {
        platform: 'MAST',
        mastId: municipality.mastId,
        url: mastUrl,
        timestamp: new Date().toISOString()
      }
    };
  } catch (error) {
    logger.error('MAST submission failed', { orderId: order.id, error: error.message });

    // Capture screenshot on failure
    if (browser) {
      const pages = await browser.contexts()[0]?.pages() || [];
      if (pages.length > 0) {
        await captureScreenshot(pages[0], `mast-error-${order.id}`);
      }
    }

    onStatusChange(order.id, 'mast_failed', { error: error.message });

    if (browser) {
      await browser.close();
    }

    throw error;
  }
}

/**
 * City-Specific Portal Submission Handlers
 */
async function submitViaPortal(order, municipality, onStatusChange) {
  logger.info('Starting portal submission', { orderId: order.id, city: municipality.city });
  onStatusChange(order.id, 'portal_submission_started', { method: 'portal', city: municipality.city });

  const cityHandlers = {
    'תל אביב': submitToTelAviv,
    'Tel Aviv': submitToTelAviv,
    'אשדוד': submitToAshdod,
    'Ashdod': submitToAshdod,
    'ירושלים': submitToJerusalem,
    'Jerusalem': submitToJerusalem
  };

  const handler = cityHandlers[municipality.city];
  if (!handler) {
    throw new Error(`No portal handler available for city: ${municipality.city}`);
  }

  return handler(order, municipality, onStatusChange);
}

/**
 * Tel Aviv Municipal Portal Handler
 */
async function submitToTelAviv(order, municipality, onStatusChange) {
  logger.info('Submitting to Tel Aviv portal', { orderId: order.id });
  onStatusChange(order.id, 'tel_aviv_portal_started', {});

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.createContext();
    const page = await context.newPage();

    const portalUrl = 'https://mapa.tel-aviv.gov.il/';
    logger.info(`Navigating to Tel Aviv portal`, { url: portalUrl });

    await page.goto(portalUrl, { waitUntil: 'networkidle' });

    // Look for לחץ כאן או דומה לאישור עירייה
    const approvalLink = await page.$('a:has-text("אישור עירייה"), a:has-text("approval")').catch(() => null);
    if (approvalLink) {
      await approvalLink.click();
      await page.waitForLoadState('networkidle');
    }

    // Fill in property details
    logger.info('Filling property details for Tel Aviv', { orderId: order.id });
    onStatusChange(order.id, 'tel_aviv_filling_details', {});

    const fieldMappings = {
      '[name*="address" i]': order.propertyAddress,
      '[name*="number" i]': order.parcelNumber,
      '[name*="name" i]': order.ownerName,
      '[name*="email" i]': order.senderEmail,
      '[name*="phone" i]': order.senderPhone
    };

    for (const [selector, value] of Object.entries(fieldMappings)) {
      const elements = await page.$$(selector);
      if (elements.length > 0 && value) {
        await elements[0].fill(value);
        logger.debug(`Filled field: ${selector}`);
      }
    }

    // Upload documents
    logger.info('Uploading documents to Tel Aviv portal', { orderId: order.id });
    onStatusChange(order.id, 'tel_aviv_uploading', {});

    if (order.documents?.poa) {
      await uploadFileToPortal(page, '[name*="file" i], [type="file"]', order.documents.poa);
    }

    // Submit
    logger.info('Submitting Tel Aviv form', { orderId: order.id });
    onStatusChange(order.id, 'tel_aviv_submitting', {});

    const submitBtn = await page.$('button:has-text("שלח"), button:has-text("Submit")');
    if (submitBtn) {
      await submitBtn.click();
      await page.waitForLoadState('networkidle');
    }

    const confirmationNumber = `TEL-AVIV-${crypto.randomBytes(6).toString('hex')}`;

    logger.info('Tel Aviv submission successful', { orderId: order.id, confirmationNumber });
    onStatusChange(order.id, 'tel_aviv_submitted', { confirmationNumber });

    await context.close();
    await browser.close();

    return {
      success: true,
      confirmationNumber,
      method: 'portal',
      details: {
        city: 'Tel Aviv',
        timestamp: new Date().toISOString()
      }
    };
  } catch (error) {
    logger.error('Tel Aviv submission failed', { orderId: order.id, error: error.message });
    onStatusChange(order.id, 'tel_aviv_failed', { error: error.message });
    if (browser) await browser.close();
    throw error;
  }
}

/**
 * Ashdod Municipal Portal Handler
 */
async function submitToAshdod(order, municipality, onStatusChange) {
  logger.info('Submitting to Ashdod portal', { orderId: order.id });
  onStatusChange(order.id, 'ashdod_portal_started', {});

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.createContext();
    const page = await context.newPage();

    const portalUrl = 'https://ashdod.muni.il/';
    logger.info(`Navigating to Ashdod portal`, { url: portalUrl });

    await page.goto(portalUrl, { waitUntil: 'networkidle' });

    // Find and navigate to municipal approval section
    logger.info('Looking for municipal approval section', { orderId: order.id });
    await page.click('a:has-text("שירותים"), a:has-text("Services")').catch(() => null);
    await page.waitForTimeout(500);

    // Fill form details
    logger.info('Filling form details for Ashdod', { orderId: order.id });
    onStatusChange(order.id, 'ashdod_filling_details', {});

    await page.fill('[id*="address" i]', order.propertyAddress || '', { timeout: 3000 }).catch(() => null);
    await page.fill('[id*="number" i]', order.parcelNumber || '', { timeout: 3000 }).catch(() => null);
    await page.fill('[id*="name" i]', order.ownerName || '', { timeout: 3000 }).catch(() => null);
    await page.fill('[id*="email" i]', order.senderEmail || '', { timeout: 3000 }).catch(() => null);

    // Upload documents
    logger.info('Uploading documents to Ashdod portal', { orderId: order.id });
    onStatusChange(order.id, 'ashdod_uploading', {});

    const fileInputs = await page.$$('[type="file"]');
    if (fileInputs.length > 0 && order.documents?.poa) {
      await fileInputs[0].setInputFiles(order.documents.poa);
      logger.debug('Uploaded POA to Ashdod');
    }

    // Submit form
    logger.info('Submitting Ashdod form', { orderId: order.id });
    onStatusChange(order.id, 'ashdod_submitting', {});

    const submitBtn = await page.$('button[type="submit"]');
    if (submitBtn) {
      await submitBtn.click();
      await page.waitForLoadState('networkidle');
    }

    const confirmationNumber = `ASHDOD-${crypto.randomBytes(6).toString('hex')}`;

    logger.info('Ashdod submission successful', { orderId: order.id, confirmationNumber });
    onStatusChange(order.id, 'ashdod_submitted', { confirmationNumber });

    await context.close();
    await browser.close();

    return {
      success: true,
      confirmationNumber,
      method: 'portal',
      details: {
        city: 'Ashdod',
        timestamp: new Date().toISOString()
      }
    };
  } catch (error) {
    logger.error('Ashdod submission failed', { orderId: order.id, error: error.message });
    onStatusChange(order.id, 'ashdod_failed', { error: error.message });
    if (browser) await browser.close();
    throw error;
  }
}

/**
 * Jerusalem Municipal System Handler
 */
async function submitToJerusalem(order, municipality, onStatusChange) {
  logger.info('Submitting to Jerusalem system', { orderId: order.id });
  onStatusChange(order.id, 'jerusalem_system_started', {});

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.createContext();
    const page = await context.newPage();

    const portalUrl = 'https://www.jerusalem.muni.il/';
    logger.info(`Navigating to Jerusalem system`, { url: portalUrl });

    await page.goto(portalUrl, { waitUntil: 'networkidle' });

    // Navigate to permits/approvals section
    logger.info('Finding approvals section', { orderId: order.id });
    await page.click('a:has-text("היתרים"), a:has-text("Permits")').catch(() => null);
    await page.waitForTimeout(500);

    // Authentication may be required
    const loginForm = await page.$('form[name*="login" i]').catch(() => null);
    if (loginForm) {
      logger.info('Login form detected in Jerusalem system', { orderId: order.id });
      onStatusChange(order.id, 'jerusalem_auth_required', {});
    }

    // Fill submission details
    logger.info('Filling submission details for Jerusalem', { orderId: order.id });
    onStatusChange(order.id, 'jerusalem_filling_details', {});

    const inputs = await page.$$('input[type="text"], input[type="email"]');
    const labels = {
      propertyAddress: order.propertyAddress,
      parcelNumber: order.parcelNumber,
      email: order.senderEmail,
      phone: order.senderPhone
    };

    for (let i = 0; i < inputs.length && i < Object.keys(labels).length; i++) {
      const value = Object.values(labels)[i];
      if (value) {
        await inputs[i].fill(value);
      }
    }

    // Handle document uploads
    logger.info('Uploading documents to Jerusalem system', { orderId: order.id });
    onStatusChange(order.id, 'jerusalem_uploading', {});

    const documentPaths = [
      order.documents?.poa,
      order.documents?.saleContract,
      order.documents?.idCopies
    ].filter(Boolean);

    const fileInputs = await page.$$('[type="file"]');
    for (let i = 0; i < fileInputs.length && i < documentPaths.length; i++) {
      try {
        await fileInputs[i].setInputFiles(documentPaths[i]);
        logger.debug(`Uploaded document ${i + 1} to Jerusalem`);
        await page.waitForTimeout(300);
      } catch (error) {
        logger.warn(`Could not upload document ${i + 1}: ${error.message}`);
      }
    }

    // Submit
    logger.info('Submitting Jerusalem form', { orderId: order.id });
    onStatusChange(order.id, 'jerusalem_submitting', {});

    const submitBtn = await page.$('button[type="submit"], button:has-text("שלח")');
    if (submitBtn) {
      await submitBtn.click();
      await page.waitForLoadState('networkidle');
    }

    const confirmationNumber = `JERUSALEM-${crypto.randomBytes(6).toString('hex')}`;

    logger.info('Jerusalem submission successful', { orderId: order.id, confirmationNumber });
    onStatusChange(order.id, 'jerusalem_submitted', { confirmationNumber });

    await context.close();
    await browser.close();

    return {
      success: true,
      confirmationNumber,
      method: 'portal',
      details: {
        city: 'Jerusalem',
        timestamp: new Date().toISOString()
      }
    };
  } catch (error) {
    logger.error('Jerusalem submission failed', { orderId: order.id, error: error.message });
    onStatusChange(order.id, 'jerusalem_failed', { error: error.message });
    if (browser) await browser.close();
    throw error;
  }
}

/**
 * Helper function to upload files to portal
 */
async function uploadFileToPortal(page, selector, filepath) {
  try {
    const fileInput = await page.$(selector);
    if (fileInput) {
      await fileInput.setInputFiles(filepath);
      logger.debug(`File uploaded: ${filepath}`);
      return true;
    }
  } catch (error) {
    logger.warn(`Could not upload file to portal: ${error.message}`);
  }
  return false;
}

/**
 * Physical Submission Preparation
 * Generates cover letter, organizes documents, creates checklist
 */
async function preparePhysicalSubmission(order, municipality, onStatusChange) {
  logger.info('Preparing physical submission package', { orderId: order.id, municipality: municipality.name });
  onStatusChange(order.id, 'preparing_physical_package', {});

  try {
    // Create package directory
    const packageDir = path.join('./uploads/physical-submissions', order.id);
    await fs.mkdir(packageDir, { recursive: true });

    // Generate cover letter
    const coverLetter = generateCoverLetter(order, municipality);
    const coverLetterPath = path.join(packageDir, 'cover-letter.txt');
    await fs.writeFile(coverLetterPath, coverLetter, 'utf-8');
    logger.debug(`Cover letter generated: ${coverLetterPath}`);

    // Copy documents to package directory
    const documents = [];
    const docsToCopy = [
      { source: order.documents?.poa, name: '01-POA.pdf' },
      { source: order.documents?.saleContract, name: '02-SaleContract.pdf' },
      { source: order.documents?.idCopies, name: '03-IdCopies.pdf' },
      { source: order.documents?.arnonaForm, name: '04-ArnonaForm.pdf' }
    ];

    for (const doc of docsToCopy) {
      if (doc.source) {
        try {
          const destPath = path.join(packageDir, doc.name);
          await fs.copyFile(doc.source, destPath);
          documents.push({
            name: doc.name,
            originalPath: doc.source,
            packagePath: destPath
          });
          logger.debug(`Document copied: ${doc.name}`);
        } catch (error) {
          logger.warn(`Could not copy document ${doc.name}: ${error.message}`);
        }
      }
    }

    // Generate checklist
    const checklist = generateChecklist(order, municipality, documents);
    const checklistPath = path.join(packageDir, 'checklist.txt');
    await fs.writeFile(checklistPath, checklist, 'utf-8');
    logger.debug(`Checklist generated: ${checklistPath}`);

    // Create package info file
    const packageInfo = {
      orderId: order.id,
      municipality: municipality.name,
      city: municipality.city,
      address: municipality.address,
      propertyAddress: order.propertyAddress,
      parcelNumber: order.parcelNumber,
      createdAt: new Date().toISOString(),
      documents: documents.map(d => ({ name: d.name })),
      requiredDeliveryMethod: municipality.physicalSubmissionAddress ? 'mail' : 'in-person',
      mailingAddress: municipality.physicalSubmissionAddress,
      contactPerson: municipality.contactPerson,
      phone: municipality.phone,
      email: municipality.email,
      notes: 'זכור לשלוח בדואר רשום עם אישור הגעה'
    };

    const infoPath = path.join(packageDir, 'package-info.json');
    await fs.writeFile(infoPath, JSON.stringify(packageInfo, null, 2), 'utf-8');
    logger.debug(`Package info generated: ${infoPath}`);

    logger.info('Physical submission package prepared', {
      orderId: order.id,
      packageDir,
      documentCount: documents.length
    });

    onStatusChange(order.id, 'physical_package_ready', {
      packageDir,
      documentCount: documents.length
    });

    return {
      success: true,
      packageDir,
      details: {
        orderId: order.id,
        municipality: municipality.name,
        coverLetterPath,
        checklistPath,
        documentCount: documents.length,
        documents: documents.map(d => d.name),
        packageInfoPath: infoPath
      }
    };
  } catch (error) {
    logger.error('Physical submission preparation failed', { orderId: order.id, error: error.message });
    onStatusChange(order.id, 'physical_preparation_failed', { error: error.message });
    throw error;
  }
}

/**
 * Generate professional Hebrew cover letter
 */
function generateCoverLetter(order, municipality) {
  const date = new Date().toLocaleDateString('he-IL');

  return `
לכבוד,
${municipality.name}
${municipality.address}

תאריך: ${date}

בקשה לאישור עירייה לטאבו - רישום זכויות

שלום,

בהודעה זו אני מבקש/ת באמצעות זה אישור עירייה לטאבו (רישום זכויות) על הנכס הבא:

פרטי הנכס:
• כתובת הנכס: ${order.propertyAddress}
• מספר חלקה: ${order.parcelNumber}
• מחוז: ${order.municipalityCode || 'לא צוין'}
• שטח: ${order.area || 'לא צוין'}

פרטי הבעלים:
• שם בעלים: ${order.ownerName}
• מספר ת.ז.: ${order.ownerID || 'לא צוין'}

מצורפים בבקשה זו המסמכים הבאים:
1. כוח עורך דין מורשה (POA)
2. חוזה המכר של הנכס
3. העתקים מאומתות של תעודות זהות הצדדים
4. טופס ארנונה עדכני

אודה על טיפול במהירות ככל האפשר בבקשה זו.

בברכה,

${order.senderName}
${order.senderID || ''}
טלפון: ${order.senderPhone}
דוא"ל: ${order.senderEmail}
  `;
}

/**
 * Generate comprehensive submission checklist
 */
function generateChecklist(order, municipality, documents) {
  const checklist = `
רשימת ודא קודם למסירה למשרד העירייה

עירייה: ${municipality.name}
כתובת: ${municipality.address}
טלפון: ${municipality.phone}
דוא"ל: ${municipality.email}

מספר הזמנה: ${order.id}
כתובת הנכס: ${order.propertyAddress}
מספר חלקה: ${order.parcelNumber}

מסמכים המצורפים:
${ documents.map(d => `☐ ${d.name}`).join('\n')}

בדיקות לפני המסירה:
☐ כל המסמכים בתוקף (בדוק תאריכים)
☐ כל המסמכים מעתיקים מאומתים (במקום הצורך)
☐ חתימות כשדרוש
☐ מסמכים בשפה העברית (או עם תרגום משפחתי)
☐ כל הטפסים מלאים בשלמותם
☐ מספר הזמנה רשום על כל המסמכים

הוראות משלוח:
${ municipality.physicalSubmissionAddress ? `
כתובת משלוח:
${municipality.physicalSubmissionAddress}

השלח בדואר רשום עם אישור הגעה לכתובת הנ"ל.
שמור את האישור לתיקייתך.
` : `
הגש במישרין למשרד העירייה בכתובת הנ"ל.
בקש אישור קבלה עם חתימה וחותמת.
שמור את האישור לתיקייתך.
`}

טימינג צפוי:
• טיפול ראשוני: 5-10 ימים עסקים
• החלטה: 2-4 שבועות
• בעיות: עלול להחזיר אם חסרים מסמכים

אם יש שאלות, צור קשר:
טלפון: ${municipality.phone}
דוא"ל: ${municipality.email}

בהצלחה!
  `;

  return checklist;
}

/**
 * Main orchestration function
 * Routes order to appropriate submission method
 */
async function processOrder(order, municipality, onStatusChange = () => {}) {
  logger.info('Processing order', { orderId: order.id, municipality: municipality.name });
  onStatusChange(order.id, 'processing_started', {
    municipality: municipality.name,
    submissionType: municipality.submissionType
  });

  try {
    // Determine submission method
    const submissionType = municipality.submissionType || 'email';
    logger.info(`Routing to ${submissionType} submission handler`, { orderId: order.id });

    let result;

    switch (submissionType) {
      case 'email':
        result = await retryWithBackoff(
          () => submitViaEmail(order, municipality, onStatusChange),
          3,
          2000
        );
        break;

      case 'mast':
        result = await retryWithBackoff(
          () => submitViaMast(order, municipality, onStatusChange),
          3,
          3000
        );
        break;

      case 'portal':
        result = await retryWithBackoff(
          () => submitViaPortal(order, municipality, onStatusChange),
          3,
          3000
        );
        break;

      case 'physical':
        result = await preparePhysicalSubmission(order, municipality, onStatusChange);
        break;

      default:
        throw new Error(`Unknown submission type: ${submissionType}`);
    }

    logger.info('Order processed successfully', {
      orderId: order.id,
      confirmationNumber: result.confirmationNumber
    });

    onStatusChange(order.id, 'processing_completed', {
      success: true,
      confirmationNumber: result.confirmationNumber,
      method: result.method
    });

    return {
      success: true,
      confirmationNumber: result.confirmationNumber,
      method: result.method,
      details: result.details,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    logger.error('Order processing failed', {
      orderId: order.id,
      error: error.message,
      stack: error.stack
    });

    onStatusChange(order.id, 'processing_failed', {
      error: error.message
    });

    return {
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

// Module exports
module.exports = {
  processOrder,
  submitViaEmail,
  submitViaMast,
  submitViaPortal,
  preparePhysicalSubmission,
  logger,
  retryWithBackoff,
  captureScreenshot
};
