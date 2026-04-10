# אישורטאבו - Playwright Automation Engine

**Automated municipal approval submission system for Israeli טאבו (title registration) requests**

This is a comprehensive automation engine that streamlines the process of obtaining אישור עירייה (municipal approval) from Israeli municipalities for רישום זכויות בטאבו (title registration).

## Features

### 4 Submission Pathways

1. **Email Submission** (`submitViaEmail`)
   - Professional Hebrew email composition
   - Automatic document attachment (POA, sale contract, ID copies, arnona form)
   - Delivery status tracking
   - SMTP configuration support

2. **MAST Platform** (`submitViaMast`)
   - Direct integration with mast.co.il portal
   - Automated form filling
   - Document upload handling
   - OTP verification support
   - Confirmation number capture

3. **City-Specific Portals** (`submitViaPortal`)
   - **Tel Aviv**: Automatic navigation and form submission
   - **Ashdod**: Portal-specific handling
   - **Jerusalem**: System navigation and document processing
   - Authentication and OTP handling
   - Extensible for additional cities

4. **Physical Submission Preparation** (`preparePhysicalSubmission`)
   - Professional cover letter generation (Hebrew)
   - Document organization
   - Mailing checklist creation
   - Package information tracking

### Advanced Features

- **Retry Logic**: Exponential backoff with configurable max retries
- **Error Handling**: Screenshot capture on failures for debugging
- **Status Callbacks**: Real-time status updates throughout submission process
- **Detailed Logging**: Comprehensive logging at each step
- **Batch Processing**: Support for processing multiple orders
- **Hebrew Support**: Full Hebrew language support for all communications

## Installation

### Prerequisites

- Node.js 16+
- npm or yarn
- SMTP server access (for email submissions)
- Browser automation compatibility

### Setup

1. Clone the repository:
```bash
git clone https://github.com/ashurtabo/automation-engine.git
cd automation-engine
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment variables:
```bash
cp .env.example .env
# Edit .env with your configuration
```

4. Install Playwright browsers:
```bash
npx playwright install chromium
```

## Configuration

### Environment Variables

Create a `.env` file in the project root:

```env
# SMTP Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-specific-password
SENDER_EMAIL=your-email@gmail.com

# API Configuration
BASE_URL=https://your-api-server.com

# Storage
SCREENSHOTS_DIR=./uploads/screenshots
```

### Municipality Configuration

Municipalities are configured with submission type and contact details:

```javascript
{
  name: 'עיריית תל אביב - יפו',
  city: 'תל אביב',
  email: 'approval@tel-aviv.gov.il',
  phone: '03-6392222',
  address: 'רחוב עבודה 1, תל אביב',
  submissionType: 'portal', // 'email', 'mast', 'portal', 'physical'
  mastId: null,
  physicalSubmissionAddress: null,
  contactPerson: 'מחלקת אישורים',
  allowedMethods: ['portal', 'email', 'physical']
}
```

## Usage

### Basic Usage

```javascript
const { processOrder } = require('./automation');

const order = {
  id: 'ORDER-2024-001',
  propertyAddress: 'רחוב דיזנגוף 50, תל אביב',
  parcelNumber: '12345/6789',
  ownerName: 'דוד כהן',
  senderName: 'עו"ד יוסף לוי',
  senderEmail: 'attorney@lawfirm.co.il',
  senderPhone: '+972-3-1234567',
  documents: {
    poa: '/path/to/poa.pdf',
    saleContract: '/path/to/contract.pdf',
    idCopies: '/path/to/id.pdf',
    arnonaForm: '/path/to/arnona.pdf'
  }
};

const municipality = {
  name: 'עיריית תל אביב - יפו',
  city: 'תל אביב',
  email: 'approval@tel-aviv.gov.il',
  submissionType: 'email'
};

const result = await processOrder(order, municipality, (orderId, status, details) => {
  console.log(`[${orderId}] ${status}`);
});

console.log('Confirmation:', result.confirmationNumber);
```

### With Status Callbacks

```javascript
function onStatusChange(orderId, status, details) {
  console.log(`Order ${orderId}: ${status}`);

  if (status === 'email_sent') {
    console.log(`Email delivered to: ${details.recipientEmail}`);
  }

  if (status === 'mast_submitted') {
    console.log(`MAST Confirmation: ${details.confirmationNumber}`);
  }

  if (status === 'processing_failed') {
    console.error(`Submission failed: ${details.error}`);
  }
}

await processOrder(order, municipality, onStatusChange);
```

### Batch Processing

```javascript
const orders = [/* ... */];
const results = [];

