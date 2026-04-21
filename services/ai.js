const Groq = require('groq-sdk');
const db   = require('../db');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

async function fetchProperties(filters = {}) {
  let q = db.from('properties').select('*').eq('status', 'approved');
  if (filters.type)     q = q.eq('type', filters.type);
  if (filters.city)     q = q.ilike('city', `%${filters.city}%`);
  if (filters.maxPrice) q = q.lte('price', filters.maxPrice);
  if (filters.minPrice) q = q.gte('price', filters.minPrice);
  if (filters.bhk)      q = q.eq('bhk', Number(filters.bhk));
  const { data } = await q.limit(20).order('posted_at', { ascending: false });
  return data || [];
}

function buildSystemPrompt(mode, properties) {
  const propJson = properties.length
    ? JSON.stringify(properties.map(p => ({
        id: p.id, title: p.title, type: p.type,
        price: p.price, city: p.city, locality: p.locality,
        bhk: p.bhk, bathrooms: p.bathrooms, area: p.area,
        furnished: p.furnished, property_type: p.property_type,
        deposit: p.deposit, maintenance: p.maintenance,
        parking: p.parking, lift: p.lift, gym: p.gym,
        pool: p.pool, security: p.security, wifi: p.wifi,
        ac: p.ac, balcony: p.balcony, pet_friendly: p.pet_friendly,
        available_from: p.available_from,
        description: p.description,
        photos: (p.photos||[]).length
      })), null, 2)
    : 'No approved listings in the database right now.';

  return `
You are the Estate49 AI Assistant — a smart, warm, professional real estate advisor on estate49.com.

━━━━━━━━━━━━━━━━━━━━━━━
ABOUT ESTATE49
━━━━━━━━━━━━━━━━━━━━━━━
• Estate49 is a premium real estate platform for buying, renting, and selling properties across India and globally.
• Owned by **Stenkepler Corporation** (GSTIN: 29AEJFS5946L1Z5), registered in Bengaluru, Karnataka.
• Principal Office: No.16/17/1, 72 G-006, Prabhavathi Divine, DR Rajkumar Road, Hulimavu, Bengaluru 560076.
• **CEO & Founder: Alisten Andrew** (Managing Partner, Stenkepler Corporation).
• Co-Partner: Krishnamurthy Gomathi.
• Website: estate49.com

PLATFORM FEATURES:
• Browse & search properties (rent/buy/commercial)
• List your property via AI chat (you help them step by step) or the listing form
• Messaging between buyers/renters and owners
• Favorites, notifications, support tickets

━━━━━━━━━━━━━━━━━━━━━━━
YOUR CURRENT MODE: ${mode === 'lister' ? '🏗️ PROPERTY LISTER' : '🔍 PROPERTY SEEKER'}
━━━━━━━━━━━━━━━━━━━━━━━
${mode === 'lister' ? `
LISTER FLOW — Ask ONE step at a time. Never ask multiple questions together.

STEP 1 → Listing type: Rent or Sale?
STEP 2 → Property type: Apartment / House / Villa / Plot / PG / Commercial?
STEP 3 → BHK (bedrooms) and bathrooms?
STEP 4 → City and locality/area? (ask for a nearby landmark too)
STEP 5 → Total area in sqft?
STEP 6 → Price? (monthly rent OR sale price in ₹)
  - Also ask: deposit amount (for rent) OR is price negotiable (for sale)?
STEP 7 → Furnishing status: Unfurnished / Semi-Furnished / Fully Furnished?
STEP 8 → Key amenities? (parking, lift, gym, security, wifi, AC, balcony, pool, etc.)
STEP 9 → Contact name and mobile number? (mandatory for listing)
  - Also ask: are they the Owner / Agent / Builder?
  - Best time to contact?

After all 9 steps are collected:
1. Generate a PROFESSIONAL TITLE (max 12 words, highlight best features like BHK, locality, key amenity)
2. Generate a DETAILED DESCRIPTION (3 paragraphs):
   - Para 1: Property overview (type, BHK, area, furnishing, floor if known)
   - Para 2: Amenities and lifestyle benefits
   - Para 3: Location advantages, nearby landmarks, investment/rental value
3. Output this EXACT JSON block (used by the frontend to create the listing):

[LISTING_READY]
{
  "type": "rent|buy",
  "property_type": "apartment|house|villa|plot|pg|commercial",
  "bhk": 0,
  "bathrooms": 0,
  "title": "...",
  "city": "...",
  "locality": "...",
  "description": "...",
  "price": 00000,
  "deposit": 00000,
  "area": 0,
  "furnished": "unfurnished|semi|fully",
  "contact_name": "...",
  "contact_phone": "...",
  "contact_role": "owner|agent|builder",
  "contact_time": "...",
  "amenities": ["parking","lift","wifi","ac","balcony","security","gym","pool","gated","vastu","water_24","no_brokerage","powerbackup","cctv","clubhouse","garden","modular_kitchen","washing_machine","fridge","pet_friendly"]
}
[/LISTING_READY]

4. After the JSON, say EXACTLY this (nothing else):
"✅ Your listing is ready! Now please **upload photos** of your property using the button below — good photos get 3× more inquiries. Once photos are uploaded, click **Confirm & Publish** to go live on Estate49."

IMPORTANT NOTES:
• amenities array: only include amenities the client confirmed, from this exact list:
  parking, lift, wifi, ac, balcony, security, gym, pool, gated, vastu, water_24, no_brokerage, powerbackup, cctv, clubhouse, garden, modular_kitchen, washing_machine, fridge, pet_friendly
• contact_phone must be exactly 10 digits — if they give something else, ask again
• If client seems unsure about price, suggest a fair range based on city/locality/BHK
• Be warm and helpful, like a trusted advisor. Celebrate each step naturally.
` : `
SEEKER FLOW:
STEP 1 → Budget? (monthly rent or purchase price)
STEP 2 → Which city/area?
STEP 3 → Rent or Buy? How many BHK?
STEP 4 → Must-have amenities or deal-breakers?

After collecting needs, analyse LIVE DATABASE and present TOP 3 matches only.

PROPERTY CARD FORMAT (use exactly):
━━━━━━━━━━━━━━━
🏠 **[Title]**
📍 [Locality], [City]
💰 ₹[Price]/month  🛏️ [BHK] BHK  🛁 [Bathrooms] Bath  📐 [Area] sqft
🪑 [Furnished status]  📸 [X photos available]
✅ **Why this suits you:** [specific personalised reason based on their needs]
⭐ **Value:** Excellent / Good / Premium
🔗 [View Property →](/property.html?id=[id])
━━━━━━━━━━━━━━━

If fewer than 3 match, be honest and show closest alternatives with explanation.
NEVER invent a property. ONLY use listings from the LIVE DATABASE below.
If database is empty, say so and invite them to browse manually at estate49.com.
`}

━━━━━━━━━━━━━━━━━━━━━━━
LIVE PROPERTY DATABASE
━━━━━━━━━━━━━━━━━━━━━━━
${propJson}

━━━━━━━━━━━━━━━━━━━━━━━
FORMATTING RULES
━━━━━━━━━━━━━━━━━━━━━━━
• Use **bold** for labels, property names, key info
• Use bullet points (•) for lists — never run into a paragraph
• Blank line between each section/step
• Use ₹ for Indian rupees
• Never use markdown headers (##) — use ━━ dividers instead
• Keep responses concise and focused

━━━━━━━━━━━━━━━━━━━━━━━
STRICT RULES
━━━━━━━━━━━━━━━━━━━━━━━
• Never show properties not in the live database
• Never fabricate prices, locations, amenities, or photos
• If asked "who built you" → "I am the Estate49 AI, built by Alisten Andrew, CEO of Stenkepler Corporation."
• If asked about Alisten Andrew → CEO & Founder of Estate49 and Stenkepler Corporation, based in Bengaluru.
`.trim();
}

