const asyncHandler = require("express-async-handler");
const TeamSchema = require("../models/teams.model.js");
const express = require("express");
const auth = require("../middleware/oauth.js");
const Event = require("../models/events.model.js");
const Pass = require("../models/passes.model.js");
const User = require("../models/users.model.js");
const mongoose = require("mongoose");
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const qs = require('qs');

const CONFIG = {
    PRODUCTION: {
        AUTH_URL: 'https://api-preprod.phonepe.com/apis/pg-sandbox/v1/oauth/token',
        BASE_URL: 'https://api-preprod.phonepe.com/apis/pg-sandbox',
        CHECKOUT_SCRIPT: 'https://mercury.phonepe.com/web/bundle/checkout.js'
    },
    STAGING: {
        AUTH_URL: 'https://api-preprod.phonepe.com/apis/pg-sandbox/v1/oauth/token',
        BASE_URL: 'https://api-preprod.phonepe.com/apis/pg-sandbox',
    },
    CLIENT_VERSION: '1.0'
};

// Environment configuration - use environment variables for security
const ENVIRONMENT = process.env.PHONEPE_ENV || 'STAGING';
const CLIENT_ID = process.env.PHONEPE_CLIENT_ID || 'TEST-M22ZDT307F584_25062';
const CLIENT_SECRET = process.env.PHONEPE_CLIENT_SECRET || 'ODJjOWFiNDktZGNiZi00MzRjLTg5NzEtM2Y1OWQ3YTEyNzZj';

