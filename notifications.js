/**
 * Notifications Module for אישורטאבו
 * Sends multi-channel notifications (email, SMS, WhatsApp) at each order stage
 * Supports retry logic, templating, and notification history
 */

const nodemailer = require('nodemailer');
const twilio = require('twilio');
const fs = require('fs');
const path = require('path');

// Notification types
const NOTIFICATION_TYPES = {
  ORDER_RECEIVED: 'ORDER_RECEIVED',
  PAYMENT_CONFIRMED: 'PAYMENT_CONFIRMED',
  POA_READY: 'POA_READY',
  POA_RECEIVED: 'POA_RECEIVED',
  SUBMISSION_STARTED: 'SUBMISSION_STARTED',
  SUBMISSION_COMPLETED: 'SUBMISSION_COMPLETED',
  SUBMISSION_FAILED: 'SUBMISSION_FAILED'
};

// Notification channels
const CHANNELS = {
  EMAIL: 'email',
  SMS: 'sms',
  WHATSAPP: 'whatsapp'
};

// Configuration
const CONFIG = {
  ADMIN_EMAIL: process.env.ADMIN_EMAIL || 'admin@ishurutabu.co.il',
  ENABLE_NOTIFICATIONS: process.env.ENABLE_NOTIFICATIONS !== 'false',
  MAX_RETRIES: parseInt(process.env.NOTIFICATION_MAX_RETRIES || '3'),
  RETRY_DELAY_MS: parseInt(process.env.NOTIFICATION_RETRY_DELAY || '5000'),

  // Email configuration
  EMAIL: {
    HOST: process.env.SMTP_HOST || 'smtp.gmail.com',
    PORT: parseInt(process.env.SMTP_PORT || '587'),
    SECURE: process.env.SMTP_SECURE === 'true',
    USER: process.env.SMTP_USER || '',
    PASS: process.env.SMTP_PASS || ''
  },

  // Twilio configuration
  TWILIO: {
    ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID || '',
    AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN || '',
    PHONE_NUMBER: process.env.TWILIO_PHONE_NUMBER || '',
    WHATSAPP_NUMBER: process.env.TWILIO_WHATSAPP_NUMBER || ''
  }
};

// In-memory notification queue and history
const notificationQueue = [];
const notificationHistory = new Map();
let notificationCounter = 0;

/**
 * Initialize email transporter
 */
function getEmailTransporter() {
  return nodemailer.createTransport({
    host: CONFIG.EMAIL.HOST,
    port: CONFIG.EMAIL.PORT,
    secure: CONFIG.EMAIL.SECURE,
    auth: {
      user: CONFIG.EMAIL.USER,
      pass: CONFIG.EMAIL.PASS
    }
  });
}

/**
 * Initialize Twilio client
 */
function getTwilioClient() {
  if (!CONFIG.TWILIO.ACCOUNT_SID || !CONFIG.TWILIO.AUTH_TOKEN) {
    return null;
  }
  return twilio(CONFIG.TWILIO.ACCOUNT_SID, CONFIG.TWILIO.AUTH_TOKEN);
}

/**
 * HTML Email templates in Hebrew
 */
