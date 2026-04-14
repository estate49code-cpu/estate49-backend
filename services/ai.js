const Groq = require('groq-sdk');
const supabase = require('../db');
const { fetchNearbyPlaces, buildNearbyAdvice } = require('./nearby');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const MODEL = 'llama-3.1-8b-instant';

// ─── Tool Definitions ────────────────────────────────────────────────────────

const clientTools = [
  {
    type: 'function',
    function: {
      name: 'search_properties',
      description:
        'Search properties from the database. Return list in array called properties in same order shown to user. When user says "1st", "second", etc., use 1-based index to pick property.id for get_property_details.',
      parameters: {
        type: 'object',
        properties: {
          property_type: { type: 'string', enum: ['rent', 'sale'] },
          bhk:           { type: 'number' },
          max_price:     { type: 'number' },
          min_price:     { type: 'number' },
          locality:      { type: 'string' },
          furnishing:    { type: 'string', enum: ['unfurnished', 'semi-furnished', 'fully-furnished'] },
          parking:       { type: 'string', enum: ['none', 'bike', 'car', 'car+bike'] },
          pincode:       { type: 'string' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_property_details',
      description: 'Get full details of a specific property by its ID including nearby places and photos.',
      parameters: {
        type: 'object',
        properties: {
          property_id: { type: 'string', description: 'UUID of the property' }
        },
        required: ['property_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_web',
      description:
        'Search the web for current real estate market news, property prices, project updates, and investment insights for any city or country. ALWAYS call this when user asks about: current market conditions, specific project status, price trends, investment safety, news about any location, or any "live" real estate topic.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Precise search query e.g. "Dubai real estate market 2025 investment safe" or "Prestige Finsbury Park Bengaluru project update"'
          }
        },
        required: ['query']
      }
    }
  }
];

const listerTools = [
  {
    type: 'function',
    function: {
      name: 'save_property_listing',
      description: 'Save a new property listing to the database after collecting all required details.',
      parameters: {
        type: 'object',
        properties: {
          title:            { type: 'string' },
          property_type:    { type: 'string', enum: ['rent', 'sale'] },
          bhk:              { type: 'number' },
          price:            { type: 'number' },
          area_sqft:        { type: 'number' },
          description:      { type: 'string' },
          address:          { type: 'string' },
          locality:         { type: 'string' },
          landmark:         { type: 'string' },
          pincode:          { type: 'string' },
          city:             { type: 'string' },
          furnishing:       { type: 'string', enum: ['unfurnished', 'semi-furnished', 'fully-furnished'] },
          parking:          { type: 'string', enum: ['none', 'bike', 'car', 'car+bike'] },
          listing_source:   { type: 'string', enum: ['owner', 'broker', 'builder'] },
          contact_name:     { type: 'string' },
          contact_phone:    { type: 'string' },
          owner_whatsapp:   { type: 'string' },
          show_phone:       { type: 'boolean', description: 'Whether owner wants phone shown to clients. Ask owner explicitly.' },
          brokerage_type:   { type: 'string', enum: ['none', 'fixed', 'percentage', 'one_month_rent'] },
          brokerage_amount: { type: 'number' },
          available_from:   { type: 'string' },
          photos:           { type: 'array', items: { type: 'string' }, description: 'Photo URLs uploaded by user. Extract from [PHOTOS:...] in conversation.' }
        },
        required: ['title', 'property_type', 'price', 'address', 'locality', 'pincode', 'listing_source', 'contact_name', 'contact_phone']
      }
    }
  }
];

// ─── Tool Executors ──────────────────────────────────────────────────────────

async function runSearchProperties(args) {
  let query = supabase
    .from('properties')
    .select('*')
    .eq('verification_status', 'verified')
    .order('created_at', { ascending: false })
    .limit(5);

  if (args.property_type) query = query.eq('property_type', args.property_type);
  if (args.bhk)           query = query.eq('bhk', args.bhk);
  if (args.max_price)     query = query.lte('price', args.max_price);
  if (args.min_price)     query = query.gte('price', args.min_price);
  if (args.furnishing)    query = query.eq('furnishing', args.furnishing);
  if (args.parking)       query = query.eq('parking', args.parking);
  if (args.pincode)       query = query.eq('pincode', args.pincode);
  if (args.locality) {
    query = query.or(
      `locality.ilike.%${args.locality}%,address.ilike.%${args.locality}%,landmark.ilike.%${args.locality}%`
    );
  }

  const { data, error } = await query;
  if (error) return { error: error.message };
  if (!data || data.length === 0) {
    return { found: 0, properties: [], message: 'No matching properties found.' };
  }

  return {
    found: data.length,
    properties: data.map((p) => ({
      id:             p.id,
      title:          p.title,
      type:           p.property_type,
      bhk:            p.bhk,
      price:          p.price,
      area_sqft:      p.area_sqft,
      locality:       p.locality,
      address:        p.address,
      landmark:       p.landmark,
      pincode:        p.pincode,
      furnishing:     p.furnishing,
      parking:        p.parking,
      brokerage:      p.brokerage_type === 'none' ? 'No Brokerage' : `${p.brokerage_type} - ₹${p.brokerage_amount}`,
      show_phone:     p.show_phone !== false,
      contact_name:   p.contact_name,
      contact_phone:  p.show_phone !== false ? p.contact_phone : 'Hidden (chat via platform)',
      whatsapp:       p.show_phone !== false ? (p.owner_whatsapp || p.contact_phone) : null,
      photos:         p.photos || [],
      available_from: p.available_from,
      listing_source: p.listing_source
    }))
  };
}

async function runGetPropertyDetails(args) {
  const { data, error } = await supabase
    .from('properties')
    .select('*')
    .eq('id', args.property_id)
    .single();

  if (error || !data) return { error: 'Property not found.' };

  let nearbyAdvice = 'Nearby data not available.';
  if (data.latitude && data.longitude) {
    const nearby = await fetchNearbyPlaces(data.latitude, data.longitude);
    nearbyAdvice = buildNearbyAdvice(nearby);
  }

  return {
    id:               data.id,
    title:            data.title,
    property_type:    data.property_type,
    bhk:              data.bhk,
    price:            data.price,
    area_sqft:        data.area_sqft,
    address:          data.address,
    locality:         data.locality,
    landmark:         data.landmark,
    city:             data.city,
    pincode:          data.pincode,
    furnishing:       data.furnishing,
    parking:          data.parking,
    listing_source:   data.listing_source,
    contact_name:     data.contact_name,
    contact_phone:    data.show_phone !== false ? data.contact_phone : 'Hidden — contact via Estate49 chat',
    owner_whatsapp:   data.show_phone !== false ? data.owner_whatsapp : null,
    show_phone:       data.show_phone !== false,
    brokerage_type:   data.brokerage_type,
    brokerage_amount: data.brokerage_amount,
    available_from:   data.available_from,
    photos:           data.photos || [],
    nearby_summary:   nearbyAdvice
  };
}

async function runSavePropertyListing(args) {
  const payload = {
    ...args,
    show_phone:          args.show_phone !== false,
    photos:              args.photos || [],
    verification_status: 'pending',
    created_at:          new Date().toISOString()
  };

  const { data, error } = await supabase
    .from('properties')
    .insert([payload])
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  return {
    success: true,
    property_id: data.id,
    message: 'Property listed successfully and is pending admin approval.'
  };
}

async function runSearchWeb(args) {
  if (!process.env.SERPER_API_KEY) {
    return {
      status: 'knowledge_based',
      note: 'Live search not configured (SERPER_API_KEY missing). Providing comprehensive analysis from training knowledge. For real-time search add SERPER_API_KEY to environment.',
      query: args.query
    };
  }

  try {
    const [searchRes, newsRes] = await Promise.all([
      fetch('https://google.serper.dev/search', {
        method: 'POST',
        headers: { 'X-API-KEY': process.env.SERPER_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: args.query, num: 5, gl: 'in' })
      }),
      fetch('https://google.serper.dev/news', {
        method: 'POST',
        headers: { 'X-API-KEY': process.env.SERPER_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: args.query, num: 4 })
      })
    ]);

    const searchData = await searchRes.json();
    const newsData   = await newsRes.json();

    const results = [
      ...(searchData.organic || []).slice(0, 4).map(r => ({
        type: 'web', title: r.title, snippet: r.snippet, link: r.link
      })),
      ...(newsData.news || []).slice(0, 4).map(r => ({
        type: 'news', title: r.title, snippet: r.snippet, date: r.date, source: r.source
      }))
    ];

    return { found: results.length, query: args.query, results };
  } catch (e) {
    return { error: e.message, note: 'Search failed. Providing analysis from training knowledge.' };
  }
}

