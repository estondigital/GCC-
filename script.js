/**
 * ════════════════════════════════════════════════════════
 * GROWTH CONSULTING — script.js
 * AI Chat Agent + WhatsApp Lead System
 *
 * Architecture:
 *   1. Header scroll & mobile menu
 *   2. Scroll-reveal IntersectionObserver
 *   3. Chat widget open/close
 *   4. Guided conversation flow (step-by-step lead capture)
 *   5. OpenAI backend integration (POST /chat)
 *   6. Lead save to Google Sheets (POST /save-lead)
 *   7. WhatsApp redirect with formatted message
 *
 * No frameworks. Pure vanilla JS.
 * ════════════════════════════════════════════════════════
 */

'use strict';

/* ────────────────────────────────────────
   CONFIG
──────────────────────────────────────── */

/**
 * Your deployed backend URL (Render, Railway, etc.)
 * In development: 'http://localhost:3000'
 * In production: 'https://your-app.onrender.com'
 */
const API_BASE = 'https://your-backend.onrender.com';

/** WhatsApp number — country code + number, no spaces/+ */
const WA_NUMBER = '919895391057';

/**
 * Whether to use the AI backend for open-ended chat.
 * Set to false to run in pure "guided flow only" mode
 * (no backend required — works on GitHub Pages alone).
 */
const USE_AI_BACKEND = true;

/* ────────────────────────────────────────
   GUIDED CONVERSATION FLOW
   Steps run in order. After all steps complete,
   the system saves the lead and opens WhatsApp.
──────────────────────────────────────── */

const FLOW = [
  {
    key: null, // null = no data collected (intro step)
    bot: "Hey 👋 I'm Jithin's AI assistant — here to make sure he gets all the context he needs before you speak.\n\nThis'll take about 2 minutes. Ready to get started?",
    quick: ["Yes, let's go 🚀", "I have a quick question first"],
  },
  {
    key: 'business',
    bot: "What's the name of your **business or company**?",
    quick: [],
    validate: v => v.trim().length < 2 ? "Please enter your business name." : null,
  },
  {
    key: 'phone',
    bot: "What's your **WhatsApp number**? (Include country code — e.g. +91 98765 43210)\n\nJithin responds fastest there.",
    quick: [],
    validate: v => v.replace(/\D/g,'').length < 7 ? "Please enter a valid phone number." : null,
  },
  {
    key: 'email',
    bot: "And your **email address**?",
    quick: [],
    validate: v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) ? null : "Please enter a valid email address.",
  },
  {
    key: 'requirement',
    bot: "What's your **main goal** right now?\n\nAre you looking for GTM strategy, demand gen, positioning, sales enablement — or something else entirely?",
    quick: ['GTM Strategy & Launch', 'Demand Generation', 'Positioning & Messaging', 'Sales Enablement', 'Content System Build'],
  },
  {
    key: 'business_details',
    bot: "Tell me a bit about **your business** — what you do, who you sell to, and what stage you're at. Even a few sentences helps Jithin come prepared.",
    quick: [],
  },
  {
    key: 'issues',
    bot: "Last one — what's the **biggest growth blocker** you're hitting right now?\n\nThe more honest and specific, the more useful Jithin's response will be.",
    quick: [
      'Low qualified leads',
      'Unclear positioning / messaging',
      'Weak pipeline velocity',
      'High customer acquisition cost',
      'No GTM strategy or playbook',
      'Poor product-market fit signals',
    ],
  },
];

/* ────────────────────────────────────────
   STATE
──────────────────────────────────────── */

/** Stores collected lead data keyed by FLOW[step].key */
const lead = {};

/** Conversation history sent to the AI (role/content pairs) */
const aiHistory = [];

/** Current step index in FLOW (advances as user answers) */
let step = 0;

/** Whether we're mid-flow (awaiting user input) */
let waitingForInput = true;

/** Whether the chat has been initialised at least once */
let started = false;

/** Whether we're currently awaiting an AI response */
let aiPending = false;

/* ────────────────────────────────────────
   DOM REFERENCES
──────────────────────────────────────── */

const el = id => document.getElementById(id);

