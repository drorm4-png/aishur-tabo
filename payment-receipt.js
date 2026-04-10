/**
 * Payment Receipt Generator Module for אישורטאבו
 * Generates PDF receipts with VAT details for payment transactions
 */

const PDFDocument = require('pdfkit');

// Configuration
const CONFIG = {
  VAT_RATE: 0.17,
  SERVICE_FEE: parseInt(process.env.SERVICE_FEE || '350')
};

/**
 * Generate payment receipt as PDF buffer
 */
async function generatePaymentReceiptPDF(paymentData) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 40,
        bufferPages: true
      });

      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const now = new Date();
      const dateStr = now.toLocaleDateString('he-IL');
      const timeStr = now.toLocaleTimeString('he-IL');

      // Title
      doc.fontSize(22).font('Helvetica-Bold').text('אישורטאבו', { align: 'center' });
      doc.fontSize(11).font('Helvetica').text('IshuruTabu - אישור עירייה לטאבו', { align: 'center' });

      // Receipt title
      doc.moveDown(1);
      doc.fontSize(16).font('Helvetica-Bold').text('קבלה על תשלום', { align: 'center' });

      // Success badge
      doc.moveDown(0.5);
      doc.rect(doc.page.margins.left, doc.y, doc.page.width - doc.page.margins.left - doc.page.margins.right, 30).stroke();
      doc.fontSize(12).font('Helvetica-Bold').text('תשלומך אושר בהצלחה', doc.page.margins.left, doc.y + 8, { align: 'center' });

      doc.moveDown(2);

      // Order details section
      doc.fontSize(11).font('Helvetica-Bold').text('פרטי הזמנה:');
      doc.moveDown(0.5);

      doc.fontSize(10).font('Helvetica');
      const details = [
        ['מספר הזמנה:', paymentData.orderId || 'N/A'],
        ['שם הלקוח:', paymentData.customerName || 'N/A'],
        ['דוא"ל:', paymentData.customerEmail || 'N/A'],
        ['טלפון:', paymentData.customerPhone || 'N/A']
      ];

      for (const [label, value] of details) {
        const y = doc.y;
        doc.font('Helvetica').text(label, doc.page.margins.left + 10, y, { width: 150 });
        doc.font('Helvetica-Bold').text(value, doc.page.margins.left + 180, y);
      }

      doc.moveDown(1);

      // Payment breakdown section
      doc.fontSize(11).font('Helvetica-Bold').text('פירוט התשלום:');
      doc.moveDown(0.5);

      doc.fontSize(10).font('Helvetica');
      const subtotal = paymentData.subtotal || 0;
      const serviceFee = paymentData.serviceFee || CONFIG.SERVICE_FEE;
      const subtotalWithFee = subtotal + serviceFee;
      const vat = paymentData.vat || Math.round(subtotalWithFee * CONFIG.VAT_RATE);
      const total = paymentData.amount || (subtotalWithFee + vat);

      const paymentLines = [
        ['סכום בסיס:', `₪ ${subtotal.toLocaleString('he-IL')}`],
        ['עמלת שירות:', `₪ ${serviceFee.toLocaleString('he-IL')}`],
        ['סכום לפני מע"מ:', `₪ ${subtotalWithFee.toLocaleString('he-IL')}`],
        [`מע"מ (${Math.round(CONFIG.VAT_RATE * 100)}%):`, `₪ ${vat.toLocaleString('he-IL')}`]
      ];

      for (const [label, value] of paymentLines) {
        const y = doc.y;
        doc.font('Helvetica').text(label, doc.page.margins.left + 10, y, { width: 250 });
        doc.font('Helvetica').text(value, doc.page.margins.left + 300, y);
      }

      // Total line
      doc.moveDown(0.3);
      doc.rect(doc.page.margins.left, doc.y, doc.page.width - doc.page.margins.left - doc.page.margins.right, 25).stroke();
      const totalY = doc.y;
      doc.fontSize(12).font('Helvetica-Bold');
      doc.text('סכום כולל:', doc.page.margins.left + 10, totalY + 5, { width: 250 });
      doc.text(`₪ ${total.toLocaleString('he-IL')}`, doc.page.margins.left + 300, totalY + 5);

      doc.moveDown(2.5);

      // Payment method info
      doc.fontSize(11).font('Helvetica-Bold').text('פרטי התשלום:');
      doc.moveDown(0.5);

      doc.fontSize(10).font('Helvetica');
      const paymentInfo = [
        ['שיטת תשלום:', paymentData.gateway === 'tranzila' ? 'Tranzila' : 'Cardcom'],
        ['מספר עסקה:', paymentData.transactionId || paymentData.authCode || 'N/A'],
        ['תאריך ושעה:', `${dateStr} ${timeStr}`]
      ];

      for (const [label, value] of paymentInfo) {
        const y = doc.y;
        doc.font('Helvetica').text(label, doc.page.margins.left + 10, y, { width: 150 });
        doc.font('Helvetica-Bold').text(value, doc.page.margins.left + 180, y);
      }

      // Footer
      doc.moveDown(2);
      doc.fontSize(8).font('Helvetica').text('קבלה זו משמשת כהוכחת תשלום רשמית', { align: 'center' });
      doc.text('זקוף מע"מ בהתאם לדין שכר בריאות הציבור ה-1967', { align: 'center' });
      doc.moveDown(0.3);
      doc.text('© 2024 אישורטאבו - כל הזכויות שמורות', { align: 'center' });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Generate payment receipt as HTML
 */
