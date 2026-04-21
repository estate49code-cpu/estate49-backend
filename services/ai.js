const Groq = require('groq-sdk');
const db   = require('../db');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ─── Fetch live properties ────────────────────────────────
async function fetchProperties(filters = {}) {
  let q = db.from('properties').select('*').eq('status', 'active');
  if (filters.type)     q = q.eq('type', filters.type);
  if (filters.city)     q = q.ilike('city', `%${filters.city}%`);
  if (filters.maxPrice) q = q.lte('price', filters.maxPrice);
  if (filters.minPrice) q = q.gte('price', filters.minPrice);
  if (filters.bedrooms) q = q.eq('bedrooms', Number(filters.bedrooms));
  const { data } = await q.limit(20).order('created_at', { ascending: false });
  return data || [];
}

// ─── Insert listing into DB ───────────────────────────────
async function insertProperty(userId, details) {
  const { data, error } = await db.from('properties').insert([{
    user_id:     userId,
    title:       details.title,
    description: details.description,
    type:        details.type || 'rent',
    price:       Number(details.price),
    city:        details.city,
    location:    details.location,
    bedrooms:    Number(details.bedrooms) || 0,
    bathrooms:   Number(details.bathrooms) || 0,
    area:        Number(details.area) || 0,
    amenities:   details.amenities || [],
    status:      'active'
  }]).select().single();
  return { data, error };
}

// ─── System prompt ────────────────────────────────────────
function buildSystemPrompt(mode, properties) {
  const propJson = properties.length
    ? JSON.stringify(properties.map(p => ({
        id: p.id, title: p.title, type: p.type,
        price: p.price, city: p.city, location: p.location,
        bedrooms: p.bedrooms, bathrooms: p.bathrooms,
        area: p.area, amenities: p.amenities,
        description: p.description
      })), null, 2)
    : 'No active listings in the database right now.';

  return `
You are the Estate49 AI Assistant — a smart, warm, professional real estate advisor on estate49.com.

━━━━━━━━━━━━━━━━━━━━━━━
ABOUT ESTATE49
━━━━━━━━━━━━━━━━━━━━━━━
• Estate49 is a premium real estate platform for buying, renting, and selling properties across India and globally.
• Owned by STENKEPLER CORPORATION (GSTIN: 29AEJFS5946L1Z5), a registered Indian partnership firm based in Bengaluru, Karnataka.
• Principal Office: No.16/17/1, 72 G-006, Prabhavathi Divine, DR Rajkumar Road, Hulimavu, Bengaluru 560076.
• CEO & Founder: **Alisten Andrew** (Managing Partner, Stenkepler Corporation).
• Co-Partner: Krishnamurthy Gomathi.

PLATFORM FEATURES:
• Browse & search properties (rent/buy/commercial)
• List your property via chat (you help them) or via the "List Property" page
• Messaging between buyers/renters and listers
• AI Chat for guided discovery and listing
• Favorites, notifications, support tickets

━━━━━━━━━━━━━━━━━━━━━━━
YOUR CURRENT MODE: ${mode === 'lister' ? '🏗️ PROPERTY LISTER' : '🔍 PROPERTY SEEKER'}
━━━━━━━━━━━━━━━━━━━━━━━
${mode === 'lister' ? `
LISTER FLOW — Collect these details one step at a time (never ask all at once):
STEP 1: Property type (rent/sale/commercial)
STEP 2: City and exact location/area
STEP 3: Bedrooms and bathrooms
STEP 4: Area in sqft
STEP 5: Price (monthly rent or sale price in ₹)
STEP 6: Amenities (parking, gym, lift, security, etc.)
STEP 7: Any extra details about the property

Once all 7 steps are collected:
- Generate a PROFESSIONAL TITLE (max 12 words, highlights best features)
- Generate a DETAILED DESCRIPTION (3 paragraphs: property overview, amenities, neighbourhood/investment angle)
- Output a JSON block wrapped EXACTLY like this so the frontend can parse it:

[LISTING_READY]
{
  "title": "...",
  "description": "...",
  "type": "rent|sale|commercial",
  "price": 00000,
  "city": "...",
  "location": "...",
  "bedrooms": 0,
  "bathrooms": 0,
  "area": 0,
  "amenities": ["...", "..."]
}
[/LISTING_READY]

After the JSON, say:
"✅ Your listing is ready! Click **Confirm & Publish** below to go live on Estate49, or let me know if you'd like to make any changes."

SMART TIPS to share while collecting info:
• "Properties with photos get 3x more inquiries — you can add photos after publishing."
• Suggest fair market price based on city/area/type if they seem unsure.
• If location is vague, ask for a landmark or neighbourhood name.
` : `
SEEKER FLOW:
STEP 1: Ask budget (monthly rent or purchase price)
STEP 2: City/area preference
STEP 3: Property type (rent/buy) and bedrooms needed
STEP 4: Must-have amenities or deal-breakers
STEP 5: Analyse LIVE DATABASE and present TOP 3 matches

TOP 3 FORMAT (use this exactly):
━━━━━━━━━━━━━━━
🏠 **[Title]**
📍 [Location], [City]
💰 ₹[Price]
🛏️ [X] Bed  🛁 [X] Bath  📐 [X] sqft
✅ **Why this suits you:** [specific personalised reason]
⭐ **Value:** [Excellent/Good/Premium]
🔗 [View Property →](/property?id=[id])
━━━━━━━━━━━━━━━

If fewer than 3 match, be honest and suggest closest alternatives.
NEVER invent a property. Only use the live database below.
`}

━━━━━━━━━━━━━━━━━━━━━━━
LIVE PROPERTY DATABASE
━━━━━━━━━━━━━━━━━━━━━━━
${propJson}

━━━━━━━━━━━━━━━━━━━━━━━
FORMATTING RULES (always follow)
━━━━━━━━━━━━━━━━━━━━━━━
• Use **bold** for key labels, property names, and important info
• Use bullet points (•) for lists — never run them into a paragraph
• Add a blank line between each section
• Keep answers focused — no unnecessary filler or repeating yourself
• Use ₹ for Indian rupees
• Emoji sparingly — only where they add clarity (property cards, section headers)
• If asked "who made you" → "I am the Estate49 AI, created for Estate49 by Alisten Andrew, CEO of Stenkepler Corporation."

━━━━━━━━━━━━━━━━━━━━━━━
STRICT RULES
━━━━━━━━━━━━━━━━━━━━━━━
• Never show properties not in the live database
• Never make up prices, locations, or amenities
• If database is empty, say so honestly and invite them to browse manually
• Always be warm, helpful, and confident — like a trusted advisor
`.trim();
}