const DOM = {
  header:      el('site-header'),
  hamburger:   el('hamburger'),
  mobileNav:   el('mobile-nav'),
  fab:         el('chat-fab'),
  panel:       el('chat-panel'),
  messages:    el('cp-messages'),
  footer:      el('cp-footer'),
  quick:       el('cp-quick'),
  input:       el('cp-input'),
  send:        el('cp-send'),
  close:       el('cp-close'),
  success:     el('cp-success'),
  restart:     el('cp-restart'),
  notif:       el('fab-notif'),
  statusDot:   el('cp-status'),
  statusTxt:   el('cp-status-text'),
};

/* ────────────────────────────────────────
   1. HEADER — scroll effect
──────────────────────────────────────── */

(function initHeader() {
  const onScroll = () => DOM.header.classList.toggle('scrolled', window.scrollY > 24);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
})();

/* ────────────────────────────────────────
   2. MOBILE MENU
──────────────────────────────────────── */

(function initMobileMenu() {
  DOM.hamburger.addEventListener('click', () => {
    const open = DOM.mobileNav.classList.toggle('open');
    DOM.hamburger.classList.toggle('open', open);
    DOM.hamburger.setAttribute('aria-expanded', open);
    DOM.mobileNav.setAttribute('aria-hidden', !open);
  });

  DOM.mobileNav.querySelectorAll('.mn-link').forEach(a =>
    a.addEventListener('click', () => {
      DOM.mobileNav.classList.remove('open');
      DOM.hamburger.classList.remove('open');
      DOM.hamburger.setAttribute('aria-expanded', 'false');
    })
  );
})();

/* ────────────────────────────────────────
   3. SCROLL-REVEAL
──────────────────────────────────────── */

(function initReveal() {
  const io = new IntersectionObserver(
    entries => entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); io.unobserve(e.target); } }),
    { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
  );
  document.querySelectorAll('.reveal').forEach(el => io.observe(el));
})();

/* ────────────────────────────────────────
   4. SMOOTH SCROLL + ACTIVE NAV
──────────────────────────────────────── */

(function initNav() {
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', e => {
      const t = document.querySelector(a.getAttribute('href'));
      if (!t) return;
      e.preventDefault();
      window.scrollTo({ top: t.getBoundingClientRect().top + scrollY - 68, behavior: 'smooth' });
    });
  });
})();

/* ────────────────────────────────────────
   5. CHAT WIDGET — OPEN / CLOSE
──────────────────────────────────────── */

/**
 * Toggle or force the chat open/closed.
 * @param {boolean} [force] - true = open, false = close
 */
function toggleChat(force) {
  const willOpen = force !== undefined ? force : !DOM.panel.classList.contains('open');
  DOM.panel.classList.toggle('open', willOpen);
  DOM.fab.classList.toggle('open', willOpen);

  if (willOpen) {
    DOM.notif.classList.add('hidden');
    DOM.fab.setAttribute('aria-label', 'Close chat');
    if (!started) { started = true; setTimeout(runFlow, 350); }
    else DOM.input.focus();
  } else {
    DOM.fab.setAttribute('aria-label', 'Open chat');
  }
}

// Wire up all open triggers
['nav-chat-btn','mobile-chat-btn','hero-chat-btn','cta-chat-btn','contact-chat-btn'].forEach(id => {
  const btn = el(id);
  if (btn) btn.addEventListener('click', () => toggleChat(true));
});

DOM.fab.addEventListener('click', () => toggleChat());
DOM.close.addEventListener('click', () => toggleChat(false));

// Escape key closes
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && DOM.panel.classList.contains('open')) toggleChat(false);
});

/* ────────────────────────────────────────
   6. CHAT FLOW ENGINE
──────────────────────────────────────── */

/** Kick off the guided flow from step 0 */
function runFlow() {
  step = 0;
  waitingForInput = true;
  showFlowStep(0);
}

/**
 * Show a specific step in FLOW.
 * Shows typing delay, then renders the bot message + quick replies.
 * @param {number} idx
 */
async function showFlowStep(idx) {
  if (idx >= FLOW.length) {
    await finaliseLead();
    return;
  }

  clearQuickReplies();
  const s = FLOW[idx];
  const typing = addTyping();
  const delay = 700 + Math.min(s.bot.replace(/\*\*/g,'').length * 7, 1000);
  await sleep(delay);
  removeTyping(typing);
  addBotMsg(s.bot);

  if (s.quick && s.quick.length) renderQuickReplies(s.quick);
  scrollDown();
  DOM.input.focus();
}

/* ────────────────────────────────────────
   7. INPUT HANDLING
──────────────────────────────────────── */