const emailTemplates = {
  ORDER_RECEIVED: (data) => `
    <html dir="rtl" lang="he">
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: Arial, sans-serif; direction: rtl; background-color: #f5f5f5; }
          .container { max-width: 600px; margin: 20px auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
          .header { text-align: center; border-bottom: 3px solid #1a56db; padding-bottom: 20px; }
          .logo { font-size: 28px; font-weight: bold; color: #1a56db; margin-bottom: 5px; }
          .subtitle { font-size: 14px; color: #666; }
          .content { margin: 30px 0; line-height: 1.8; }
          .status-badge { display: inline-block; background: #28a745; color: white; padding: 8px 16px; border-radius: 4px; font-weight: bold; }
          .order-details { background: #f8f9fa; padding: 20px; border-radius: 4px; margin: 20px 0; }
          .detail-row { display: flex; justify-content: space-between; margin: 10px 0; padding: 5px 0; border-bottom: 1px solid #e9ecef; }
          .detail-label { font-weight: bold; color: #333; }
          .detail-value { color: #666; }
          .cta-button { display: inline-block; background: #1a56db; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin-top: 20px; }
          .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e9ecef; color: #999; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">אישורטאבו</div>
            <div class="subtitle">IshuruTabu - אישור עירייה לטאבו</div>
          </div>
          <div class="content">
            <p>שלום {{clientName}},</p>
            <p>ההזמנה שלך התקבלה בהצלחה במערכת! אנו שמחים לעזור לך להשיג את אישור העירייה לטאבו.</p>
            <div class="order-details">
              <div class="detail-row">
                <span class="detail-label">מספר הזמנה:</span>
                <span class="detail-value">{{orderId}}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">עירייה:</span>
                <span class="detail-value">{{municipality}}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">סטטוס:</span>
                <span class="status-badge">נקלט</span>
              </div>
            </div>
            <p>שלב הבא: אנחנו ניצור קובץ ייפוי כוח שתצטרך לחתום עליו דיגיטלית, ואז נוכל להתחיל בתהליך ההגשה לעירייה.</p>
            <a href="{{trackingUrl}}" class="cta-button">עקוב אחר ההזמנה</a>
          </div>
          <div class="footer">
            <p>© 2024 אישורטאבו - כל הזכויות שמורות</p>
            <p>אם יש לך שאלות, אנא צור איתנו קשר דרך האתר</p>
          </div>
        </div>
      </body>
    </html>
  `,

  PAYMENT_CONFIRMED: (data) => `
    <html dir="rtl" lang="he">
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: Arial, sans-serif; direction: rtl; background-color: #f5f5f5; }
          .container { max-width: 600px; margin: 20px auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
          .header { text-align: center; border-bottom: 3px solid #28a745; padding-bottom: 20px; }
          .logo { font-size: 28px; font-weight: bold; color: #1a56db; margin-bottom: 5px; }
          .subtitle { font-size: 14px; color: #666; }
          .content { margin: 30px 0; line-height: 1.8; }
          .status-badge { display: inline-block; background: #28a745; color: white; padding: 8px 16px; border-radius: 4px; font-weight: bold; }
          .payment-details { background: #f0f7f0; padding: 20px; border-radius: 4px; margin: 20px 0; border-right: 4px solid #28a745; }
          .detail-row { display: flex; justify-content: space-between; margin: 10px 0; padding: 5px 0; }
          .detail-label { font-weight: bold; color: #333; }
          .detail-value { color: #666; }
          .cta-button { display: inline-block; background: #1a56db; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin-top: 20px; }
          .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e9ecef; color: #999; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">אישורטאבו</div>
            <div class="subtitle">אישור התשלום</div>
          </div>
          <div class="content">
            <p>שלום {{clientName}},</p>
            <p>תשלומך עבור הזמנה {{orderId}} אושר בהצלחה!</p>
            <div class="payment-details">
              <div class="detail-row">
                <span class="detail-label">מספר הזמנה:</span>
                <span class="detail-value">{{orderId}}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">סכום התשלום:</span>
                <span class="detail-value">₪ {{amount}}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">תאריך תשלום:</span>
                <span class="detail-value">{{paymentDate}}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">סטטוס:</span>
                <span class="status-badge">שולם</span>
              </div>
            </div>
            <p>בשלב הבא, נשלח אליך דוא"ל עם הודעת ייפוי כוח לחתימה דיגיטלית. לאחר חתימתך, נתחיל בתהליך ההגשה לעירייה {{municipality}}.</p>
            <a href="{{trackingUrl}}" class="cta-button">עקוב אחר ההזמנה</a>
          </div>
          <div class="footer">
            <p>© 2024 אישורטאבו - כל הזכויות שמורות</p>
            <p>שלח לנו שאלה דרך פורטל הלקוח שלנו</p>
          </div>
        </div>
      </body>
    </html>
  `,

  POA_READY: (data) => `
    <html dir="rtl" lang="he">
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: Arial, sans-serif; direction: rtl; background-color: #f5f5f5; }
          .container { max-width: 600px; margin: 20px auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
          .header { text-align: center; border-bottom: 3px solid #1a56db; padding-bottom: 20px; }
          .logo { font-size: 28px; font-weight: bold; color: #1a56db; margin-bottom: 5px; }
          .content { margin: 30px 0; line-height: 1.8; }
          .action-box { background: #e3f2fd; padding: 20px; border-radius: 4px; margin: 20px 0; border-right: 4px solid #1a56db; }
          .cta-button { display: inline-block; background: #1a56db; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin-top: 20px; font-weight: bold; }
          .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e9ecef; color: #999; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">אישורטאבו</div>
            <div class="subtitle">ייפוי כוח מוכן לחתימה</div>
          </div>
          <div class="content">
            <p>שלום {{clientName}},</p>
            <p>מסמך ייפוי הכוח שלך מוכן! כעת אתה צריך לחתום עליו בעזרת החתימה הדיגיטלית שלך.</p>
            <div class="action-box">
              <p><strong>ייפוי הכוח מוכן לחתימה דיגיטלית</strong></p>
              <p>לחץ על הכפתור למטה כדי לחתום על הייפוי הכוח ולהמשיך בתהליך.</p>
              <a href="{{trackingUrl}}" class="cta-button">חתום על הייפוי כוח</a>
            </div>
            <p>לאחר שתחתום, נוכל לשלוח את המסמך לעירייה {{municipality}} ולהתחיל בתהליך קבלת האישור.</p>
            <p><strong>שים לב:</strong> ייפוי הכוח הדיגיטלי שלך יהיה בעל עוצמה משפטית מלאה.</p>
          </div>
          <div class="footer">
            <p>© 2024 אישורטאבו - כל הזכויות שמורות</p>
            <p>אם יש לך בעיות בחתימה, צור קשר עם התמיכה שלנו</p>
          </div>
        </div>
      </body>
    </html>
  `,

  POA_RECEIVED: (data) => `
    <html dir="rtl" lang="he">
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: Arial, sans-serif; direction: rtl; background-color: #f5f5f5; }
          .container { max-width: 600px; margin: 20px auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
          .header { text-align: center; border-bottom: 3px solid #28a745; padding-bottom: 20px; }
          .logo { font-size: 28px; font-weight: bold; color: #1a56db; margin-bottom: 5px; }
          .status-badge { display: inline-block; background: #28a745; color: white; padding: 8px 16px; border-radius: 4px; font-weight: bold; }
          .content { margin: 30px 0; line-height: 1.8; }
          .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e9ecef; color: #999; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">אישורטאבו</div>
            <div class="subtitle">קיבלנו את הייפוי כוח שלך!</div>
          </div>
          <div class="content">
            <p>שלום {{clientName}},</p>
            <p>קיבלנו בהצלחה את ייפוי הכוח החתום שלך! <span class="status-badge">הייפוי אומת</span></p>
            <p>כעת אנחנו הולכים להגיש את הבקשה לעירייה {{municipality}} עבור אישור הטאבו שלך (הזמנה {{orderId}}).</p>
            <p>צפוי שנקבל תשובה מהעירייה תוך 5-10 ימי עסקים.</p>
            <p>נשלח לך עדכון בדוא"ל וב-SMS כאשר הבקשה תישלח ויקבלו אנחנו תשובה מהעירייה.</p>
          </div>
          <div class="footer">
            <p>© 2024 אישורטאבו - כל הזכויות שמורות</p>
            <p>תודה שבחרת בנו!</p>
          </div>
        </div>
      </body>
    </html>
  `,

  SUBMISSION_STARTED: (data) => `
    <html dir="rtl" lang="he">
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: Arial, sans-serif; direction: rtl; }
          .container { max-width: 600px; margin: 20px auto; background: white; padding: 30px; }
          .header { text-align: center; margin-bottom: 20px; }
          .logo { font-size: 24px; font-weight: bold; color: #1a56db; }
          .content { margin: 20px 0; line-height: 1.8; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">אישורטאבו</div>
          </div>
          <div class="content">
            <p>שלום {{clientName}},</p>
            <p>בקשתך להשגת אישור עירייה לטאבו (הזמנה {{orderId}}) הוגשה לעירייה {{municipality}}.</p>
            <p>תהליך הבדיקה במערכות העירייה כעת בתהליך.</p>
            <p>נשלח לך עדכוני התקדמות בדוא"ל וב-SMS.</p>
          </div>
        </div>
      </body>
    </html>
  `,

  SUBMISSION_COMPLETED: (data) => `
    <html dir="rtl" lang="he">
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: Arial, sans-serif; direction: rtl; background-color: #f5f5f5; }
          .container { max-width: 600px; margin: 20px auto; background: white; padding: 30px; border-radius: 8px; }
          .header { text-align: center; border-bottom: 3px solid #28a745; padding-bottom: 20px; }
          .logo { font-size: 28px; font-weight: bold; color: #1a56db; }
          .success-badge { display: inline-block; background: #28a745; color: white; padding: 12px 24px; border-radius: 4px; font-size: 18px; font-weight: bold; margin: 20px 0; }
          .content { margin: 20px 0; line-height: 1.8; }
          .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e9ecef; color: #999; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">אישורטאבו</div>
            <p>ברכות! הגשתך אושרה!</p>
          </div>
          <div style="text-align: center;">
            <div class="success-badge">אישור עירייה לטאבו - אושר!</div>
          </div>
          <div class="content">
            <p>שלום {{clientName}},</p>
            <p>אישור העירייה לטאבו שלך עבור הזמנה {{orderId}} אושר בהצלחה!</p>
            <p>עירייה {{municipality}} אישרה את הבקשה שלך.</p>
            <p>תוכל להוריד את אישור העירייה מפורטל הלקוח שלנו.</p>
            <p>המסמך מוכן לשימוש בתהליך הטאבו שלך בבימ"ל.</p>
          </div>
          <div class="footer">
            <p>© 2024 אישורטאבו - כל הזכויות שמורות</p>
            <p>תודה שהשתמשת בשירותינו!</p>
          </div>
        </div>
      </body>
    </html>
  `,

  SUBMISSION_FAILED: (data) => `
    <html dir="rtl" lang="he">
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: Arial, sans-serif; direction: rtl; background-color: #f5f5f5; }
          .container { max-width: 600px; margin: 20px auto; background: white; padding: 30px; border-radius: 8px; }
          .header { text-align: center; border-bottom: 3px solid #dc3545; padding-bottom: 20px; }
          .logo { font-size: 28px; font-weight: bold; color: #1a56db; }
          .error-box { background: #fff5f5; padding: 15px; border-radius: 4px; margin: 20px 0; border-right: 4px solid #dc3545; }
          .content { margin: 20px 0; line-height: 1.8; }
          .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e9ecef; color: #999; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">אישורטאבו</div>
            <p>נתקלנו בבעיה בהגשה</p>
          </div>
          <div class="error-box">
            <p><strong>סטטוס:</strong> בקשה נדחתה או אירעה שגיאה</p>
          </div>
          <div class="content">
            <p>שלום {{clientName}},</p>
            <p>נתקלנו בבעיה בעת הגשת הבקשה שלך להשגת אישור עירייה לטאבו (הזמנה {{orderId}}) לעירייה {{municipality}}.</p>
            <p><strong>סיבת הבעיה:</strong> {{failureReason}}</p>
            <p>צוות התמיכה שלנו כבר עובד על עדכון הנתונים וניסיון חוזר. נשלח לך דוא"ל נוסף כשנפתור את הבעיה.</p>
            <p>אם זה דחוף או יש לך שאלות, אנא צור קשר עם התמיכה שלנו.</p>
          </div>
          <div class="footer">
            <p>© 2024 אישורטאבו - כל הזכויות שמורות</p>
            <p>צור קשר: support@ishurutabu.co.il</p>
          </div>
        </div>
      </body>
    </html>
  `
};