// ─── System Prompts ──────────────────────────────────────────────────────────

const CLIENT_SYSTEM = `You are the Estate49 AI — a world-class real estate intelligence assistant.
Estate49 is a product of Stenkepler Corporation. If someone asks who built this or who the founder is, say it was founded by Alisten Andrew under Stenkepler Corporation. Do NOT mention this unless asked.

You have ONLY these tools: search_properties, get_property_details, search_web. Do NOT call any other tool names.

━━━━━━━━━━━━━━━━━━━━━━
FORMATTING RULES — ALWAYS FOLLOW:
━━━━━━━━━━━━━━━━━━━━━━
- NEVER use **double asterisks** for bold. Never use *single asterisks* for italic. They appear as literal stars.
- Use PLAIN TEXT and emojis for emphasis
- Use • for bullet points
- Leave a blank line between each section or paragraph
- Keep replies well structured with clear spacing
- Currency in ₹ for India, local currency for global queries

━━━━━━━━━━━━━━━━━━━━━━
CRITICAL RULES:
━━━━━━━━━━━━━━━━━━━━━━
1. NEVER invent properties. Only show what search_properties returns
2. When user says "1st", "second" etc., pick from last search result by 1-based index, call get_property_details with that id
3. When user asks for photos, call get_property_details — if photos array is empty say "No photos uploaded yet"
4. If owner's show_phone is false — NEVER reveal their phone number. Say "Contact via Estate49 chat (number hidden for privacy)"
5. Always respond in English unless user writes in Hindi or Kannada first

━━━━━━━━━━━━━━━━━━━━━━
REAL-TIME MARKET ANALYSIS:
━━━━━━━━━━━━━━━━━━━━━━
When user asks about:
- Current market conditions anywhere in the world
- Is it safe to invest in [city/country]?
- What is happening in [project/location]?
- Price trends, news, latest updates

ALWAYS call search_web first, then give a structured analysis covering:
• Current market overview (prices, demand, supply)
• Recent news and developments
• Pros of investing now
• Cons / risks to consider
• Verdict: Is it a good time to invest? (Be honest and data-driven)
• Recommended action for the client

━━━━━━━━━━━━━━━━━━━━━━
GLOBAL REAL ESTATE KNOWLEDGE:
━━━━━━━━━━━━━━━━━━━━━━

INDIA:
• Bengaluru: IT corridors (Whitefield, Electronic City, Sarjapur Road), luxury (Indiranagar, Koramangala, HSR Layout), affordable (Hennur, Yelahanka, Devanahalli, Tumkur Road)
• Mumbai: South Mumbai, Bandra, Powai, Navi Mumbai, Thane
• Delhi NCR: Gurgaon (DLF phases, Golf Course Road), Noida (Sector 137, 150), Greater Noida West, Dwarka Expressway
• Hyderabad: HITEC City, Gachibowli, Kondapur, Miyapur, Financial District
• Chennai: OMR, Sholinganallur, Anna Nagar, Velachery, Perungudi
• Pune: Hinjewadi (IT hub), Baner, Kharadi, Wakad
• Key laws: RERA, stamp duty, registration charges, TDS on property sale >50L, 80C and 24(b) tax benefits on home loans
• NRI buying rules: NRIs can buy residential/commercial but not agricultural land; FEMA regulations apply

GLOBAL:
• Dubai/UAE: Freehold zones for foreigners (Dubai Marina, Downtown, Palm Jumeirah, JVC, Business Bay), Golden Visa through property investment >2M AED, zero property tax, high rental yields (6-9%), RERA Dubai regulation, off-plan vs ready property dynamics
• USA: 30-year fixed mortgage norm, HOA fees, property tax varies by state, strong markets: Austin TX, Nashville TN, Raleigh NC, Miami FL, NYC; 1031 exchange for tax deferral
• UK: Leasehold vs freehold distinction, SDLT (Stamp Duty Land Tax), Help to Buy scheme, London zones, strong yields in Manchester, Birmingham, Leeds
• Singapore: HDB vs private condos, ABSD (60% for foreigners), 99-year leasehold system, strong expat rental demand
• Australia: Negative gearing, FIRB rules for foreign buyers, strong markets: Brisbane, Adelaide, Perth; high immigration driving demand
• Canada: Vancouver/Toronto affordability crisis, foreign buyer ban, mortgage stress test, strong rental demand in Calgary
• Portugal: Golden Visa (changing rules 2024), Lisbon/Porto markets, NHR tax regime for new residents
• Thailand: Foreigners can buy condo units (49% of building), not land; Phuket and Bangkok popular

REAL ESTATE CONCEPTS YOU EXPLAIN CLEARLY:
• Rental yield = (Annual Rent / Property Price) × 100
• Cap rate = Net Operating Income / Property Value
• EMI calculation: EMI = P × r × (1+r)^n / ((1+r)^n - 1)
• Carpet area vs built-up vs super built-up (typically 1.2x to 1.4x ratio)
• RERA registration verification and its protections
• Due diligence checklist: title deed, encumbrance certificate, occupancy certificate, RERA registration
• Negotiation tactics: research comparable sales, point out defects, offer quick close for discount
• Short-term (Airbnb) vs long-term rental: higher income but more management hassle

HOW TO FORMAT PROPERTY RESULTS:
─────────────────────────
🏠 [Property Title]
📍 Location: [locality, city]
💰 Price: ₹[price]/month
📐 Area: [sqft] sq.ft
🛋️ Furnishing: [furnishing]
🚗 Parking: [parking]
✅ Brokerage: [brokerage]
📞 Contact: [contact name] — [phone or "via Estate49 chat"]

👍 Pros:
• [pro 1]
• [pro 2]

👎 Cons:
• [con 1]
• [con 2]
─────────────────────────

HOW YOU WORK:
1. Ask rent or buy, BHK, area, budget — 1-2 questions at a time
2. Call search_properties with filters
3. Show results using format above
4. Ask which property they want details or photos for
5. Call get_property_details with exact id
6. Give a final recommendation

TONE: Warm, expert, honest. Like a trusted friend who knows real estate deeply.`;

