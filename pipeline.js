/**
 * Order Processing Pipeline for אישורטאבו
 * Orchestrates the full order lifecycle from creation through completion
 * Manages status transitions, notifications, and error handling with retry logic
 */

const fs = require('fs');
const path = require('path');
const { sendNotification, NOTIFICATION_TYPES } = require('./notifications');
const { generatePOAToFile } = require('./poa-generator');

// Pipeline steps
const PIPELINE_STEPS = {
  NEW_ORDER: 'new_order',
  VALIDATE_PAYMENT: 'validate_payment',
  GENERATE_POA: 'generate_poa',
  WAIT_POA_SIGNATURE: 'wait_poa_signature',
  SUBMIT_TO_MUNICIPALITY: 'submit_to_municipality',
  MONITOR_SUBMISSION: 'monitor_submission',
  PROCESS_COMPLETION: 'process_completion'
};

// Order statuses that map to pipeline steps
const ORDER_STATUSES = {
  new: 'new',
  payment_pending: 'payment_pending',
  paid: 'paid',
  poa_generated: 'poa_generated',
  poa_ready: 'poa_ready',
  poa_signing: 'poa_signing',
  poa_received: 'poa_received',
  processing: 'processing',
  submitted: 'submitted',
  completed: 'completed',
  failed: 'failed',
  cancelled: 'cancelled'
};

// In-memory pipeline state tracking
const pipelineState = new Map();

/**
 * Load orders from JSON
 */
