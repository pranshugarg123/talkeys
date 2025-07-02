const router = require("express").Router();
const express = require("express");
const auth = require("../middleware/oauth.js");
const authentication = require("./../controllers/authentication.js");
const Events = require("./../controllers/event.controller.js");
const Passes = require("./../controllers/passes.controller.js");
const Team = require("./../controllers/team.controller.js");
const { checkRole } = require("../middleware/role.middleware.js");
const { isTeamOK } = require("../middleware/Team.middleware");
router.get('/api/payment/callback/:merchantOrderId', Passes.handlePaymentCallback);
router.use((req, res, next) => {
    const csp = [
        "default-src 'self'",
        "script-src 'self' 'unsafe-eval' https://www.google-analytics.com https://*.phonepe.com https://dgq88cldibal5.cloudfront.net",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "img-src 'self' data: https:",
        "font-src 'self' https://fonts.gstatic.com",
        "connect-src 'self' https://api.phonepe.com https://api-preprod.phonepe.com",
        "frame-src 'self' https://mercury.phonepe.com",
        "worker-src 'self' blob:",
        "form-action 'self'"
    ].join("; ");
    
    res.setHeader('Content-Security-Policy', csp);
    
    // Additional security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    
    next();
});
router.get('/api/ticket-status/:passId', Passes.getTicketStatus);
router.get("/getEvents", Events.getEvents);
router.use("/dashboard", require("./dashboard.routes"));

router.get("/getEventById/:id", Events.getEventById);
router.post("/verify", authentication.login);
router.get("/logout", authentication.logout);

router.use(auth.verifyToken);

// Payment & Ticket Routes
router.post('/api/book-ticket', Passes.bookTicket);
router.post('/payment/webhook', 
    express.raw({ type: 'application/json' }), // For webhook raw body handling
    Passes.handlePaymentWebhook
);


// Event Interaction Routes
router.get("/likeEvent/:id", Events.likeEvent);
router.get("/unlikeEvent/:id", Events.unlikeEvent);
router.get("/getAllLikedEvents", Events.getAllLikedEvents);

// Booking & Team Routes
router.post("/bookPass", Passes.bookTicket); // Consider consolidating with /api/book-ticket
router.post("/getPass", Passes.getPassByUserAndEvent);
router.post("/getTeam", Team.getTeam);
router.post("/reqEvent", Events.reqEventt);

router.use(checkRole(["admin"]));

// Ticket Scanning Routes
router.get("/CanScan", Passes.canScan);
router.post("/reject", Passes.Reject);
router.post("/accept", Passes.Accept);

// Event Management Routes
router.post("/addEvent", Events.addEvent);
router.delete("/deleteSpecificEvent/:eventId", Events.deleteSpecificEvent);

module.exports = router;