/**
 * Interpolate template variables
 */
function interpolateTemplate(template, data) {
  return template.replace(/{{(\w+)}}/g, (match, key) => {
    return data[key] || match;
  });
}

/**
 * Send email notification
 */
async function sendEmail(recipient, subject, htmlContent, retryCount = 0) {
  if (!CONFIG.EMAIL.USER || !CONFIG.EMAIL.PASS) {
    console.warn('[NOTIFICATION] Email not configured, skipping email');
    return { success: true, skipped: true };
  }

  try {
    const transporter = getEmailTransporter();
    await transporter.sendMail({
      from: CONFIG.EMAIL.USER,
      to: recipient,
      subject,
      html: htmlContent
    });

    console.log(`[NOTIFICATION] Email sent to ${recipient}: ${subject}`);
    return { success: true };
  } catch (error) {
    console.error(`[NOTIFICATION] Email send failed: ${error.message}`);

    // Retry logic
    if (retryCount < CONFIG.MAX_RETRIES) {
      console.log(`[NOTIFICATION] Retrying email in ${CONFIG.RETRY_DELAY_MS}ms (attempt ${retryCount + 1}/${CONFIG.MAX_RETRIES})`);
      await new Promise(resolve => setTimeout(resolve, CONFIG.RETRY_DELAY_MS));
      return sendEmail(recipient, subject, htmlContent, retryCount + 1);
    }

    return { success: false, error: error.message };
  }
}