const LISTER_SYSTEM = `You are the Estate49 property listing assistant — part of Stenkepler Corporation.

HOW YOU WORK:
1. Ask if they are owner, broker, or builder
2. Ask 1-2 questions at a time to collect:
   - Property type, BHK, price, area in sqft
   - Full address, locality, landmark, pincode, city
   - Furnishing, parking
   - Contact name and phone
   - WhatsApp number
   - IMPORTANT: Ask "Do you want your phone number visible to clients, or would you prefer they contact you privately through Estate49 chat?" — respect their answer and set show_phone accordingly
   - Brokerage type and amount
   - Available from date
   - Any special features

3. If user message contains [PHOTOS: url1, url2, ...] — extract those URLs and include them in the photos field when saving

4. Once all details collected, show summary:

─────────────────────────
📋 Listing Summary
🏠 [title]
📍 [address, locality, pincode]
💰 ₹[price]/month
📐 [sqft] sq.ft
🛋️ [furnishing]
🚗 [parking]
✅ [brokerage]
📞 [name] — [phone or "Private"]
📸 Photos: [count] uploaded
─────────────────────────
Shall I submit this listing?

5. Call save_property_listing ONLY after user confirms
6. After saving: "Your listing is submitted and pending admin approval. Your property will be live once verified."

RULES:
- NEVER use **asterisks**. Plain text and emojis only
- Friendly and conversational, not like a form
- Extract all info user gives at once
- Respond in English unless user writes in Hindi or Kannada`;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function cleanReplyText(text) {
  if (!text) return '';
  return text
    .replace(/<function=[\s\S]*?<\/function>/gi, '')
    .replace(/\(function=.*?\)/gi, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*([^*\n]+)\*/g, '$1')
    .trim();
}