/** Handle a message from the user (typed or chip) */
async function handleInput(text) {
  if (!waitingForInput || !text.trim()) return;

  // If all flow steps are done, treat as open-ended AI conversation
  if (step >= FLOW.length) {
    await handleOpenEndedAI(text);
    return;
  }

  const s = FLOW[step];

  // Validate if the step has a validator
  if (s.validate) {
    const err = s.validate(text);
    if (err) { addMsg('msg-err', '⚠️ ' + err); scrollDown(); return; }
  }

  // Lock input, show user bubble
  waitingForInput = false;
  clearQuickReplies();
  addUserMsg(text);

  // Store the answer
  if (s.key) lead[s.key] = text.trim();

  // Add to AI history context
  aiHistory.push({ role: 'user', content: text.trim() });

  step++;
  await sleep(250);
  waitingForInput = true;
  await showFlowStep(step);
}

/**
 * Handle open-ended conversation AFTER the flow is done.
 * Calls the OpenAI backend if enabled, else falls back gracefully.
 * @param {string} text
 */
async function handleOpenEndedAI(text) {
  waitingForInput = false;
  clearQuickReplies();
  addUserMsg(text);
  aiHistory.push({ role: 'user', content: text });

  setStatus('ai-thinking', 'AI is thinking…');
  const typing = addTyping();

  let reply = '';

  if (USE_AI_BACKEND) {
    try {
      const res = await fetch(`${API_BASE}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: aiHistory }),
        signal: AbortSignal.timeout(18000),
      });

      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data = await res.json();
      reply = data.reply || "I didn't catch that — could you rephrase?";
    } catch (err) {
      console.error('[Chat] AI request failed:', err);
      reply = "I'm having a small connection issue right now — but your message is noted! Jithin will see everything and follow up directly via WhatsApp. 🙏";
    }
  } else {
    // Fallback: no backend
    await sleep(900);
    reply = "Thanks for sharing that! Jithin will review everything and come back with a personalised response via WhatsApp.";
  }

  removeTyping(typing);
  aiHistory.push({ role: 'assistant', content: reply });
  addBotMsg(reply);
  setStatus('ready', 'Ready');
  waitingForInput = true;
  scrollDown();
}

/* ────────────────────────────────────────
   8. LEAD FINALISATION
──────────────────────────────────────── */

/**
 * After all flow steps:
 * 1. Confirm to user
 * 2. Save lead to backend (Google Sheets)
 * 3. Open WhatsApp with pre-filled message
 * 4. Show success screen
 */
async function finaliseLead() {
  waitingForInput = false;

  const typing = addTyping();
  await sleep(900);
  removeTyping(typing);
  addBotMsg("✅ Perfect — I've got everything Jithin needs.\n\nI'm sending your details to him on WhatsApp right now and saving them for follow-up. He'll reach out within a few hours.");
  scrollDown();

  await sleep(1400);

  // Save to Google Sheets via backend
  await saveLead();

  // Build WhatsApp message and open
  const waMsg = buildWAMessage();
  window.open(`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(waMsg)}`, '_blank', 'noopener,noreferrer');

  // Show success screen
  showSuccess();
}

/** POST lead data to the backend /save-lead endpoint */
async function saveLead() {
  if (!USE_AI_BACKEND) return;
  try {
    await fetch(`${API_BASE}/save-lead`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(lead),
    });
    console.log('[Chat] Lead saved to Google Sheets ✓');
  } catch (err) {
    console.warn('[Chat] Lead save failed (continuing):', err);
  }
}

/**
 * Build the formatted WhatsApp message from collected lead data.
 * @returns {string}
 */
function buildWAMessage() {
  return [
    '🌟 *New Consulting Enquiry — Website AI Chat*',
    '',
    `🏢 *Business:*        ${lead.business          || '—'}`,
    `📞 *Phone / WA:*      ${lead.phone             || '—'}`,
    `📧 *Email:*           ${lead.email             || '—'}`,
    '',
    `📋 *Main Requirement:*`,
    `${lead.requirement        || '—'}`,
    '',
    `🏗 *About the Business:*`,
    `${lead.business_details   || '—'}`,
    '',
    `⚠️ *Biggest Challenge:*`,
    `${lead.issues             || '—'}`,
    '',
    '──────────────────────',
    `_Via Growth Consulting AI Chat · ${new Date().toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' })}_`,
  ].join('\n');
}

/* ────────────────────────────────────────
   9. UI HELPERS
──────────────────────────────────────── */

/** Add a bot message bubble */
function addBotMsg(text) {
  return addMsg('msg-bot', text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>'), true);
}

/** Add a user message bubble */
function addUserMsg(text) {
  return addMsg('msg-user', text);
}

/**
 * Add a message to the chat.
 * @param {string} cls - CSS class
 * @param {string} content - Text or HTML
 * @param {boolean} [html] - If true, set innerHTML
 */
function addMsg(cls, content, html = false) {
  const div = document.createElement('div');
  div.className = `msg ${cls}`;
  if (html) div.innerHTML = content;
  else div.textContent = content;
  DOM.messages.appendChild(div);
  scrollDown();
  return div;
}

/** Add the animated typing indicator; returns the element */
function addTyping() {
  const div = document.createElement('div');
  div.className = 'msg msg-typing';
  div.innerHTML = '<div class="typing-dots"><span></span><span></span><span></span></div>';
  DOM.messages.appendChild(div);
  scrollDown();
  return div;
}

/** Remove a typing indicator element */
function removeTyping(el) {
  if (el && el.parentNode) el.parentNode.removeChild(el);
}

/** Scroll the messages area to the bottom */
function scrollDown() {
  requestAnimationFrame(() => { DOM.messages.scrollTop = DOM.messages.scrollHeight; });
}

/** Render quick-reply chips */
function renderQuickReplies(options) {
  clearQuickReplies();
  options.forEach(label => {
    const btn = document.createElement('button');
    btn.className = 'qr-chip';
    btn.textContent = label;
    btn.type = 'button';
    btn.addEventListener('click', () => {
      clearQuickReplies();
      DOM.input.value = '';
      DOM.send.disabled = true;
      handleInput(label);
    });
    DOM.quick.appendChild(btn);
  });
}

/** Clear all quick-reply chips */
function clearQuickReplies() {
  DOM.quick.innerHTML = '';
}

/** Update the status bar */
function setStatus(state, text) {
  DOM.statusDot.className = `cp-status ${state}`;
  DOM.statusTxt.textContent = text;
}

/** Show the success screen (hides messages + footer) */
function showSuccess() {
  DOM.messages.style.display = 'none';
  DOM.footer.style.display   = 'none';
  DOM.success.hidden = false;
}

/* ────────────────────────────────────────
   10. RESET
──────────────────────────────────────── */

DOM.restart.addEventListener('click', () => {
  // Reset state
  Object.keys(lead).forEach(k => delete lead[k]);
  aiHistory.length = 0;
  step = 0;
  waitingForInput = true;
  aiPending = false;

  // Reset DOM
  DOM.messages.innerHTML = '';
  clearQuickReplies();
  DOM.messages.style.display = '';
  DOM.footer.style.display   = '';
  DOM.success.hidden = true;
  DOM.input.value = '';
  DOM.input.style.height = 'auto';
  DOM.send.disabled = true;
  setStatus('ready', 'Ready');

  showFlowStep(0);
});

/* ────────────────────────────────────────
   11. INPUT EVENTS
──────────────────────────────────────── */

(function initInputEvents() {
  // Enable / disable send button
  DOM.input.addEventListener('input', () => {
    DOM.send.disabled = DOM.input.value.trim().length === 0;
    // Auto-resize textarea
    DOM.input.style.height = 'auto';
    DOM.input.style.height = Math.min(DOM.input.scrollHeight, 88) + 'px';
  });

  // Enter = send (Shift+Enter = newline)
  DOM.input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!DOM.send.disabled) sendFromInput();
    }
  });

  DOM.send.addEventListener('click', sendFromInput);
})();

function sendFromInput() {
  const text = DOM.input.value.trim();
  if (!text) return;
  DOM.input.value = '';
  DOM.input.style.height = 'auto';
  DOM.send.disabled = true;
  handleInput(text);
}

/* ────────────────────────────────────────
   12. UTILITY
──────────────────────────────────────── */

/** Promise-based sleep */
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ────────────────────────────────────────
   INIT LOG
──────────────────────────────────────── */
console.log('%cGrowth Consulting AI System', 'color:#f59e0b;font-weight:bold;font-size:14px;');
console.log('%cChat agent ready. Backend: ' + (USE_AI_BACKEND ? API_BASE : 'DISABLED (flow-only mode)'), 'color:#8896a9;font-size:12px;');