function loadOrders() {
  const ordersFile = path.join(__dirname, 'data', 'orders.json');
  if (!fs.existsSync(ordersFile)) {
    return [];
  }
  try {
    const data = fs.readFileSync(ordersFile, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    console.error('[PIPELINE] Error loading orders:', err);
    return [];
  }
}

/**
 * Save orders to JSON
 */
function saveOrders(orders) {
  const ordersFile = path.join(__dirname, 'data', 'orders.json');
  try {
    fs.writeFileSync(ordersFile, JSON.stringify(orders, null, 2));
  } catch (err) {
    console.error('[PIPELINE] Error saving orders:', err);
    throw err;
  }
}

/**
 * Get or create pipeline state for order
 */
function getPipelineState(orderId) {
  if (!pipelineState.has(orderId)) {
    pipelineState.set(orderId, {
      orderId,
      currentStep: PIPELINE_STEPS.NEW_ORDER,
      status: ORDER_STATUSES.new,
      startedAt: new Date().toISOString(),
      stepHistory: [],
      lastError: null,
      retryCount: 0,
      maxRetries: 3
    });
  }
  return pipelineState.get(orderId);
}

/**
 * Update pipeline state
 */
function updatePipelineState(orderId, updates) {
  const state = getPipelineState(orderId);
  Object.assign(state, updates);
  pipelineState.set(orderId, state);
  return state;
}

/**
 * Record step in history
 */
function recordStep(orderId, step, status, details = {}) {
  const state = getPipelineState(orderId);
  state.stepHistory.push({
    step,
    status,
    timestamp: new Date().toISOString(),
    details
  });
}

/**
 * Step 1: Validate new order
 */
async function stepValidateOrder(orderId) {
  console.log(`[PIPELINE] Step 1: Validating order ${orderId}`);

  try {
    const orders = loadOrders();
    const order = orders.find(o => o.id === orderId);

    if (!order) {
      throw new Error('Order not found');
    }

    if (!order.email || !order.phone) {
      throw new Error('Missing contact information');
    }

    recordStep(orderId, PIPELINE_STEPS.NEW_ORDER, 'completed', { orderId });

    // Send ORDER_RECEIVED notification
    await sendNotification(orderId, NOTIFICATION_TYPES.ORDER_RECEIVED, {
      clientName: order.sellerName,
      email: order.email,
      phone: order.phone,
      municipality: order.municipality,
      trackingUrl: `https://ishurutabu.co.il/order/${orderId}`
    }).catch(err => console.error('[PIPELINE] Notification send failed:', err.message));

    return { success: true, nextStep: PIPELINE_STEPS.VALIDATE_PAYMENT };
  } catch (error) {
    console.error(`[PIPELINE] Order validation failed: ${error.message}`);
    recordStep(orderId, PIPELINE_STEPS.NEW_ORDER, 'failed', { error: error.message });
    return { success: false, error: error.message };
  }
}

/**
 * Step 2: Validate payment
 */
async function stepValidatePayment(orderId) {
  console.log(`[PIPELINE] Step 2: Validating payment for ${orderId}`);

  try {
    const orders = loadOrders();
    const order = orders.find(o => o.id === orderId);

    if (!order) {
      throw new Error('Order not found');
    }

    // Check if payment is complete
    if (order.paymentStatus !== 'paid') {
      console.log(`[PIPELINE] Payment not yet confirmed for ${orderId}, waiting...`);
      return { success: false, error: 'Payment pending', retry: true };
    }

    recordStep(orderId, PIPELINE_STEPS.VALIDATE_PAYMENT, 'completed', {
      paymentStatus: order.paymentStatus,
      transactionId: order.transactionId
    });

    // Send PAYMENT_CONFIRMED notification
    await sendNotification(orderId, NOTIFICATION_TYPES.PAYMENT_CONFIRMED, {
      clientName: order.sellerName,
      email: order.email,
      phone: order.phone,
      municipality: order.municipality,
      amount: order.totalAmount || 0,
      paymentDate: new Date().toLocaleDateString('he-IL'),
      trackingUrl: `https://ishurutabu.co.il/order/${orderId}`
    }).catch(err => console.error('[PIPELINE] Notification send failed:', err.message));

    return { success: true, nextStep: PIPELINE_STEPS.GENERATE_POA };
  } catch (error) {
    console.error(`[PIPELINE] Payment validation failed: ${error.message}`);
    recordStep(orderId, PIPELINE_STEPS.VALIDATE_PAYMENT, 'failed', { error: error.message });
    return { success: false, error: error.message };
  }
}

/**
 * Step 3: Generate POA document
 */
async function stepGeneratePOA(orderId) {
  console.log(`[PIPELINE] Step 3: Generating POA for ${orderId}`);

  try {
    const orders = loadOrders();
    const order = orders.find(o => o.id === orderId);

    if (!order) {
      throw new Error('Order not found');
    }

    const poaPath = path.join(__dirname, 'uploads', `POA-${orderId}-signed.pdf`);

    // Generate POA to file
    await generatePOAToFile(order, poaPath);

    // Update order with POA path
    const orderIndex = orders.findIndex(o => o.id === orderId);
    orders[orderIndex].poaPath = poaPath;
    orders[orderIndex].poaGeneratedAt = new Date().toISOString();
    orders[orderIndex].status = ORDER_STATUSES.poa_generated;
    saveOrders(orders);

    recordStep(orderId, PIPELINE_STEPS.GENERATE_POA, 'completed', { poaPath });

    return { success: true, nextStep: PIPELINE_STEPS.WAIT_POA_SIGNATURE };
  } catch (error) {
    console.error(`[PIPELINE] POA generation failed: ${error.message}`);
    recordStep(orderId, PIPELINE_STEPS.GENERATE_POA, 'failed', { error: error.message });
    return { success: false, error: error.message };
  }
}

/**
 * Step 4: Wait for POA signature
 */
async function stepWaitPOASignature(orderId) {
  console.log(`[PIPELINE] Step 4: Waiting for POA signature for ${orderId}`);

  try {
    const orders = loadOrders();
    const order = orders.find(o => o.id === orderId);

    if (!order) {
      throw new Error('Order not found');
    }

    // Update status to waiting for signature
    const orderIndex = orders.findIndex(o => o.id === orderId);
    orders[orderIndex].status = ORDER_STATUSES.poa_signing;
    saveOrders(orders);

    // Send POA_READY notification
    await sendNotification(orderId, NOTIFICATION_TYPES.POA_READY, {
      clientName: order.sellerName,
      email: order.email,
      phone: order.phone,
      municipality: order.municipality,
      trackingUrl: `https://ishurutabu.co.il/order/${orderId}/sign-poa`
    }).catch(err => console.error('[PIPELINE] Notification send failed:', err.message));

    recordStep(orderId, PIPELINE_STEPS.WAIT_POA_SIGNATURE, 'waiting', { waitingSince: new Date().toISOString() });

    // This step returns "waiting" - will be completed when POA is received
    return { success: false, error: 'Waiting for POA signature from client', retry: false, waiting: true };
  } catch (error) {
    console.error(`[PIPELINE] POA signature wait failed: ${error.message}`);
    recordStep(orderId, PIPELINE_STEPS.WAIT_POA_SIGNATURE, 'failed', { error: error.message });
    return { success: false, error: error.message };
  }
}

/**
 * Step 5: Submit to municipality
 */
async function stepSubmitToMunicipality(orderId) {
  console.log(`[PIPELINE] Step 5: Submitting to municipality for ${orderId}`);

  try {
    const orders = loadOrders();
    const order = orders.find(o => o.id === orderId);

    if (!order) {
      throw new Error('Order not found');
    }

    // Check if POA has been received
    if (order.status !== ORDER_STATUSES.poa_received) {
      return { success: false, error: 'POA not yet received from client', retry: false, waiting: true };
    }

    // Update status to processing
    const orderIndex = orders.findIndex(o => o.id === orderId);
    orders[orderIndex].status = ORDER_STATUSES.submitted;
    orders[orderIndex].submittedAt = new Date().toISOString();
    saveOrders(orders);

    // Send SUBMISSION_STARTED notification
    await sendNotification(orderId, NOTIFICATION_TYPES.SUBMISSION_STARTED, {
      clientName: order.sellerName,
      email: order.email,
      phone: order.phone,
      municipality: order.municipality,
      trackingUrl: `https://ishurutabu.co.il/order/${orderId}`
    }).catch(err => console.error('[PIPELINE] Notification send failed:', err.message));

    recordStep(orderId, PIPELINE_STEPS.SUBMIT_TO_MUNICIPALITY, 'completed', {
      municipality: order.municipality,
      submittedAt: orders[orderIndex].submittedAt
    });

    return { success: true, nextStep: PIPELINE_STEPS.MONITOR_SUBMISSION };
  } catch (error) {
    console.error(`[PIPELINE] Municipality submission failed: ${error.message}`);
    recordStep(orderId, PIPELINE_STEPS.SUBMIT_TO_MUNICIPALITY, 'failed', { error: error.message });
    return { success: false, error: error.message };
  }
}

/**
 * Step 6: Monitor submission and wait for response
 */
async function stepMonitorSubmission(orderId) {
  console.log(`[PIPELINE] Step 6: Monitoring submission for ${orderId}`);

  try {
    const orders = loadOrders();
    const order = orders.find(o => o.id === orderId);

    if (!order) {
      throw new Error('Order not found');
    }

    // This would typically call an external service to check municipality response
    // For now, we just record that we're monitoring
    recordStep(orderId, PIPELINE_STEPS.MONITOR_SUBMISSION, 'waiting', {
      municipality: order.municipality,
      monitoringSince: new Date().toISOString()
    });

    // This returns "waiting" - will be completed when municipality approves
    return { success: false, error: 'Waiting for municipality response', retry: false, waiting: true };
  } catch (error) {
    console.error(`[PIPELINE] Monitoring failed: ${error.message}`);
    recordStep(orderId, PIPELINE_STEPS.MONITOR_SUBMISSION, 'failed', { error: error.message });
    return { success: false, error: error.message };
  }
}

/**
 * Step 7: Process completion
 */
async function stepProcessCompletion(orderId) {
  console.log(`[PIPELINE] Step 7: Processing completion for ${orderId}`);

  try {
    const orders = loadOrders();
    const order = orders.find(o => o.id === orderId);

    if (!order) {
      throw new Error('Order not found');
    }

    // Update status to completed
    const orderIndex = orders.findIndex(o => o.id === orderId);
    orders[orderIndex].status = ORDER_STATUSES.completed;
    orders[orderIndex].completedAt = new Date().toISOString();
    saveOrders(orders);

    // Send SUBMISSION_COMPLETED notification
    await sendNotification(orderId, NOTIFICATION_TYPES.SUBMISSION_COMPLETED, {
      clientName: order.sellerName,
      email: order.email,
      phone: order.phone,
      municipality: order.municipality,
      trackingUrl: `https://ishurutabu.co.il/order/${orderId}`
    }).catch(err => console.error('[PIPELINE] Notification send failed:', err.message));

    recordStep(orderId, PIPELINE_STEPS.PROCESS_COMPLETION, 'completed', {
      completedAt: orders[orderIndex].completedAt
    });

    return { success: true, final: true };
  } catch (error) {
    console.error(`[PIPELINE] Completion processing failed: ${error.message}`);
    recordStep(orderId, PIPELINE_STEPS.PROCESS_COMPLETION, 'failed', { error: error.message });
    return { success: false, error: error.message };
  }
}

/**
 * Handle step failure
 */
async function handleStepFailure(orderId, step, error) {
  console.error(`[PIPELINE] Step failed: ${step} for ${orderId}: ${error.message}`);

  const orders = loadOrders();
  const order = orders.find(o => o.id === orderId);

  if (order) {
    // Send SUBMISSION_FAILED notification
    await sendNotification(orderId, NOTIFICATION_TYPES.SUBMISSION_FAILED, {
      clientName: order.sellerName,
      email: order.email,
      phone: order.phone,
      municipality: order.municipality,
      failureReason: error.message || 'Unknown error',
      trackingUrl: `https://ishurutabu.co.il/order/${orderId}`
    }).catch(err => console.error('[PIPELINE] Notification send failed:', err.message));

    // Update order status
    const orderIndex = orders.findIndex(o => o.id === orderId);
    orders[orderIndex].status = ORDER_STATUSES.failed;
    orders[orderIndex].failureReason = error.message;
    orders[orderIndex].failedAt = new Date().toISOString();
    saveOrders(orders);
  }

  const state = updatePipelineState(orderId, {
    status: ORDER_STATUSES.failed,
    lastError: error.message,
    currentStep: step
  });

  return state;
}

/**
 * Start pipeline for a new order
 */
async function startPipeline(orderId) {
  console.log(`[PIPELINE] Starting pipeline for order ${orderId}`);

  const state = getPipelineState(orderId);
  let currentStep = PIPELINE_STEPS.NEW_ORDER;

  while (currentStep && state.status !== ORDER_STATUSES.completed && state.status !== ORDER_STATUSES.failed) {
    console.log(`[PIPELINE] Executing step: ${currentStep}`);

    let result;

    try {
      switch (currentStep) {
        case PIPELINE_STEPS.NEW_ORDER:
          result = await stepValidateOrder(orderId);
          break;
        case PIPELINE_STEPS.VALIDATE_PAYMENT:
          result = await stepValidatePayment(orderId);
          break;
        case PIPELINE_STEPS.GENERATE_POA:
          result = await stepGeneratePOA(orderId);
          break;
        case PIPELINE_STEPS.WAIT_POA_SIGNATURE:
          result = await stepWaitPOASignature(orderId);
          break;
        case PIPELINE_STEPS.SUBMIT_TO_MUNICIPALITY:
          result = await stepSubmitToMunicipality(orderId);
          break;
        case PIPELINE_STEPS.MONITOR_SUBMISSION:
          result = await stepMonitorSubmission(orderId);
          break;
        case PIPELINE_STEPS.PROCESS_COMPLETION:
          result = await stepProcessCompletion(orderId);
          break;
        default:
          throw new Error(`Unknown step: ${currentStep}`);
      }

      if (result.success) {
        currentStep = result.nextStep || null;
        updatePipelineState(orderId, { currentStep, status: ORDER_STATUSES[currentStep] || state.status });
      } else if (result.waiting || result.retry === false) {
        console.log(`[PIPELINE] Pipeline waiting for ${orderId}: ${result.error}`);
        updatePipelineState(orderId, { currentStep, lastError: result.error });
        break; // Wait for external event
      } else if (result.retry) {
        // Implement retry logic
        const state = getPipelineState(orderId);
        if (state.retryCount < state.maxRetries) {
          state.retryCount++;
          console.log(`[PIPELINE] Retrying step ${currentStep} for ${orderId} (attempt ${state.retryCount}/${state.maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds before retry
          // Don't advance to next step, retry current step
        } else {
          throw new Error(`Max retries exceeded for step ${currentStep}`);
        }
      } else {
        throw new Error(result.error || 'Unknown error');
      }
    } catch (error) {
      await handleStepFailure(orderId, currentStep, error);
      break;
    }
  }

  const finalState = getPipelineState(orderId);
  console.log(`[PIPELINE] Pipeline completed for ${orderId}: ${finalState.status}`);
  return finalState;
}

/**
 * Retry a specific step
 */
async function retryStep(orderId, step) {
  console.log(`[PIPELINE] Retrying step ${step} for ${orderId}`);

  const state = getPipelineState(orderId);
  state.retryCount = 0;
  state.currentStep = step;

  let result;
  try {
    switch (step) {
      case PIPELINE_STEPS.VALIDATE_PAYMENT:
        result = await stepValidatePayment(orderId);
        break;
      case PIPELINE_STEPS.GENERATE_POA:
        result = await stepGeneratePOA(orderId);
        break;
      case PIPELINE_STEPS.SUBMIT_TO_MUNICIPALITY:
        result = await stepSubmitToMunicipality(orderId);
        break;
      default:
        throw new Error(`Cannot retry step: ${step}`);
    }

    if (result.success) {
      recordStep(orderId, step, 'completed', { retried: true });
      updatePipelineState(orderId, { currentStep: result.nextStep, lastError: null });
      return { success: true, nextStep: result.nextStep };
    } else {
      recordStep(orderId, step, 'failed', { error: result.error, retried: true });
      return { success: false, error: result.error };
    }
  } catch (error) {
    recordStep(orderId, step, 'failed', { error: error.message, retried: true });
    return { success: false, error: error.message };
  }
}

/**
 * Get pipeline status for an order
 */
function getPipelineStatus(orderId) {
  const state = getPipelineState(orderId);
  const orders = loadOrders();
  const order = orders.find(o => o.id === orderId);

  return {
    orderId,
    currentStep: state.currentStep,
    status: state.status,
    order: order ? {
      id: order.id,
      status: order.status,
      municipality: order.municipality,
      sellerName: order.sellerName,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt
    } : null,
    stepHistory: state.stepHistory,
    lastError: state.lastError,
    retryCount: state.retryCount,
    startedAt: state.startedAt,
    duration: state.startedAt ? new Date() - new Date(state.startedAt) : null
  };
}

/**
 * Mark POA as received (called from whatsapp-handler or web form)
 */
function markPOAAsReceived(orderId) {
  console.log(`[PIPELINE] POA marked as received for ${orderId}`);

  const orders = loadOrders();
  const orderIndex = orders.findIndex(o => o.id === orderId);

  if (orderIndex !== -1) {
    orders[orderIndex].status = ORDER_STATUSES.poa_received;
    orders[orderIndex].poaReceivedAt = new Date().toISOString();
    saveOrders(orders);

    const state = getPipelineState(orderId);
    state.currentStep = PIPELINE_STEPS.SUBMIT_TO_MUNICIPALITY;

    // Send POA_RECEIVED notification
    sendNotification(orderId, NOTIFICATION_TYPES.POA_RECEIVED, {
      clientName: orders[orderIndex].sellerName,
      email: orders[orderIndex].email,
      phone: orders[orderIndex].phone,
      municipality: orders[orderIndex].municipality,
      trackingUrl: `https://ishurutabu.co.il/order/${orderId}`
    }).catch(err => console.error('[PIPELINE] Notification send failed:', err.message));

    return true;
  }

  return false;
}

/**
 * Mark submission as completed (called when municipality approves)
 */
function markSubmissionAsCompleted(orderId, municipalityResponse = {}) {
  console.log(`[PIPELINE] Submission marked as completed for ${orderId}`);

  const orders = loadOrders();
  const orderIndex = orders.findIndex(o => o.id === orderId);

  if (orderIndex !== -1) {
    orders[orderIndex].status = ORDER_STATUSES.completed;
    orders[orderIndex].completedAt = new Date().toISOString();
    orders[orderIndex].municipalityResponse = municipalityResponse;
    saveOrders(orders);

    const state = getPipelineState(orderId);
    state.currentStep = PIPELINE_STEPS.PROCESS_COMPLETION;
    state.status = ORDER_STATUSES.completed;

    return true;
  }

  return false;
}

// Export module
module.exports = {
  startPipeline,
  retryStep,
  getPipelineStatus,
  markPOAAsReceived,
  markSubmissionAsCompleted,
  PIPELINE_STEPS,
  ORDER_STATUSES
};
