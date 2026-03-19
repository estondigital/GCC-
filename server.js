/**
 * ════════════════════════════════════════════════════════
 * GROWTH CONSULTING — server.js
 * Node.js / Express backend
 *
 * Endpoints:
 *   GET  /health        → health check
 *   POST /chat          → OpenAI GPT chat (streams reply)
 *   POST /save-lead     → append lead row to Google Sheets
 *
 * Deploy on Render (free tier) or Railway.
 * Set environment variables in your host dashboard:
 *   OPENAI_API_KEY   = sk-...
 *   GOOGLE_SHEET_ID  = <your Sheet ID from the URL>
 *   GOOGLE_CREDS     = <minified JSON string of service account key>
 *   PORT             = 3000 (optional — host sets this automatically)
 *
 * ════════════════════════════════════════════════════════
 */

'use strict';

const express  = require('express');
const cors     = require('cors');
const OpenAI   = require('openai');
const { google } = require('googleapis');

const app  = express();
const PORT = process.env.PORT || 3000;

/* ────────────────────────────────────────
   MIDDLEWARE
──────────────────────────────────────── */

// Allow requests from your GitHub Pages domain (update origin in production)
app.use(cors({
  origin: [
    'http://localhost:5500',    // Live Server dev
    'http://127.0.0.1:5500',
    'https://yourusername.github.io',  // ← update with your GitHub Pages URL
  ],
  methods: ['GET', 'POST', 'OPTIONS'],
}));

app.use(express.json({ limit: '256kb' }));

/* ────────────────────────────────────────
   OPENAI CLIENT
──────────────────────────────────────── */

let openai;
try {
  openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
} catch (e) {
  console.error('[OpenAI] Failed to initialise client:', e.message);
}

/**
 * System prompt for the AI assistant.
 * This shapes the AI's personality and purpose.
 */
const SYSTEM_PROMPT = `You are the AI assistant for Jithin George, a Senior B2B SaaS Product Marketing Consultant with 9+ years of experience.

Your role:
- Pre-qualify leads for Jithin by understanding their business, goals, and challenges
- Ask smart, consultative questions — not robotic form-filling
- Sound like a knowledgeable, slightly authoritative strategist (not a generic chatbot)
- Be conversational, warm, and direct
- Keep responses concise (2–4 sentences max unless explaining something complex)
- If someone asks a GTM, positioning, or demand gen question — give a genuinely insightful answer that demonstrates Jithin's expertise

Context about Jithin's work:
- He specialises in GTM strategy, product positioning, demand generation, and sales enablement for B2B SaaS
- He has worked with CareStack (US dental SaaS), Applexus Technologies (SAP enterprise), and Ingenious Infosolutions (HRMS/LMS)
- His typical engagement models: project-based, fractional PMM, strategy retainer, content system build
- He's available for Q3 2025

Do NOT:
- Sound robotic or list-heavy
- Ask more than one question at a time
- Use excessive emojis
- Pretend you can book meetings or check calendars`;

/* ────────────────────────────────────────
   GOOGLE SHEETS CLIENT
──────────────────────────────────────── */

/**
 * Build a Google Sheets auth client from the service account credentials.
 * Store the full JSON key as an env var: GOOGLE_CREDS='{"type":"service_account",...}'
 */
function getSheetsClient() {
  if (!process.env.GOOGLE_CREDS || !process.env.GOOGLE_SHEET_ID) {
    throw new Error('GOOGLE_CREDS or GOOGLE_SHEET_ID env var is missing');
  }

  const creds = JSON.parse(process.env.GOOGLE_CREDS);
  const auth  = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

/* ────────────────────────────────────────
   ROUTES
──────────────────────────────────────── */

/** Health check */
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    openai: !!openai,
    sheets: !!(process.env.GOOGLE_SHEET_ID && process.env.GOOGLE_CREDS),
  });
});

/**
 * POST /chat
 * Body: { messages: [{ role: 'user'|'assistant', content: string }] }
 * Response: { reply: string }
 */
app.post('/chat', async (req, res) => {
  const { messages } = req.body;

  // Basic validation
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages array is required' });
  }

  if (!openai) {
    return res.status(503).json({ error: 'OpenAI client not initialised — check OPENAI_API_KEY' });
  }

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',          // fast and cost-effective
      max_tokens: 280,               // keep replies concise
      temperature: 0.72,            // slightly creative but controlled
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        ...messages,
      ],
    });

    const reply = completion.choices[0]?.message?.content?.trim() || '';

    console.log(`[/chat] Tokens used: ${completion.usage?.total_tokens || '?'}`);
    res.json({ reply });

  } catch (err) {
    console.error('[/chat] OpenAI error:', err.message);
    const status = err.status || 500;
    res.status(status).json({ error: err.message });
  }
});

/**
 * POST /save-lead
 * Body: { business, phone, email, requirement, business_details, issues }
 * Appends a row to Google Sheet1.
 */
app.post('/save-lead', async (req, res) => {
  const { business, phone, email, requirement, business_details, issues } = req.body;

  // Validate required fields (at minimum an email or phone)
  if (!email && !phone) {
    return res.status(400).json({ error: 'At least email or phone is required' });
  }

  try {
    const sheets  = getSheetsClient();
    const sheetId = process.env.GOOGLE_SHEET_ID;
    const now     = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

    // Row layout:
    // Timestamp | Business | Phone | Email | Requirement | Business Details | Issues
    const row = [
      now,
      business          || '',
      phone             || '',
      email             || '',
      requirement       || '',
      business_details  || '',
      issues            || '',
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: 'Sheet1!A:G',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [row] },
    });

    console.log(`[/save-lead] Saved lead: ${email || phone}`);
    res.json({ success: true, message: 'Lead saved to Google Sheets' });

  } catch (err) {
    console.error('[/save-lead] Sheets error:', err.message);
    // Don't expose full error to client
    res.status(500).json({ error: 'Failed to save lead. Check server logs.' });
  }
});

/* ────────────────────────────────────────
   START SERVER
──────────────────────────────────────── */

app.listen(PORT, () => {
  console.log('\n════════════════════════════════════════');
  console.log('  Growth Consulting Backend');
  console.log(`  Listening on port ${PORT}`);
  console.log(`  OpenAI: ${openai ? '✓ connected' : '✗ OPENAI_API_KEY missing'}`);
  console.log(`  Sheets: ${process.env.GOOGLE_SHEET_ID ? '✓ configured' : '✗ GOOGLE_SHEET_ID missing'}`);
  console.log('════════════════════════════════════════\n');
});
