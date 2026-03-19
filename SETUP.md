# 🚀 Growth Consulting — Full Setup Guide

Complete instructions to go from files → live website with AI chat agent, Google Sheets CRM, and WhatsApp redirect.

---

## 📁 Project Structure

```
frontend/          ← Deploy to GitHub Pages
  index.html
  style.css
  script.js

backend/           ← Deploy to Render (free)
  server.js
  package.json
```

---

## STEP 1 — Deploy the Frontend (GitHub Pages)

1. Create a new GitHub repository (e.g. `growth-consulting`)
2. Upload `index.html`, `style.css`, `script.js` to the root
3. Go to **Settings → Pages → Source: Deploy from branch → main → / (root)**
4. Your site is live at: `https://yourusername.github.io/growth-consulting/`

> **No backend yet?** The site works in **flow-only mode** immediately.  
> The chat collects info and opens WhatsApp — no AI, no Sheets needed.

---

## STEP 2 — Set Up Google Sheets CRM

### 2a. Create the Sheet

1. Go to [Google Sheets](https://sheets.google.com) → New spreadsheet
2. Name the first sheet `Sheet1`
3. Add these headers in row 1:
   ```
   A: Timestamp | B: Business | C: Phone | D: Email | E: Requirement | F: Business Details | G: Issues
   ```
4. Copy the **Sheet ID** from the URL:
   ```
   https://docs.google.com/spreadsheets/d/YOUR_SHEET_ID_HERE/edit
   ```

### 2b. Create a Service Account

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project (e.g. `growth-consulting`)
3. Navigate to **APIs & Services → Enable APIs**
4. Enable **Google Sheets API**
5. Go to **Credentials → Create Credentials → Service Account**
6. Name it anything, click through
7. On the service account page → **Keys → Add Key → JSON** → Download the file
8. Open the JSON file — you'll paste its contents as the `GOOGLE_CREDS` env var

### 2c. Share Sheet with Service Account

1. Open your Google Sheet
2. Click **Share**
3. Paste the service account email (found in the JSON file as `client_email`)
4. Give **Editor** access → Share

---

## STEP 3 — Get an OpenAI API Key

1. Go to [platform.openai.com](https://platform.openai.com)
2. Sign in → **API Keys → Create new secret key**
3. Copy the key (starts with `sk-...`)
4. **Add a small credit balance** — GPT-4o-mini costs ~$0.00015 per 1K input tokens

---

## STEP 4 — Deploy the Backend to Render

### 4a. Create Render Account

1. Go to [render.com](https://render.com) → Sign up (free)
2. Connect your GitHub account

### 4b. Create a new Web Service

1. **New → Web Service**
2. Connect your repo OR paste the backend files into a separate repo
3. Settings:
   - **Name**: `growth-consulting-api`
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: Free

### 4c. Add Environment Variables

In your Render service → **Environment** tab, add:

| Key               | Value                                              |
|-------------------|----------------------------------------------------|
| `OPENAI_API_KEY`  | `sk-your-key-here`                                 |
| `GOOGLE_SHEET_ID` | `your-sheet-id-from-url`                           |
| `GOOGLE_CREDS`    | Paste the **entire contents** of your service account JSON (minified — no line breaks) |

**To minify the JSON:**
```bash
# In terminal (macOS/Linux):
cat your-service-account.json | python3 -c "import json,sys; print(json.dumps(json.load(sys.stdin)))"
```
Or paste it into [jsonformatter.org](https://jsonformatter.org) → Minify.

### 4d. Deploy

1. Click **Deploy** — Render will build and start your server
2. After deploy, copy your **Service URL**: `https://growth-consulting-api.onrender.com`

---

## STEP 5 — Connect Frontend to Backend

Open `script.js` and update:

```js
// Line ~20
const API_BASE = 'https://growth-consulting-api.onrender.com'; // ← your Render URL
const USE_AI_BACKEND = true; // ← enable AI + Sheets
```

Also update the CORS origin in `server.js`:

```js
// Line ~35
origin: [
  'https://yourusername.github.io', // ← your GitHub Pages URL
],
```

Push the updated files to GitHub. Done!

---

## STEP 6 — Update Personal Details

In `script.js`:
```js
const WA_NUMBER = '919895391057'; // ← your number (no + or spaces)
```

In `server.js`, update the CORS origin with your GitHub Pages URL.

In `index.html`, search and replace:
- `jithingeorge-marketing-strategist` → your LinkedIn username
- `919895391057` → your WhatsApp number

---

## ✅ Full System Test Checklist

- [ ] Website loads on GitHub Pages
- [ ] Chat opens on "Chat with Me" click
- [ ] Flow asks all 7 questions in order
- [ ] Validation works (bad email rejected)
- [ ] Quick-reply chips work
- [ ] After all questions, WhatsApp opens with pre-filled message
- [ ] `/health` endpoint returns `{ status: 'ok', openai: true, sheets: true }`
- [ ] `/chat` endpoint returns AI replies
- [ ] Lead row appears in Google Sheet after submission

---

## 🔧 Local Development

### Frontend
Use VS Code Live Server or:
```bash
npx serve .
```

### Backend
```bash
cd backend
npm install

# Create .env file:
echo "OPENAI_API_KEY=sk-xxx" > .env
echo "GOOGLE_SHEET_ID=your-sheet-id" >> .env
echo "GOOGLE_CREDS={...minified json...}" >> .env

npm run dev
```

Update `API_BASE` in `script.js` to `http://localhost:3000`.

---

## 💡 Common Issues

| Problem | Fix |
|---------|-----|
| CORS error in browser | Add your frontend URL to `origin` array in `server.js` |
| Sheets write fails | Check service account email has Editor access to the sheet |
| OpenAI 401 error | Verify `OPENAI_API_KEY` in Render env vars, ensure billing is enabled |
| Render sleeps after 15min (free tier) | Upgrade to $7/mo Starter, or add a cron ping (UptimeRobot) |
| Chat works but no Sheets entry | Check `/health` endpoint, review Render logs |

---

## 📊 Google Sheet Column Layout

| A | B | C | D | E | F | G |
|---|---|---|---|---|---|---|
| Timestamp (IST) | Business | Phone/WA | Email | Requirement | Business Details | Issues |

---

## 🔒 Security Notes

- Never commit `OPENAI_API_KEY` or `GOOGLE_CREDS` to Git
- Use `.gitignore` to exclude `.env` files
- Consider adding rate limiting (`express-rate-limit`) for production
- The Google service account should only have access to the specific Sheet

---

*Built for Jithin George · Growth Consulting · B2B SaaS GTM & Revenue Strategy*
