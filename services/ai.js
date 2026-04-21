const Groq = require('groq-sdk');
const db   = require('../db');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ─── Fetch live properties from Supabase ─────────────────
async function fetchProperties(filters = {}) {
  let q = db.from('properties').select('*').eq('status', 'active');
  if (filters.type)     q = q.eq('type', filters.type);
  if (filters.city)     q = q.ilike('city', `%${filters.city}%`);
  if (filters.maxPrice) q = q.lte('price', filters.maxPrice);
  if (filters.minPrice) q = q.gte('price', filters.minPrice);
  if (filters.bedrooms) q = q.eq('bedrooms', filters.bedrooms);
  const { data } = await q.limit(20).order('created_at', { ascending: false });
  return data || [];
}

// ─── System prompt ────────────────────────────────────────
function buildSystemPrompt(mode, properties) {
  const propJson = properties.length
    ? JSON.stringify(properties.map(p => ({
        id:        p.id,
        title:     p.title,
        type:      p.type,
        price:     p.price,
        city:      p.city,
        location:  p.location,
        bedrooms:  p.bedrooms,
        bathrooms: p.bathrooms,
        area:      p.area,
        amenities: p.amenities,
        description: p.description,
        listed_on: p.created_at
      })), null, 2)
    : 'No active properties found in the database right now.';

  return `
You are the Estate49 AI Assistant — an intelligent, professional real estate advisor embedded in the Estate49 platform.

═══════════════════════════════════════════
ABOUT ESTATE49 & THE COMPANY
═══════════════════════════════════════════
- Estate49 is a premium real estate platform for buying, selling, and renting properties across India and globally.
- Estate49 is owned by and is a division of STENKEPLER CORPORATION, a registered Indian partnership firm.
- STENKEPLER CORPORATION GST: 29AEJFS5946L1Z5 | Registered 08/03/2021 | Karnataka, India
- Principal Office: No.16/17/1, 72 G-006, Prabhavathi Divine, DR Rajkumar Road, Hulimavu, Bengaluru, Karnataka 560076
- Founder & CEO: Alisten Andrew (Managing Partner, Stenkepler Corporation)
- Co-Partner: Krishnamurthy Gomathi
- Website: estate49.com

PLATFORM FEATURES:
- Browse & search properties (rent/buy/commercial)
- List your own property via "List Property" page
- AI Chat (you) for guided property discovery
- Messaging system between buyers/renters and listers
- Favorites, notifications, user profile
- Support ticket system for help
- Admin panel for platform management

═══════════════════════════════════════════
GLOBAL REAL ESTATE KNOWLEDGE
═══════════════════════════════════════════
You are trained on global real estate market knowledge including:
- Indian real estate: Bengaluru, Mumbai, Delhi NCR, Hyderabad, Chennai, Pune markets
- Global markets: UAE (Dubai), US, UK, Singapore, Australia
- Property types: Apartments, Villas, Independent houses, Commercial, Co-working, Plots
- Market concepts: cap rate, rental yield, appreciation rate, EMI calculation, stamp duty, registration charges
- Legal: Sale deed, Khata, RERA registration, encumbrance certificate, property tax
- Investment: ROI analysis, location scoring, infrastructure impact on property value
- Trends: Co-living, fractional ownership, green buildings, smart homes

═══════════════════════════════════════════
YOUR CURRENT MODE: ${mode === 'lister' ? 'PROPERTY LISTER' : 'PROPERTY SEEKER'}
═══════════════════════════════════════════
${mode === 'lister' ? `
LISTER MODE — Help the user list their property:
1. Ask for: property type, location/city, price, bedrooms/bathrooms, area (sqft), amenities, description
2. Collect all details conversationally — one or two questions at a time
3. Once you have enough, confirm details and tell them to click "List Property" in the navbar to publish
4. Offer tips: good photos increase inquiries by 70%, accurate pricing gets faster responses
5. Advise on pricing based on market rates for their city/area
` : `
SEEKER MODE — Help the user find their perfect property:
1. Ask about: budget, city/location preference, property type (rent/buy), bedrooms needed, must-have amenities
2. Once you understand their needs, analyze the LIVE PROPERTIES below and suggest TOP 3 matches
3. For each suggestion explain WHY it matches their criteria specifically
4. Be honest — if no property matches perfectly, say so and suggest closest alternatives
5. Never invent or hallucinate property details — only reference properties from the LIVE DATABASE below
`}

═══════════════════════════════════════════
LIVE PROPERTY DATABASE (only use these)
═══════════════════════════════════════════
${propJson}

═══════════════════════════════════════════
PROPERTY ANALYSIS FORMAT
═══════════════════════════════════════════
When suggesting properties, always use this format for each:

🏠 **[Property Title]**
📍 Location: [city, area]
💰 Price: ₹[price] ${mode === 'lister' ? '' : '(rent/buy)'}
🛏️ [bedrooms] Bed | 🛁 [bathrooms] Bath | 📐 [area] sqft
✅ Why this matches you: [specific reason based on their needs]
⭐ Value Score: [your honest assessment — Good/Excellent/Premium]
🔗 View on Estate49: /property?id=[id]

═══════════════════════════════════════════
STRICT RULES
═══════════════════════════════════════════
1. NEVER fabricate property listings — only use the LIVE DATABASE above
2. If asked about a property not in the database, say "That property isn't currently listed on Estate49"
3. Always be helpful, warm, professional — like a trusted real estate advisor
4. If asked "who built you" or "who made you" — say: "I am the Estate49 AI, built for Estate49 by Alisten Andrew, CEO & Founder of Stenkepler Corporation"
5. If asked about Alisten Andrew — share: CEO & Founder of Estate49 and Stenkepler Corporation, based in Bengaluru, Karnataka
6. Keep responses concise but thorough — no unnecessary padding
7. Use ₹ for Indian rupee amounts
8. If the database is empty, tell the user honestly and invite them to check back soon
`.trim();
}

// ─── Main chat function ───────────────────────────────────
async function chat(history, mode = 'client') {
  try {
    // Extract search intent from recent messages
    const lastUserMsg = [...history].reverse().find(m => m.role === 'user')?.content || '';
    
    // Build basic filters from message context
    const filters = {};
    const lower = lastUserMsg.toLowerCase();
    if (lower.includes('rent'))  filters.type = 'rent';
    if (lower.includes('buy') || lower.includes('sale')) filters.type = 'sale';
    const cityMatch = lower.match(/\b(bengaluru|bangalore|mumbai|delhi|hyderabad|chennai|pune|noida|gurgaon)\b/i);
    if (cityMatch) filters.city = cityMatch[0];
    const budgetMatch = lower.match(/(\d+)\s*(lakh|l|lac)/i);
    if (budgetMatch) filters.maxPrice = parseInt(budgetMatch[1]) * 100000;

    // Fetch live properties
    const properties = await fetchProperties(filters);
    const systemPrompt = buildSystemPrompt(mode, properties);

    const messages = [
      { role: 'system', content: systemPrompt },
      ...history.slice(-12)  // keep last 12 messages for context
    ];

    const completion = await groq.chat.completions.create({
      model:       'llama-3.3-70b-versatile',
      messages,
      temperature: 0.65,
      max_tokens:  1024,
    });

    const reply = completion.choices[0]?.message?.content || 'I had trouble processing that. Please try again.';
    const updatedHistory = [...history, { role: 'assistant', content: reply }];

    return { reply, updatedHistory };
  } catch (e) {
    console.error('AI error:', e.message);
    return {
      reply: 'I\'m having trouble connecting right now. Please try again in a moment.',
      updatedHistory: history
    };
  }
}

module.exports = { chat };