/**
 * Send SMS notification via Twilio
 */
async function sendSMS(phoneNumber, message, retryCount = 0) {
  const client = getTwilioClient();

  if (!client || !CONFIG.TWILIO.PHONE_NUMBER) {
    console.warn('[NOTIFICATION] Twilio not configured, skipping SMS');
    return { success: true, skipped: true };
  }

  try {
    // Normalize Israeli phone number
    let normalizedPhone = phoneNumber.replace(/\D/g, '');
    if (!normalizedPhone.startsWith('972')) {
      if (normalizedPhone.startsWith('0')) {
        normalizedPhone = '972' + normalizedPhone.slice(1);
      } else {
        normalizedPhone = '972' + normalizedPhone;
      }
    }
    normalizedPhone = '+' + normalizedPhone;

    const response = await client.messages.create({
      body: message,
      from: CONFIG.TWILIO.PHONE_NUMBER,
      to: normalizedPhone
    });

    console.log(`[NOTIFICATION] SMS sent to ${phoneNumber}: ${response.sid}`);
    return { success: true, messageId: response.sid };
  } catch (error) {
    console.error(`[NOTIFICATION] SMS send failed: ${error.message}`);

    // Retry logic
    if (retryCount < CONFIG.MAX_RETRIES) {
      console.log(`[NOTIFICATION] Retrying SMS in ${CONFIG.RETRY_DELAY_MS}ms (attempt ${retryCount + 1}/${CONFIG.MAX_RETRIES})`);
      await new Promise(resolve => setTimeout(resolve, CONFIG.RETRY_DELAY_MS));
      return sendSMS(phoneNumber, message, retryCount + 1);
    }

    return { success: false, error: error.message };
  }
}