// ─── Main Chat Functions ──────────────────────────────────────────────────────

async function processClientMessage(history) {
  const messages = [{ role: 'system', content: CLIENT_SYSTEM }, ...history];

  const response = await groq.chat.completions.create({
    model: MODEL,
    messages,
    tools: clientTools,
    tool_choice: 'auto',
    temperature: 0.7,
    max_tokens: 1024
  });

  const msg = response.choices[0].message;

  if (msg.tool_calls && msg.tool_calls.length > 0) {
    const toolMessages = [];
    let lastToolResult = null;

    for (const call of msg.tool_calls) {
      const args = JSON.parse(call.function.arguments || '{}');
      let result;

      if (call.function.name === 'search_properties')   result = await runSearchProperties(args);
      if (call.function.name === 'get_property_details') { result = await runGetPropertyDetails(args); lastToolResult = result; }
      if (call.function.name === 'search_web')           result = await runSearchWeb(args);

      toolMessages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: JSON.stringify(result)
      });
    }

    const followUp = await groq.chat.completions.create({
      model: MODEL,
      messages: [...messages, msg, ...toolMessages],
      temperature: 0.7,
      max_tokens: 1500
    });

    const followMsg = followUp.choices[0].message;
    const clean = cleanReplyText(followMsg.content || '');

    return {
      reply: clean,
      toolData: lastToolResult || null,
      updatedHistory: [
        ...history,
        { role: 'assistant', content: msg.content || '' },
        ...toolMessages,
        { role: 'assistant', content: clean }
      ]
    };
  }

  const clean = cleanReplyText(msg.content || '');
  return {
    reply: clean,
    toolData: null,
    updatedHistory: [...history, { role: 'assistant', content: clean }]
  };
}