for (const order of orders) {
  try {
    const result = await processOrder(order, municipalities[order.id]);
    results.push({ orderId: order.id, success: true, ...result });
  } catch (error) {
    results.push({ orderId: order.id, success: false, error: error.message });
  }
}
```

## API Reference

### `processOrder(order, municipality, onStatusChange)`

Main orchestration function that routes orders to appropriate submission handlers.

**Parameters:**
- `order` (Object) - Order details including property info and documents
- `municipality` (Object) - Municipality configuration
- `onStatusChange` (Function) - Callback for status updates

**Returns:**
```javascript
{
  success: boolean,
  confirmationNumber: string,
  method: 'email' | 'mast' | 'portal' | 'physical',
  details: Object,
  timestamp: string,
  error?: string
}
```

### `submitViaEmail(order, municipality, onStatusChange)`

Sends professional Hebrew email with document attachments.

### `submitViaMast(order, municipality, onStatusChange)`

Submits to MAST platform (mast.co.il) via form automation.

### `submitViaPortal(order, municipality, onStatusChange)`

Routes to city-specific portal handler.

### `preparePhysicalSubmission(order, municipality, onStatusChange)`

Prepares physical submission package with documents and checklists.

## Status Events

The engine emits detailed status events throughout the submission process:

```
email_submission_started
  → filling_mast_form
  → uploading_mast_docs
  → waiting_for_otp
  → otp_received
  → submitting_mast_form
  → mast_submitted
  → processing_completed / processing_failed
```

## Document Requirements

All submissions require the following documents:

1. **POA** (Power of Attorney) - כוח עורך דין
   - Must be current and properly authorized

2. **Sale Contract** - חוזה מכר
   - Must include all parties and property details

3. **ID Copies** - העתקי תעודות זהות
   - Authenticated copies of all parties' IDs

4. **Arnona Form** - טופס ארנונה
   - Current municipal tax form

## Error Handling

On failure, the engine:
- Captures screenshots for debugging
- Logs detailed error messages
- Retries with exponential backoff (default: 3 times)
- Calls `onStatusChange` with failure status
- Returns error information in result

```javascript
{
  success: false,
  error: "Field not found or already filled",
  timestamp: "2024-01-15T10:30:00Z"
}
```

## Supported Municipalities

Currently configured for:
- תל אביב - Tel Aviv
- אשדוד - Ashdod
- ירושלים - Jerusalem
- רמת השרון - Ramat Hasharon (MAST)

Additional municipalities can be added via configuration.

## Logging

Comprehensive logging is available:

```
[INFO] 2024-01-15T10:30:00Z - Starting email submission
[DEBUG] 2024-01-15T10:30:01Z - Attached document: poa
[INFO] 2024-01-15T10:30:05Z - Email sent successfully
```

View logs:
```bash
npm run logs
```

## Testing

Run the test suite:

```bash
npm test
```

Run examples:

```bash
npm run example
```

## Troubleshooting

### "SMTP configuration not found"
- Ensure SMTP_HOST, SMTP_USER, SMTP_PASS are set in .env
- For Gmail, use an app-specific password

### "Submit button not found"
- The page selectors may have changed on the municipality portal
- Check browser console for actual element selectors
- Update selectors in the appropriate handler function

### "OTP not received"
- Verify BASE_URL is correctly configured
- Check that /api/otp/latest endpoint is accessible
- Ensure X-Order-ID header is being passed correctly

### Screenshots not saving
- Check SCREENSHOTS_DIR exists and is writable
- Verify sufficient disk space
- Check file permissions

## Architecture

```
automation.js
├── Email Handler (nodemailer)
├── MAST Handler (Playwright)
├── Portal Handlers
│   ├── Tel Aviv Portal
│   ├── Ashdod Portal
│   └── Jerusalem Portal
└── Physical Submission
    ├── Cover Letter Generator
    ├── Document Organizer
    └── Checklist Generator
```

## Contributing

To add support for additional municipalities:

1. Create a new handler function: `submitToNewCity()`
2. Add city mapping to `submitViaPortal()` switch statement
3. Configure municipality details in config
4. Test with sample orders

## Security Notes

- SMTP credentials are kept in .env (not committed)
- Screenshot files may contain sensitive data (PII, addresses)
- Document paths should be validated before processing
- Only use HTTPS for API communications

## Performance

- Email: ~5-10 seconds per submission
- MAST Platform: ~15-30 seconds per submission
- Portal Submissions: ~20-40 seconds depending on portal
- Physical Prep: <1 second

## Limitations

- Web-based portals only (no legacy systems)
- Hebrew input fields only
- Document size limit: 25MB per file
- Concurrent submissions limited by Playwright instances

## License

MIT

## Support

For issues or feature requests:
- GitHub Issues: https://github.com/ashurtabo/automation-engine/issues
- Email: support@ashurtabo.com
- Phone: +972-3-XXXXXXX

---

**Last Updated**: January 2024
**Version**: 1.0.0
**Status**: Production Ready
