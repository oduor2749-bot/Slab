# SLAB
Mobile game for cash

This repository includes a website + API plus M-Pesa (Daraja) STK Push support.

## Quick start

1. Install dependencies:
   npm install
2. Copy the environment example:
   cp .env.example .env
3. Fill in the values in `.env` (especially MPESA_* values for STK push).
4. Start the server:
   npm start

Then open:
- http://localhost:3000/
- http://localhost:3000/admin

## STK Push (Daraja)

To initiate an STK push (Lipa na M-Pesa) you can POST to:

  POST /api/mpesa/stkpush
  Content-Type: application/json
  Body: { "amount": 100, "phone": "+2547XXXXXXXX", "accountReference": "INV-123", "transactionDesc": "Payment" }

The server will contact Daraja and return the immediate response. When the user completes/declines the payment, Daraja will POST the asynchronous result to /api/mpesa/stkpush/callback (this URL is set automatically from MPESA_CALLBACK_BASE in .env).

## Testing locally with sandbox

1. Set MPESA_ENV=sandbox and provide sandbox MPESA_CONSUMER_KEY and MPESA_CONSUMER_SECRET and MPESA_SHORTCODE/PASSKEY (from Safaricom sandbox portal).
2. Ensure MPESA_CALLBACK_BASE is reachable by Safaricom (use a tunnel like ngrok and set the tunnel URL here).
3. Initiate STK push via the sample curl below.

Example sandbox curl to start STK push:

curl -X POST http://localhost:3000/api/mpesa/stkpush -H "Content-Type: application/json" -d '{"amount":10,"phone":"+2547XXXXXXXX","accountReference":"TEST","transactionDesc":"Test pay"}'

Example sample callback payload (sandbox) is included in samples/mpesa-callback-sample.json — you can POST that to /api/mpesa/stkpush/callback to simulate Daraja.