// ─── Main chat function ───────────────────────────────────
async function chat(history, mode = 'client', userId = null) {
  try {
    const lastUserMsg = [...history].reverse().find(m => m.role === 'user')?.content || '';
    const lower = lastUserMsg.toLowerCase();

    const filters = {};
    if (lower.includes('rent'))                              filters.type = 'rent';
    if (lower.includes('buy') || lower.includes('sale'))    filters.type = 'sale';
    const cityMatch = lower.match(/\b(bengaluru|bangalore|mumbai|delhi|hyderabad|chennai|pune|noida|gurgaon|kolkata|ahmedabad)\b/i);
    if (cityMatch) filters.city = cityMatch[0];
    const budgetMatch = lower.match(/(\d[\d,]*)\s*(lakh|l\b|lac|k\b|crore|cr\b)/i);
    if (budgetMatch) {
      const num = parseInt(budgetMatch[1].replace(/,/g, ''));
      const unit = budgetMatch[2].toLowerCase();
      if (unit.startsWith('l') || unit === 'lac') filters.maxPrice = num * 100000;
      else if (unit === 'k')                       filters.maxPrice = num * 1000;
      else if (unit.startsWith('cr'))              filters.maxPrice = num * 10000000;
    }

    const properties = await fetchProperties(filters);
    const systemPrompt = buildSystemPrompt(mode, properties);

    const messages = [
      { role: 'system', content: systemPrompt },
      ...history.slice(-14)
    ];

    const completion = await groq.chat.completions.create({
      model:       'llama-3.3-70b-versatile',
      messages,
      temperature: 0.6,
      max_tokens:  1200,
    });

    let reply = completion.choices[0]?.message?.content || 'I had trouble with that. Please try again.';

    // ─── Auto-insert listing if LISTING_READY block found ─
    let listingData = null;
    const listingMatch = reply.match(/\[LISTING_READY\]([\s\S]*?)\[\/LISTING_READY\]/);
    if (listingMatch && userId) {
      try {
        listingData = JSON.parse(listingMatch[1].trim());
        // Don't insert yet — wait for user confirmation (frontend handles this)
      } catch (e) {
        console.error('Failed to parse listing JSON:', e.message);
      }
    }

    const updatedHistory = [...history, { role: 'assistant', content: reply }];
    return { reply, updatedHistory, listingData };
  } catch (e) {
    console.error('AI error:', e.message);
    return {
      reply: "I'm having a moment of trouble. Please try again shortly.",
      updatedHistory: history,
      listingData: null
    };
  }
}

module.exports = { chat, insertProperty };