/**
 * Send WhatsApp notification via Twilio
 */
async function sendWhatsApp(phoneNumber, message, retryCount = 0) {
  const client = getTwilioClient();

  if (!client || !CONFIG.TWILIO.WHATSAPP_NUMBER) {
    console.warn('[NOTIFICATION] WhatsApp not configured, skipping');
    return { success: true, skipped: true };
  }

  try {
    // Normalize Israeli phone number
    let normalizedPhone = phoneNumber.replace(/\D/g, '');
    if (!normalizedPhone.startsWith('972')) {
      if (normalizedPhone.startsWith('0')) {
        normalizedPhone = '972' + normalizedPhone.slice(1);
      } else {
        normalizedPhone = '972' + normalizedPhone;
      }
    }
    normalizedPhone = '+'  + normalizedPhone;

    const response = await client.messages.create({
      body: message,
      from: 'whatsapp:' + CONFIG.TWILIO.WHATSAPP_NUMBER,
      to: 'whatsapp:' + normalizedPhone
    });

    console.log(`[NOTIFICATION] WhatsApp sent to ${phoneNumber}: ${response.sid}`);
    return { success: true, messageId: response.sid };
  } catch (error) {
    console.error(`[NOTIFICATION] WhatsApp send failed: ${error.message}`);

    // Retry logic
    if (retryCount < CONFIG.MAX_RETRIES) {
      console.log(`[NOTIFICATION] Retrying WhatsApp in ${CONFIG.RETRY_DELAY_MS}ms (attempt ${retryCount + 1}/${CONFIG.MAX_RETRIES})`);
      await new Promise(resolve => setTimeout(resolve, CONFIG.RETRY_DELAY_MS));
      return sendWhatsApp(phoneNumber, message, retryCount + 1);
    }

    return { success: false, error: error.message };
  }
}

