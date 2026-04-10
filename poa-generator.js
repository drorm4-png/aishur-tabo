const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

/**
 * Power of Attorney (ייפוי כוח) PDF Generator for Israeli Real Estate Transactions
 *
 * Generates a professional Hebrew Power of Attorney document that authorizes
 * DML (עו"ד דרור מגן - משרד עורכי דין) to act on behalf of the client to obtain
 * municipal approval certificates (אישור עירייה) for real estate title registration (טאבו).
 *
 * Supports embedding digital signatures as PNG images into the PDF.
 */

/**
 * Formats a date in Hebrew format
 * @param {Date} date
 * @returns {string} Formatted date string
 */
function formatHebrewDate(date = new Date()) {
  const day = date.getDate();
  const month = date.getMonth() + 1;
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

/**
 * Generates a Power of Attorney PDF document
 *
 * @param {object} orderData - Order/transaction data
 * @param {string} orderData.sellerName - Client name (the person granting POA)
 * @param {string} orderData.sellerId - Client ID number
 * @param {string} orderData.buyerName - Buyer name (optional)
 * @param {string} orderData.buyerId - Buyer ID number (optional)
 * @param {string} orderData.municipality - Municipality name
 * @param {string} orderData.block - Parcel block (גוש)
 * @param {string} orderData.parcel - Parcel number (חלקה)
 * @param {string} orderData.propertyAddress - Full property address
 * @param {string} orderData.transactionType - Type of transaction
 * @param {string} orderData.sellerAddress - Client's address (optional)
 * @param {string} [orderData.signatureData] - Base64 PNG of digital signature
 * @param {string} [orderData.signedAt] - ISO timestamp of when signature was made
 * @returns {PDFDocument} PDF document stream
 */
function generatePOA(orderData) {
  if (!orderData || typeof orderData !== 'object') {
    throw new Error('orderData must be a valid object');
  }

  const requiredFields = ['sellerName', 'sellerId', 'municipality', 'block', 'parcel', 'propertyAddress'];
  for (const field of requiredFields) {
    if (!orderData[field]) {
      throw new Error(`Missing required field: ${field}`);
    }
  }

  const doc = new PDFDocument({
    size: 'A4',
    margin: 50,
    bufferPages: true
  });

  const pageWidth = doc.page.width;
  const margin = 50;
  const contentWidth = pageWidth - 2 * margin;
  const today = formatHebrewDate();
  const signedAt = orderData.signedAt ? new Date(orderData.signedAt).toLocaleString('he-IL') : today;

  // Helper
  const addSpacing = (space = 12) => {
    const lh = doc.currentLineHeight() || 14;
    doc.moveDown(space / lh);
  };

  const textOpts = { align: 'right', width: contentWidth, lineGap: 5 };

  // ==================== TITLE ====================
  doc.fontSize(22)
    .font('Helvetica-Bold')
    .text('ייפוי כוח', margin, 50, { align: 'center', width: contentWidth });

  addSpacing(6);

  doc.fontSize(11)
    .font('Helvetica')
    .text('Power of Attorney', margin, doc.y, { align: 'center', width: contentWidth });

  addSpacing(20);

  // ==================== OPENING ====================
  doc.fontSize(10)
    .font('Helvetica')
    .text('אני הח"מ:', margin, doc.y, textOpts);

  addSpacing(8);

  // Client details table
  const details = [
    ['שם:', orderData.sellerName],
    ['ת.ז.:', orderData.sellerId],
    ['כתובת:', orderData.sellerAddress || '—']
  ];

  doc.fontSize(10);
  for (const [label, value] of details) {
    doc.font('Helvetica').text(label, margin + 20, doc.y, { width: 80, align: 'left', continued: false });
    const ly = doc.y - 14;
    doc.font('Helvetica-Bold').text(value, margin + 110, ly, { width: contentWidth - 130, align: 'left' });
  }

  addSpacing(16);

  // ==================== DECLARATION ====================
  doc.fontSize(10)
    .font('Helvetica')
    .text(
      'מצהיר/ה בזאת כי אני מייפה את כוחו של עו"ד דרור מגן, ממשרד עורכי דין DML ' +
      '(להלן: "הנציג"), לפעול בשמי ובמקומי בכל הקשור להשגת אישור עירייה לטאבו ' +
      'עבור הנכס המפורט להלן.',
      margin, doc.y, textOpts
    );

  addSpacing(18);

  // ==================== PROPERTY DETAILS ====================
  doc.fontSize(11)
    .font('Helvetica-Bold')
    .text('פרטי הנכס:', margin, doc.y, textOpts);

  addSpacing(8);

  const propDetails = [
    ['עירייה/רשות מקומית:', orderData.municipality],
    ['גוש:', orderData.block],
    ['חלקה:', orderData.parcel],
    ['כתובת הנכס:', orderData.propertyAddress]
  ];

  doc.fontSize(10);
  for (const [label, value] of propDetails) {
    doc.font('Helvetica').text(label, margin + 20, doc.y, { width: 120, align: 'left', continued: false });
    const ly = doc.y - 14;
    doc.font('Helvetica-Bold').text(value, margin + 150, ly, { width: contentWidth - 170, align: 'left' });
  }

  addSpacing(18);

  // ==================== ATTORNEY DETAILS ====================
  doc.fontSize(11)
    .font('Helvetica-Bold')
    .text('פרטי הנציג המורשה:', margin, doc.y, textOpts);

  addSpacing(8);

  doc.fontSize(10).font('Helvetica');
  doc.text('שם: עו"ד דרור מגן', margin + 20, doc.y, textOpts);
  doc.text('משרד: משרד עורכי דין DML', margin + 20, doc.y, textOpts);

  addSpacing(18);

  // ==================== POWERS ====================
  doc.fontSize(11)
    .font('Helvetica-Bold')
    .text('סמכויות הנציג:', margin, doc.y, textOpts);

  addSpacing(8);

  const powers = [
    'להגיש בקשות וטפסים לרשות המקומית לשם קבלת אישור עירייה לטאבו.',
    'לחתום בשמי על כל מסמך הנדרש לשם השלמת התהליך.',
    'לנהל התכתבות עם הרשות המקומית והרשויות הרלוונטיות.',
    'לקבל בשמי כל אישור, מסמך והודעה מהרשויות.',
    'לבצע כל פעולה סבירה הנדרשת להשלמת התהליך.'
  ];

  doc.fontSize(10).font('Helvetica');
  for (let i = 0; i < powers.length; i++) {
    doc.text(`${i + 1}. ${powers[i]}`, margin + 20, doc.y, { ...textOpts, width: contentWidth - 40 });
    addSpacing(4);
  }

  addSpacing(14);

  // ==================== LIMITATIONS ====================
  doc.fontSize(11)
    .font('Helvetica-Bold')
    .text('מגבלות:', margin, doc.y, textOpts);

  addSpacing(8);

  doc.fontSize(10)
    .font('Helvetica')
    .text(
      'ייפוי כוח זה מוגבל אך ורק להשגת אישור עירייה לטאבו עבור הנכס המפורט לעיל. ' +
      'הנציג אינו מוסמך לחתום על חוזי מכר או כל הסכם אחר שאינו קשור ישירות לקבלת האישור.',
      margin, doc.y, textOpts
    );

  addSpacing(14);

  // ==================== VALIDITY ====================
  doc.fontSize(11)
    .font('Helvetica-Bold')
    .text('תוקף:', margin, doc.y, textOpts);

  addSpacing(8);

  doc.fontSize(10)
    .font('Helvetica')
    .text(
      'ייפוי כוח זה בתוקף מיום חתימתו ועד להשלמת תהליך קבלת אישור העירייה לטאבו, ' +
      'או עד לביטולו בכתב על ידי החותם.',
      margin, doc.y, textOpts
    );

  addSpacing(14);

  // ==================== DIGITAL SIGNATURE CLAUSE ====================
  doc.fontSize(10)
    .font('Helvetica')
    .text(
      'אני מאשר/ת כי חתימתי הדיגיטלית על מסמך זה שקולה לחתימה פיזית ובעלת תוקף משפטי מחייב.',
      margin, doc.y, textOpts
    );

  addSpacing(24);

  // ==================== SIGNATURE SECTION ====================
  doc.fontSize(10).font('Helvetica');
  doc.text(`תאריך חתימה: ${signedAt}`, margin, doc.y, textOpts);

  addSpacing(14);

  doc.text('חתימה:', margin, doc.y, textOpts);

  addSpacing(6);

  // Embed digital signature image if provided
  if (orderData.signatureData) {
    try {
      // Remove data URL prefix to get raw base64
      const base64Data = orderData.signatureData.replace(/^data:image\/\w+;base64,/, '');
      const sigBuffer = Buffer.from(base64Data, 'base64');

      doc.image(sigBuffer, margin + 150, doc.y, {
        width: 200,
        height: 80,
        fit: [200, 80]
      });

      doc.moveDown(6);
    } catch (err) {
      // If signature embedding fails, leave a line for manual signature
      doc.text('________________________', margin + 150, doc.y);
      addSpacing(8);
    }
  } else {
    // No digital signature — leave blank line
    doc.text('________________________', margin + 150, doc.y);
    addSpacing(8);
  }

  doc.text(orderData.sellerName, margin + 150, doc.y, { width: 200, align: 'center' });

  addSpacing(20);

  // ==================== FOOTER ====================
  const footerY = doc.page.height - 80;

  doc.fontSize(8)
    .font('Helvetica')
    .text(
      'מסמך זה נוצר באופן דיגיטלי בפלטפורמת אישורטאבו. ' +
      'החתימה הדיגיטלית מאומתת ונשמרת במערכת לצורכי תיעוד.',
      margin, footerY,
      { align: 'center', width: contentWidth, lineGap: 3 }
    );

  doc.fontSize(7)
    .text(
      `Generated by אישורטאבו | ${formatHebrewDate()} | DML Law Firm`,
      margin, doc.page.height - 30,
      { align: 'center', width: contentWidth }
    );

  doc.end();
  return doc;
}

/**
 * Generates a Power of Attorney PDF and returns it as a Buffer
 */
function generatePOABuffer(orderData) {
  return new Promise((resolve, reject) => {
    try {
      const doc = generatePOA(orderData);
      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Generates a Power of Attorney PDF and saves it to file
 */
function generatePOAToFile(orderData, filePath) {
  return new Promise((resolve, reject) => {
    try {
      const dirPath = path.dirname(filePath);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }

      const doc = generatePOA(orderData);
      const writeStream = fs.createWriteStream(filePath);
      doc.pipe(writeStream);

      writeStream.on('finish', () => resolve(filePath));
      writeStream.on('error', reject);
      doc.on('error', reject);
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Validates order data structure
 */
function validateOrderData(orderData) {
  const errors = [];

  if (!orderData || typeof orderData !== 'object') {
    return { valid: false, errors: ['orderData must be an object'] };
  }

  const requiredFields = {
    sellerName: 'string',
    sellerId: 'string',
    municipality: 'string',
    block: 'string',
    parcel: 'string',
    propertyAddress: 'string'
  };

  for (const [field, type] of Object.entries(requiredFields)) {
    if (!orderData[field]) {
      errors.push(`Missing required field: ${field}`);
    } else if (typeof orderData[field] !== type) {
      errors.push(`Field ${field} must be ${type}, got ${typeof orderData[field]}`);
    }
  }

  const optionalFields = {
    buyerName: 'string',
    buyerId: 'string',
    transactionType: 'string',
    sellerAddress: 'string',
    signatureData: 'string',
    signedAt: 'string'
  };

  for (const [field, type] of Object.entries(optionalFields)) {
    if (orderData[field] && typeof orderData[field] !== type) {
      errors.push(`Optional field ${field} must be ${type}, got ${typeof orderData[field]}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

module.exports = {
  generatePOA,
  generatePOABuffer,
  generatePOAToFile,
  validateOrderData,
  formatHebrewDate
};