const getPhonePeAccessToken = async () => {
  try {
    console.log('[PhonePe] Requesting access token...');
    const response = await axios.post(
      'https://api-preprod.phonepe.com/apis/pg-sandbox/v1/oauth/token',
      qs.stringify({
        client_id: process.env.PHONEPE_CLIENT_ID,
        client_secret: process.env.PHONEPE_CLIENT_SECRET,
        grant_type: 'client_credentials',
        client_version: '1'
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    return response.data.access_token;
  } catch (error) {
    console.error('[PhonePe] Auth Error:', error.response?.data || error.message);
    throw new Error(
      `Authentication failed: ${error.response?.data?.message || error.message}`
    );
  }
};

// Create Payment Order
const createPhonePeOrder = async (orderData) => {
    try {
        console.log('Creating PhonePe order with data:', orderData);
        const accessToken = await getPhonePeAccessToken();

        const payload = {
            merchantOrderId: orderData.merchantOrderId,
            amount: orderData.amount,
            expireAfter: 1200,
            metaInfo: {
                udf1: orderData.userId,
                udf2: orderData.eventId,
                udf3: orderData.passType || 'General',
                udf4: JSON.stringify(orderData.friends || [])
            },
            paymentFlow: {
                type: 'PG_CHECKOUT',
                message: 'Talkeys Ticket Booking',
                merchantUrls: {
                    redirectUrl: `${process.env.BASE_URL}/api/payment/callback/${orderData.merchantOrderId}`
                }
            }
        };

        const response = await axios.post(
            `${CONFIG.PRODUCTION.BASE_URL}/checkout/v2/pay`,
            payload,
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `O-Bearer ${accessToken}`
                },
                timeout: 15000
            }
        );

        return response.data;
    } catch (error) {
        console.error('PhonePe order creation error:', {
            status: error.response?.status,
            data: error.response?.data,
            message: error.message
        });
        throw new Error(
            `Order creation failed: ${error.response?.data?.message || error.message}`
        );
    }
};

const bookTicket = async (req, res) => {
    try {
        console.log('Booking ticket request:', req.body);

        // Validation
        if (!req.body.userId || !req.body.eventId) {
            return res.status(400).json({ 
                success: false,
                error: "User ID and Event ID are required" 
            });
        }

        const user = await User.findById(req.body.userId);
        if (!user) {
            return res.status(404).json({ 
                success: false,
                error: "User not found" 
            });
        }

        const event = await Event.findById(req.body.eventId);
        if (!event) {
            return res.status(404).json({ 
                success: false,
                error: "Event not found" 
            });
        }

        const friends = req.body.friends || [];
        const totalTicketsNeeded = 1 + friends.length;
        const totalAmount = event.ticketPrice * totalTicketsNeeded;
        const amountInPaisa = totalAmount * 100;

        // Validation checks
        if (event.remainingSeats < totalTicketsNeeded) {
            return res.status(400).json({ 
                success: false,
                error: "Insufficient tickets available" 
            });
        }

        // Generate unique merchant order ID with timestamp
        const merchantOrderId = `TKT_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        console.log('Generated merchantOrderId:', merchantOrderId);

        // Create temporary pass
        const pass = new Pass({
            userId: req.body.userId,
            eventId: req.body.eventId,
            passType: req.body.passType || "General",
            status: "pending",
            paymentStatus: "pending",
            merchantOrderId: merchantOrderId,
            amount: totalAmount,
            friends: friends,
            createdAt: new Date(),
            expiresAt: new Date(Date.now() + 20 * 60 * 1000)
        });

        await pass.save();
        console.log('Pass created with ID:', pass._id);

        // Create PhonePe payment order
        const orderData = {
            merchantOrderId: merchantOrderId,
            amount: amountInPaisa,
            userId: req.body.userId,
            eventId: req.body.eventId,
            eventName: event.title,
            passType: req.body.passType || "General",
            friends: friends,
            mobileNumber: user.phone
        };

        const paymentOrder = await createPhonePeOrder(orderData);

        // Update pass with payment details
        pass.phonePeOrderId = paymentOrder.data?.orderId || paymentOrder.orderId;
        pass.paymentUrl = paymentOrder.data?.redirectUrl || paymentOrder.redirectUrl;
        console.log("saving pass")
        await pass.save();
        
        console.log("Redirect URL:", `${process.env.BASE_URL}/api/payment/callback/${orderData.merchantOrderId}`);
        console.log("Webhook URL:", `${process.env.BASE_URL}/api/payment/webhook`);
        console.log('Payment order created successfully');

        return res.status(200).json({
            success: true,
            message: "Payment order created successfully",
            data: {
                passId: pass._id,
                merchantOrderId: merchantOrderId,
                phonePeOrderId: paymentOrder.data?.orderId || paymentOrder.orderId,
                amount: totalAmount,
                amountInPaisa: amountInPaisa,
                totalTickets: totalTicketsNeeded,
                paymentUrl: paymentOrder.data?.redirectUrl || paymentOrder.redirectUrl,
                expiresAt: pass.expiresAt,
                event: {
                    id: event._id,
                    title: event.title,
                    date: event.date,
                    venue: event.venue
                },
                friends: friends
            }
        });

    } catch (error) {
        console.error('Ticket booking error:', error);
        return res.status(500).json({ 
            success: false,
            error: "Failed to create payment order",
            message: error.message,
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
};

// Enhanced Payment Status Check with Integrated Processing
const checkPaymentStatus = async (merchantOrderId, shouldProcess = false) => {
  try {
    const accessToken = await getPhonePeAccessToken();
    console.log("[STATUS] Access token acquired");

    const url = `${CONFIG.PRODUCTION.BASE_URL}/checkout/v2/order/${merchantOrderId}/status`;
    console.log("[STATUS] Checking status at:", url);

    const response = await axios.get(url, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `O-Bearer ${accessToken}`,
        'Accept': 'application/json'
      },
      timeout: 10000
    });

    console.log("[STATUS] Response from PhonePe:", response.data);
    
    const paymentData = response.data;
    
    // If shouldProcess is true, automatically process the payment based on status
    if (shouldProcess && paymentData) {
      const paymentState = paymentData.state || paymentData.data?.state;
      
      if (paymentState === 'COMPLETED') {
        await processPaymentConfirmation(merchantOrderId, paymentData, 'status_check');
      } else if (paymentState === 'FAILED') {
        await processPaymentFailure(merchantOrderId, paymentData, 'status_check');
      }
    }
    
    return paymentData;

  } catch (error) {
    console.error('[STATUS] Error:', {
      status: error.response?.status,
      data: error.response?.data,
      message: error.message
    });
    throw new Error(
      `Status check failed: ${error.response?.data?.message || error.message}`
    );
  }
};

// Process Payment Confirmation
const processPaymentConfirmation = async (merchantOrderId, paymentStatus, source = 'callback') => {
  try {
    console.log(`[${source}] Processing payment confirmation for:`, merchantOrderId);
    
    // Find pass by merchantOrderId instead of using metadata
    const pass = await Pass.findOne({
      merchantOrderId: merchantOrderId,
      status: 'pending'
    });

    if (!pass) {
      throw new Error(`Pass not found for merchantOrderId: ${merchantOrderId}`);
    }

    // Check if already processed
    if (pass.paymentStatus === 'completed') {
      console.log(`[${source}] Payment already processed for pass:`, pass._id);
      return {
        passId: pass._id,
        passUUID: pass.passUUID || pass._id,
        success: true,
        message: 'Payment already confirmed',
        alreadyProcessed: true
      };
    }

    // Update pass status
    pass.status = 'active';
    pass.paymentStatus = 'completed';
    pass.confirmedAt = new Date();
    pass.paymentDetails = {
      orderId: paymentStatus.orderId,
      transactionId: paymentStatus.paymentDetails?.[0]?.transactionId,
      amount: paymentStatus.amount,
      paymentMode: paymentStatus.paymentDetails?.[0]?.paymentMode,
      completedAt: new Date(),
      source: source,
      merchantOrderId: merchantOrderId
    };
    
    // Generate UUID for confirmed pass
    if (!pass.passUUID) {
      pass.passUUID = uuidv4();
    }
    
    await pass.save();

    // Update user's pass count if needed
    await User.findByIdAndUpdate(pass.userId, {
      $inc: { activePasses: 1 }
    });

    console.log(`[${source}] Payment confirmed successfully for pass:`, pass._id);
    
    return {
      passId: pass._id,
      passUUID: pass.passUUID,
      success: true,
      message: 'Payment confirmed successfully'
    };

  } catch (error) {
    console.error(`[${source}] Error processing payment confirmation:`, error);
    throw error;
  }
};

// Process Payment Failure
const processPaymentFailure = async (merchantOrderId, paymentStatus, source = 'callback') => {
  try {
    console.log(`[${source}] Processing payment failure for:`, merchantOrderId);
    
    const pass = await Pass.findOne({
      merchantOrderId: merchantOrderId,
      status: 'pending'
    });
    
    if (pass) {
      // Update pass status to failed
      pass.status = 'payment_failed';
      pass.paymentStatus = 'failed';
      pass.paymentDetails = {
        orderId: paymentStatus.orderId,
        amount: paymentStatus.amount,
        failedAt: new Date(),
        source: source,
        reason: paymentStatus.reason || 'Payment failed',
        merchantOrderId: merchantOrderId
      };
      
      await pass.save();
    }

    return {
      passId: pass?._id,
      success: false,
      message: 'Payment failed'
    };

  } catch (error) {
    console.error(`[${source}] Error processing payment failure:`, error);
    throw error;
  }
};

// Validate Webhook Signature
const validateWebhookSignature = (username, password, receivedSignature) => {
  try {
    const credentials = `${username}:${password}`;
    const expectedSignature = crypto
      .createHash('sha256')
      .update(credentials)
      .digest('hex');
    
    return expectedSignature === receivedSignature;
  } catch (error) {
    console.error('Error validating webhook signature:', error);
    return false;
  }
};

// HTML Redirect Helper
const htmlRedirect = (url) => `
  <!DOCTYPE html>
  <html>
    <head>
      <meta http-equiv="refresh" content="0; URL='${url}'" />
      <title>Redirecting...</title>
    </head>
    <body>
      <p>Processing payment... <a href="${url}">Click here if not redirected</a></p>
    </body>
  </html>
`;

// Enhanced Payment Callback Handler
const handlePaymentCallback = async (req, res) => {
  try {
    console.log("Payment callback initiated");
    const { merchantOrderId } = req.params;
    console.log('[CALLBACK] Received callback for:', merchantOrderId);

    // Step 1: Fetch status from PhonePe with processing enabled
    const paymentStatus = await checkPaymentStatus(merchantOrderId, true);
    console.log('[CALLBACK] PhonePe status processed:', paymentStatus);

    // Validate response
    if (!paymentStatus || typeof paymentStatus !== 'object') {
      throw new Error('Invalid payment status response from PhonePe');
    }

    const paymentState = paymentStatus.state || paymentStatus.data?.state;
    if (!paymentState) {
      console.log('[CALLBACK] Payment status missing "state" field:', paymentStatus);
      throw new Error("Missing 'state' in PhonePe response");
    }

    // Find pass to get details
    const pass = await Pass.findOne({ merchantOrderId: merchantOrderId });

    // Step 2: Route based on payment state
    if (paymentState === 'COMPLETED') {
      console.log('[CALLBACK] Payment completed. Redirecting to success');
      return res.redirect(302,`${process.env.FRONTEND_URL}/ticket/success?passId=${pass?._id}&uuid=${pass?.passUUID}`
      );
    }

    if (paymentState === 'FAILED') {
      console.log('[CALLBACK] Payment failed. Redirecting to failure');
      return res.redirect(302, 
      `${process.env.FRONTEND_URL}/ticket/failure?passId=${pass ? pass._id : ''}&orderId=${merchantOrderId}`
      );
    }

    // PENDING or unknown status
    console.log('[CALLBACK] Payment pending. Redirecting to pending page.');
    return res.redirect(302, 
      `${process.env.FRONTEND_URL}/ticket/pending?orderId=${merchantOrderId}`
    );

  } catch (error) {
    console.error('[CALLBACK] Unhandled error:', error);
    const reason = encodeURIComponent(error.message || "callback_error");
    return res.status(200).send(htmlRedirect(
      `${process.env.FRONTEND_URL}/ticket/error?reason=${reason}`
    ));
  }
};

// Manual Payment Status Check Route
const handleManualStatusCheck = async (req, res) => {
  try {
    const { merchantOrderId } = req.params;
    console.log('[MANUAL_CHECK] Checking status for:', merchantOrderId);

    // Check status with processing enabled
    const paymentStatus = await checkPaymentStatus(merchantOrderId, true);
    
    const paymentState = paymentStatus.state || paymentStatus.data?.state;
    
    return res.status(200).json({
      success: true,
      merchantOrderId,
      status: paymentState,
      data: paymentStatus,
      message: `Payment status: ${paymentState}`
    });

  } catch (error) {
    console.error('[MANUAL_CHECK] Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
      merchantOrderId: req.params.merchantOrderId
    });
  }
};

// Enhanced Webhook Handler
const handlePaymentWebhook = async (req, res) => {
    try {
        console.log('Webhook received:', req.body);
        
        // Validate webhook signature if configured
        if (process.env.PHONEPE_WEBHOOK_USERNAME && process.env.PHONEPE_WEBHOOK_PASSWORD) {
          const authHeader = req.headers.authorization;
          if (!authHeader) {
              return res.status(401).json({ error: "Authorization header missing" });
          }

          const signature = authHeader.replace('SHA256 ', '');
          const isValid = validateWebhookSignature(
              process.env.PHONEPE_WEBHOOK_USERNAME,
              process.env.PHONEPE_WEBHOOK_PASSWORD,
              signature
          );

          if (!isValid) {
              console.log('Invalid webhook signature');
              return res.status(401).json({ error: "Invalid signature" });
          }
        }

        const { event, payload } = req.body;
        
        if (event === 'checkout.order.completed') {
            await processPaymentConfirmation(payload.merchantOrderId, payload, 'webhook');
        } else if (event === 'checkout.order.failed') {
            await processPaymentFailure(payload.merchantOrderId, payload, 'webhook');
        }

        return res.status(200).json({ success: true, event });

    } catch (error) {
        console.error('Webhook error:', error);
        return res.status(500).json({ error: "Internal server error" });
    }
};

// Get Pass Status by Payment Order
const getPassByPaymentOrder = async (req, res) => {
  try {
    const { merchantOrderId } = req.params;
    
    // Find pass by merchantOrderId
    const pass = await Pass.findOne({
      merchantOrderId: merchantOrderId
    }).populate('userId', 'name email');
    
    if (!pass) {
      return res.status(404).json({
        success: false,
        message: 'Pass not found for this payment order'
      });
    }
    
    return res.status(200).json({
      success: true,
      pass: {
        id: pass._id,
        status: pass.status,
        paymentStatus: pass.paymentStatus,
        paymentDetails: pass.paymentDetails,
        createdAt: pass.createdAt,
        user: pass.userId
      }
    });
    
  } catch (error) {
    console.error('Error fetching pass by payment order:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// Retry Failed Payment Processing
const retryPaymentProcessing = async (req, res) => {
  try {
    const { merchantOrderId } = req.body;
    
    if (!merchantOrderId) {
      return res.status(400).json({
        success: false,
        error: 'merchantOrderId is required'
      });
    }
    
    console.log('[RETRY] Retrying payment processing for:', merchantOrderId);
    
    // Force check and process payment status
    const paymentStatus = await checkPaymentStatus(merchantOrderId, true);
    
    return res.status(200).json({
      success: true,
      message: 'Payment processing retried successfully',
      status: paymentStatus.state || paymentStatus.data?.state,
      merchantOrderId
    });
    
  } catch (error) {
    console.error('[RETRY] Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// Function to get pass details for QR code generation
const getPassForQR = async (req, res) => {
    try {
        const { passUUID } = req.params;
        
        const pass = await Pass.findOne({ 
            passUUID: passUUID,
            status: 'active'
        })
        .populate('userId', 'name email phone')
        .populate('eventId', 'title date venue address');

        if (!pass) {
            return res.status(404).json({ error: "Valid pass not found" });
        }

        return res.json({
            success: true,
            data: {
                passUUID: pass.passUUID,
                passType: pass.passType,
                confirmedAt: pass.confirmedAt,
                user: pass.userId,
                event: pass.eventId,
                friends: pass.friends,
                amount: pass.amount
            }
        });

    } catch (error) {
        console.error('Get pass error:', error);
        return res.status(500).json({ error: "Internal server error" });
    }
};

// Get Ticket Status
const getTicketStatus = async (req, res) => {
    try {
        const { passId } = req.params;
        
        const pass = await Pass.findById(passId)
            .populate('userId', 'name email phone')
            .populate('eventId', 'title date venue location');

        if (!pass) {
            return res.status(404).json({ error: "Pass not found" });
        }

        // If payment is still pending, check status from PhonePe
        if (pass.status === 'pending' && pass.merchantOrderId) {
            try {
                const paymentStatus = await checkPaymentStatus(pass.merchantOrderId);
                
                if (paymentStatus.state === 'COMPLETED') {
                    pass.status = 'active';
                    pass.paymentStatus = 'completed';
                    pass.confirmedAt = new Date();
                    if (!pass.passUUID) {
                        pass.passUUID = uuidv4();
                    }
                    await pass.save();
                } else if (paymentStatus.state === 'FAILED') {
                    pass.status = 'payment_failed';
                    pass.paymentStatus = 'failed';
                    await pass.save();
                }
            } catch (error) {
                console.error('Error checking payment status:', error);
            }
        }

        return res.status(200).json({
            success: true,
            data: {
                pass: pass,
                qrCode: pass.status === 'active' ? generateQRCode(pass.passUUID || pass._id) : null
            }
        });

    } catch (error) {
        console.error('Get ticket status error:', error);
        return res.status(500).json({ error: "Internal server error" });
    }
};

// Generate QR Code for ticket
const generateQRCode = (passIdentifier) => {
    return `${process.env.BASE_URL}/verify-ticket/${passIdentifier}`;
};

// Cleanup expired pending passes
const cleanupExpiredPasses = async () => {
    try {
        const expiredPasses = await Pass.find({
            status: 'pending',
            expiresAt: { $lt: new Date() }
        });

        for (const pass of expiredPasses) {
            pass.status = 'expired';
            await pass.save();
        }

        console.log(`Cleaned up ${expiredPasses.length} expired passes`);
    } catch (error) {
        console.error('Cleanup error:', error);
    }
};

const getPassByUserAndEvent = async (req, res) => {
    try {
        const pass = await Pass.findOne({ 
            userId: req.user._id, 
            eventId: req.body.eventId 
        }, '_id');
        
        if (!pass) {
            return res.status(404).json({ error: "Pass not found" });
        }

        return res.status(200).json(pass);
    } catch (error) {
        console.error('Get pass error:', error);
        return res.status(500).json({ error: "Internal server error" });
    }
};

const Accept = async(req, res) => {
    const passId = req.body.passId;
    try {
        const pass = await Pass.findById(passId);
        if (!pass) {
            return res.status(404).json({ error: "Pass not found" });
        }
        pass.isScanned = true;
        pass.timeScanned = new Date();
        await pass.save();
        return res.status(200).json({ message: "Pass scanned successfully" });
    }
    catch (error) {
        console.error('Accept pass error:', error);
        return res.status(500).json({ error: "Internal server error" });
    }
};

const Reject = async(req, res) => {
    const passId = req.body.passId;
    try {
        const pass = await Pass.findById(passId);
        if (!pass) {
            return res.status(404).json({ error: "Pass not found" });
        }
        pass.isScanned = false;
        pass.timeScanned = null;
        await pass.save();
        return res.status(200).json({ message: "Pass rejected successfully" });
    }
    catch (error) {
        console.error('Reject pass error:', error);
        return res.status(500).json({ error: "Internal server error" });
    }
};



const canScan = async(req, res) => {
    const user = req.user;
    try {
        if (user.role !== 'admin') {
            return res.status(403).json({ error: "Forbidden: Invalid role" });
        }
        return res.status(200).json({ message: "User can scan passes" });

}
    catch (error) {
        console.error('Get pass error:', error);
        return res.status(500).json({ error: "Internal server error" });
    }
}

const Registration = require('../models/registration.model.js'); 
const sendMail = async (options) => {
try {
    // Extract email parameters from options
    const { to, subject, html, teamName, registrationId } = options;
    
    // Create email content based on whether it's a confirmation email or custom email
    let emailContent = html;
    
    // If teamName is provided, assume it's a confirmation email
    if (teamName) {
    emailContent = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Registration Confirmation</title>
        </head>
        <body>
            <p><strong>Dear ${teamName},</strong></p>
            <p>
            Thank you for registering for <strong>Startup Ignite</strong> via Talkeys!
            We're excited to have you onboard for this experience. Your registration has been successfully recorded.
            </p>
            <h3>What's Next?</h3>
            <ul>
            <li>Stay tuned for further updates and important announcements regarding the event.</li>
            <li>
                All relevant details, guidelines, or competition briefs will be shared with you soon via email or on the official Talkeys platform.
            </li>
            <li>
                If you have any questions, feel free to contact us at <a href="mailto:talkeys11@gmail.com">talkeys11@gmail.com</a>
            </li>
            </ul>
            <p>We look forward to seeing you participate and make the most of this event! 🚀</p>
            <p>
            Best regards,<br>
            Team Talkeys<br>
            <a href="http://www.talkeys.xyz">www.talkeys.xyz</a>
            </p>
        </body>
        </html>
    `;
    }

    // Create transporter
    const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
    }
    });

    // Mail options
    const mailOptions = {
    from: `"Talkeys" <${process.env.EMAIL_USER}>`,
    to,
    subject: subject || "Talkeys Notification",
    html: emailContent
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent successfully:', info.messageId);
    return info;
} catch (error) {
    console.error('Error sending email:', error);
    throw error;
}
};



module.exports = {
    getPassByUserAndEvent,
    bookTicket,
    canScan,
    Accept,
    sendMail,
    Reject,
    handlePaymentWebhook,
    getTicketStatus,
    checkPaymentStatus,
    handlePaymentCallback,
    handlePaymentWebhook,
    getTicketStatus,
    checkPaymentStatus,
    cleanupExpiredPasses
};