/**
 * Get SMS text for notification type
 */
function getSMSText(type, data) {
  const templates = {
    ORDER_RECEIVED: `הזמנתך ${data.orderId} נקלטה. קודם כל תצטרך לחתום על ייפוי כוח דיגיטלי. עקוב בקישור: ${data.trackingUrl}`,
    PAYMENT_CONFIRMED: `תשלומך עבור ${data.orderId} אושר! ₪${data.amount} נקבע בחשבונך. שלב הבא: חתימה על ייפוי כוח.`,
    POA_READY: `ייפוי הכוח שלך מוכן לחתימה! לחץ כאן כדי לחתום: ${data.trackingUrl}`,
    POA_RECEIVED: `קיבלנו את החתימה שלך! כעת אנחנו הולכים להגיש את הבקשה ל${data.municipality}.`,
    SUBMISSION_STARTED: `הבקשה שלך הוגשה ל${data.municipality} (${data.orderId}). נעדכן אותך בהמשך.`,
    SUBMISSION_COMPLETED: `בחדשות טובות! אישור העירייה ל${data.orderId} אושר! הורד את ההודעה בפורטל שלנו.`,
    SUBMISSION_FAILED: `ארעה שגיאה בהגשת ${data.orderId}. צוות התמיכה שלנו עובד על זה. נעדכן אותך בקרוב.`
  };

  return templates[type] || '';
}

/**
 * Send notification to client
 * Supports multi-channel delivery based on notification type
 */