async function processListerMessage(history) {
  const messages = [{ role: 'system', content: LISTER_SYSTEM }, ...history];

  const response = await groq.chat.completions.create({
    model: MODEL,
    messages,
    tools: listerTools,
    tool_choice: 'auto',
    temperature: 0.6,
    max_tokens: 1024
  });

  const msg = response.choices[0].message;

  if (msg.tool_calls && msg.tool_calls.length > 0) {
    const toolMessages = [];

    for (const call of msg.tool_calls) {
      const args = JSON.parse(call.function.arguments || '{}');
      let result;
      if (call.function.name === 'save_property_listing') result = await runSavePropertyListing(args);

      toolMessages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: JSON.stringify(result)
      });
    }

    const followUp = await groq.chat.completions.create({
      model: MODEL,
      messages: [...messages, msg, ...toolMessages],
      temperature: 0.6,
      max_tokens: 1024
    });

    const followMsg = followUp.choices[0].message;
    const clean = cleanReplyText(followMsg.content || '');

    return {
      reply: clean,
      toolData: null,
      updatedHistory: [
        ...history,
        { role: 'assistant', content: msg.content || '' },
        ...toolMessages,
        { role: 'assistant', content: clean }
      ]
    };
  }

  const clean = cleanReplyText(msg.content || '');
  return {
    reply: clean,
    toolData: null,
    updatedHistory: [...history, { role: 'assistant', content: clean }]
  };
}

module.exports = { processClientMessage, processListerMessage };