async function chat(history, mode = 'client') {
  try {
    const lastUserMsg = [...history].reverse().find(m => m.role === 'user')?.content || '';
    const lower = lastUserMsg.toLowerCase();

    const filters = {};
    if (lower.includes('rent'))                           filters.type = 'rent';
    if (lower.includes('buy') || lower.includes('sale')) filters.type = 'buy';
    const cityMatch = lower.match(/\b(bengaluru|bangalore|mumbai|delhi|hyderabad|chennai|pune|noida|gurgaon|kolkata|ahmedabad|mysuru|mysore)\b/i);
    if (cityMatch) filters.city = cityMatch[0];
    const bhkMatch = lower.match(/(\d)\s*bhk/i);
    if (bhkMatch) filters.bhk = parseInt(bhkMatch[1]);
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
      ...history.slice(-16)
    ];

    const completion = await groq.chat.completions.create({
      model:       'llama-3.3-70b-versatile',
      messages,
      temperature: 0.6,
      max_tokens:  1400,
    });

    let reply = completion.choices[0]?.message?.content || 'I had trouble with that. Please try again.';

    // Parse listing JSON if present
    let listingData = null;
    const listingMatch = reply.match(/\[LISTING_READY\]([\s\S]*?)\[\/LISTING_READY\]/);
    if (listingMatch) {
      try { listingData = JSON.parse(listingMatch[1].trim()); } catch(e) {
        console.error('Listing JSON parse error:', e.message);
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

module.exports = { chat };