async function sendNotification(orderId, type, data = {}) {
  if (!CONFIG.ENABLE_NOTIFICATIONS) {
    console.log('[NOTIFICATION] Notifications disabled');
    return { success: true, skipped: true };
  }

  if (!NOTIFICATION_TYPES[type]) {
    throw new Error(`Invalid notification type: ${type}`);
  }

  const notificationId = `notif_${++notificationCounter}_${Date.now()}`;
  const timestamp = new Date().toISOString();

  // Ensure required data fields
  const notificationData = {
    orderId,
    clientName: data.clientName || 'לקוח יקר',
    email: data.email,
    phone: data.phone,
    municipality: data.municipality || '',
    amount: data.amount || '',
    paymentDate: data.paymentDate || new Date().toLocaleDateString('he-IL'),
    failureReason: data.failureReason || 'טעות טכנית',
    trackingUrl: data.trackingUrl || `https://ishurutabu.co.il/order/${orderId}`,
    ...data
  };

  const record = {
    id: notificationId,
    orderId,
    type,
    timestamp,
    channels: [],
    results: {},
    data: notificationData
  };

  try {
    // Determine which channels to use based on notification type
    const channelsByType = {
      ORDER_RECEIVED: [CHANNELS.EMAIL, CHANNELS.SMS],
      PAYMENT_CONFIRMED: [CHANNELS.EMAIL, CHANNELS.SMS],
      POA_READY: [CHANNELS.EMAIL, CHANNELS.WHATSAPP],
      POA_RECEIVED: [CHANNELS.EMAIL],
      SUBMISSION_STARTED: [CHANNELS.SMS],
      SUBMISSION_COMPLETED: [CHANNELS.EMAIL, CHANNELS.SMS],
      SUBMISSION_FAILED: [CHANNELS.EMAIL, CHANNELS.SMS]
    };

    const channels = channelsByType[type] || [];

    // Send via each channel
    for (const channel of channels) {
      if (channel === CHANNELS.EMAIL && notificationData.email) {
        const emailTemplate = emailTemplates[type];
        if (emailTemplate) {
          const htmlContent = interpolateTemplate(emailTemplate(notificationData), notificationData);
          const result = await sendEmail(
            notificationData.email,
            `אישורטאבו - ${type === 'ORDER_RECEIVED' ? 'הזמנה התקבלה' : type === 'PAYMENT_CONFIRMED' ? 'תשלום אושר' : type}`,
            htmlContent
          );
          record.results[CHANNELS.EMAIL] = result;
          record.channels.push(CHANNELS.EMAIL);
        }
      } else if (channel === CHANNELS.SMS && notificationData.phone) {
        const smsText = getSMSText(type, notificationData);
        const result = await sendSMS(notificationData.phone, smsText);
        record.results[CHANNELS.SMS] = result;
        record.channels.push(CHANNELS.SMS);
      } else if (channel === CHANNELS.WHATSAPP && notificationData.phone) {
        const smsText = getSMSText(type, notificationData);
        const result = await sendWhatsApp(notificationData.phone, smsText);
        record.results[CHANNELS.WHATSAPP] = result;
        record.channels.push(CHANNELS.WHATSAPP);
      }
    }

    // Also send admin notification for failures
    if (type === NOTIFICATION_TYPES.SUBMISSION_FAILED) {
      const adminContent = `
        <p>הזמנה ${orderId} נכשלה בהגשה</p>
        <p>סיבה: ${notificationData.failureReason}</p>
        <p>לקוח: ${notificationData.clientName} (${notificationData.phone})</p>
        <p>עירייה: ${notificationData.municipality}</p>
      `;
      await sendEmail(CONFIG.ADMIN_EMAIL, `[ALERT] הזמנה ${orderId} נכשלה`, adminContent);
    }

    // Store in history
    notificationHistory.set(notificationId, record);
    console.log(`[NOTIFICATION] Sent ${type} for ${orderId} (ID: ${notificationId})`);

    return {
      success: true,
      notificationId,
      channels: record.channels,
      results: record.results
    };
  } catch (error) {
    console.error(`[NOTIFICATION] Failed to send notification ${type} for ${orderId}:`, error.message);

    notificationHistory.set(notificationId, {
      ...record,
      error: error.message,
      failed: true
    });

    return {
      success: false,
      notificationId,
      error: error.message
    };
  }
}

/**
 * Get notification history for an order
 */
function getNotificationHistory(orderId) {
  const history = [];
  for (const [id, record] of notificationHistory.entries()) {
    if (record.orderId === orderId) {
      history.push(record);
    }
  }
  // Sort by timestamp (newest first)
  history.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  return history;
}

/**
 * Get all notification statistics
 */
function getNotificationStats() {
  let totalNotifications = notificationHistory.size;
  let successful = 0;
  let failed = 0;

  for (const record of notificationHistory.values()) {
    if (record.failed) {
      failed++;
    } else {
      successful++;
    }
  }

  return {
    total: totalNotifications,
    successful,
    failed,
    queue_size: notificationQueue.length
  };
}

// Export module
module.exports = {
  sendNotification,
  getNotificationHistory,
  getNotificationStats,
  NOTIFICATION_TYPES,
  CHANNELS
};