function generatePaymentReceiptHTML(paymentData) {
  const now = new Date();
  const dateStr = now.toLocaleDateString('he-IL');
  const timeStr = now.toLocaleTimeString('he-IL');

  const subtotal = paymentData.subtotal || 0;
  const serviceFee = paymentData.serviceFee || CONFIG.SERVICE_FEE;
  const subtotalWithFee = subtotal + serviceFee;
  const vat = paymentData.vat || Math.round(subtotalWithFee * CONFIG.VAT_RATE);
  const total = paymentData.amount || (subtotalWithFee + vat);

  return `
    <!DOCTYPE html>
    <html dir="rtl" lang="he">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>קבלה על תשלום - אישורטאבו</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: Arial, sans-serif; direction: rtl; background: #f5f5f5; }
          .container { max-width: 800px; margin: 20px auto; background: white; padding: 40px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
          .header { text-align: center; border-bottom: 2px solid #1a56db; padding-bottom: 20px; margin-bottom: 30px; }
          .logo { font-size: 28px; font-weight: bold; color: #1a56db; margin-bottom: 5px; }
          .subtitle { font-size: 12px; color: #666; }
          .receipt-title { text-align: center; font-size: 22px; font-weight: bold; margin: 20px 0; }
          .success-box { background: #d4edda; color: #155724; padding: 15px; border-radius: 4px; text-align: center; font-weight: bold; margin: 20px 0; border-left: 4px solid #28a745; }
          .section { margin: 30px 0; }
          .section-title { font-size: 14px; font-weight: bold; color: #333; margin-bottom: 15px; border-bottom: 1px solid #e9ecef; padding-bottom: 10px; }
          .detail-row { display: flex; justify-content: space-between; margin: 8px 0; padding: 5px 0; border-bottom: 1px dotted #ddd; }
          .detail-label { font-weight: bold; color: #333; }
          .detail-value { text-align: left; color: #666; font-family: 'Courier New', monospace; }
          .total-row { display: flex; justify-content: space-between; margin: 15px 0; padding: 12px; background: #f0f7f0; border-left: 4px solid #28a745; font-weight: bold; font-size: 16px; }
          .total-label { color: #155724; }
          .total-value { color: #155724; font-family: 'Courier New', monospace; }
          .footer { text-align: center; margin-top: 40px; padding-top: 20px; border-top: 2px solid #ddd; color: #999; font-size: 11px; line-height: 1.6; }
          .vat-note { background: #f8f9fa; padding: 10px; margin: 10px 0; border-radius: 4px; font-size: 11px; text-align: center; color: #666; }
          @media print {
            body { background: white; }
            .container { box-shadow: none; margin: 0; padding: 0; }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">אישורטאבו</div>
            <div class="subtitle">IshuruTabu - אישור עירייה לטאבו</div>
          </div>

          <div class="receipt-title">קבלה על תשלום</div>

          <div class="success-box">
            ✓ תשלומך אושר בהצלחה
          </div>

          <div class="section">
            <div class="section-title">פרטי הזמנה</div>
            <div class="detail-row">
              <span class="detail-label">מספר הזמנה:</span>
              <span class="detail-value">${paymentData.orderId || 'N/A'}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">שם הלקוח:</span>
              <span class="detail-value">${paymentData.customerName || 'N/A'}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">דוא"ל:</span>
              <span class="detail-value">${paymentData.customerEmail || 'N/A'}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">טלפון:</span>
              <span class="detail-value">${paymentData.customerPhone || 'N/A'}</span>
            </div>
          </div>

          <div class="section">
            <div class="section-title">פירוט התשלום</div>
            <div class="detail-row">
              <span class="detail-label">סכום בסיס:</span>
              <span class="detail-value">₪ ${subtotal.toLocaleString('he-IL')}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">עמלת שירות:</span>
              <span class="detail-value">₪ ${serviceFee.toLocaleString('he-IL')}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">סכום לפני מע"מ:</span>
              <span class="detail-value">₪ ${subtotalWithFee.toLocaleString('he-IL')}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">מע"מ (${Math.round(CONFIG.VAT_RATE * 100)}%):</span>
              <span class="detail-value">₪ ${vat.toLocaleString('he-IL')}</span>
            </div>

            <div class="total-row">
              <span class="total-label">סכום כולל:</span>
              <span class="total-value">₪ ${total.toLocaleString('he-IL')}</span>
            </div>

            <div class="vat-note">
              זקוף מע"מ בהתאם לדין שכר בריאות הציבור ה-1967
            </div>
          </div>

          <div class="section">
            <div class="section-title">פרטי התשלום</div>
            <div class="detail-row">
              <span class="detail-label">שיטת תשלום:</span>
              <span class="detail-value">${paymentData.gateway === 'tranzila' ? 'Tranzila' : 'Cardcom'}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">מספר עסקה:</span>
              <span class="detail-value">${paymentData.transactionId || paymentData.authCode || 'N/A'}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">תאריך ושעה:</span>
              <span class="detail-value">${dateStr} ${timeStr}</span>
            </div>
          </div>

          <div class="footer">
            <p>קבלה זו משמשת כהוכחת תשלום רשמית</p>
            <p style="margin-top: 10px;">© 2024 אישורטאבו - כל הזכויות שמורות</p>
            <p style="margin-top: 10px;">support@ishurutabu.co.il</p>
          </div>
        </div>
      </body>
    </html>
  `;
}

// Export module
module.exports = {
  generatePaymentReceiptPDF,
  generatePaymentReceiptHTML,
  CONFIG
};
