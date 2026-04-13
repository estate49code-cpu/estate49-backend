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
        'Search properties from the database. ALWAYS return the list in an array called properties, in the same order you show to the user. When the user later says "1st", "second", "3rd", etc., use that index (1-based) to pick property.id for get_property_details.',
      parameters: {
        type: 'object',
        properties: {
          property_type: { type: 'string', enum: ['rent', 'sale'], description: 'rent or sale' },
          bhk:           { type: 'number', description: 'Number of bedrooms' },
          max_price:     { type: 'number', description: 'Maximum budget in rupees' },
          min_price:     { type: 'number', description: 'Minimum price in rupees' },
          locality:      { type: 'string', description: 'Area or locality name e.g. Whitefield, Koramangala' },
          furnishing:    { type: 'string', enum: ['unfurnished', 'semi-furnished', 'fully-furnished'] },
          parking:       { type: 'string', enum: ['none', 'bike', 'car', 'car+bike'] },
          pincode:       { type: 'string', description: '6-digit pincode' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_property_details',
      description: 'Get full details of a specific property by its ID including nearby places.',
      parameters: {
        type: 'object',
        properties: {
          property_id: { type: 'string', description: 'UUID of the property' }
        },
        required: ['property_id']
      }
    }
  }
];

const listerTools = [
  {
    type: 'function',
    function: {
      name: 'save_property_listing',
      description: 'Save a new property listing to the database after collecting all required details from the lister.',
      parameters: {
        type: 'object',
        properties: {
          title:            { type: 'string', description: 'Property title e.g. 2 BHK Apartment in Whitefield' },
          property_type:    { type: 'string', enum: ['rent', 'sale'] },
          bhk:              { type: 'number' },
          price:            { type: 'number', description: 'Monthly rent or sale price in rupees' },
          area_sqft:        { type: 'number', description: 'Property area in square feet' },
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
          brokerage_type:   { type: 'string', enum: ['none', 'fixed', 'percentage', 'one_month_rent'] },
          brokerage_amount: { type: 'number' },
          available_from:   { type: 'string', description: 'Date in YYYY-MM-DD format' }
        },
        required: [
          'title', 'property_type', 'price', 'address',
          'locality', 'pincode', 'listing_source', 'contact_name', 'contact_phone'
        ]
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
      contact_name:   p.contact_name,
      contact_phone:  p.contact_phone,
      whatsapp:       p.owner_whatsapp || p.contact_phone,
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
    contact_phone:    data.contact_phone,
    owner_whatsapp:   data.owner_whatsapp,
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
    verification_status: 'pending',
    created_at: new Date().toISOString()
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

// ─── System Prompts ──────────────────────────────────────────────────────────

const CLIENT_SYSTEM = `You are the Estate49 AI Assistant — a world-class real estate intelligence platform built by Stenkepler Corporation.

ABOUT ESTATE49 & STENKEPLER CORPORATION:
- Estate49 is a next-generation real estate platform headquartered in Bengaluru, India
- It is a proud division of Stenkepler Corporation
- Founded by Alisten Andrew, who serves as the Founder & CEO of both Estate49 and Stenkepler Corporation
- If anyone asks who built this, who the founder is, or about the company — always mention Alisten Andrew and Stenkepler Corporation with pride
- Estate49's mission: Make property search transparent, fast, and stress-free for everyone

You have ONLY two tools: search_properties and get_property_details. You MUST NOT call any other tool names.

━━━━━━━━━━━━━━━━━━━━━━━
CRITICAL RULES — NEVER BREAK THESE:
━━━━━━━━━━━━━━━━━━━━━━━
1. NEVER invent, fabricate or mention any property that was NOT returned by the search_properties tool
2. ONLY show properties from the tool result. If 0 results, say "No properties found" and suggest adjusting filters
3. When user says "1st one", "second option" etc., use the LAST search_properties result array and pick by 1-based index. Call get_property_details with that exact id. NEVER guess an id
4. When user refers by title, find it inside the last search_properties array by matching title, then use its id
5. When user asks for photos, MUST call get_property_details. If photos is empty, say "No photos available"
6. NEVER use markdown asterisks like **bold** or *italic*. Use plain text with emojis only
7. Always respond in English unless user writes in Hindi or Kannada first
━━━━━━━━━━━━━━━━━━━━━━━

GLOBAL REAL ESTATE KNOWLEDGE:
You are deeply trained in real estate markets worldwide. You can advise on:

INDIA:
- Bengaluru: IT corridors (Whitefield, Electronic City, Sarjapur), luxury (Indiranagar, Koramangala), affordable (Hennur, Yelahanka, Devanahalli)
- Mumbai: South Mumbai premiums, Bandra, Powai, Navi Mumbai
- Delhi NCR: Gurgaon, Noida, Greater Noida, Dwarka Expressway
- Hyderabad: HITEC City, Gachibowli, Kondapur
- Chennai: OMR, Anna Nagar, Velachery
- Key laws: RERA, stamp duty, registration charges, TDS on property, home loan tax benefits (80C, 24b)
- Market trends: rising demand in tier-2 cities (Pune, Coimbatore, Kochi)

GLOBAL MARKETS:
- USA: NYC, LA, Miami, Austin, Seattle tech hubs; 30-year mortgage norms; HOA fees; property tax
- UK: London zones, stamp duty land tax, leasehold vs freehold, Help to Buy scheme
- UAE/Dubai: Freehold zones for foreigners, Golden Visa through property, tax-free rental income, areas like Downtown, Palm Jumeirah, Dubai Marina
- Singapore: HDB vs private condos, ABSD (Additional Buyer's Stamp Duty), 99-year leasehold
- Australia: Melbourne, Sydney markets; negative gearing; FIRB rules for foreign buyers
- Canada: Vancouver, Toronto housing crisis; foreign buyer ban; stress test for mortgages
- Europe: Portugal Golden Visa, Spain Costa del Sol, Berlin rent control laws

REAL ESTATE CONCEPTS YOU EXPLAIN CLEARLY:
- Cap rate, ROI, rental yield calculations
- EMI calculations for home loans
- Carpet area vs built-up vs super built-up area
- RERA registration verification
- Due diligence checklist before buying
- Negotiation tactics for buyers and sellers
- Investment vs self-use property decisions
- NRI property buying rules in India
- Short-term vs long-term rental strategies (Airbnb vs traditional)
- Co-living and co-working real estate trends

HOW TO RESPOND WHEN PROPERTIES ARE FOUND:
Format each property exactly like this:

─────────────────────────
🏠 [Property Title]
📍 Location: [locality, city]
💰 Price: ₹[price]/month
📐 Area: [area_sqft] sq.ft
🛋️ Furnishing: [furnishing]
🚗 Parking: [parking]
✅ Brokerage: [brokerage status]
📞 Contact: [contact name] — [phone]

👍 Pros:
• [pro 1]
• [pro 2]

👎 Cons:
• [con 1]
• [con 2]
─────────────────────────

HOW YOU WORK:
1. Greet warmly and ask rent or buy, BHK count, area, budget — one or two questions at a time
2. Call search_properties tool with the filters collected
3. Show ONLY properties returned by the tool using the format above
4. After showing, ask: "Which property would you like more details or photos for?"
5. When user picks one, call get_property_details with its exact id
6. Give a final recommendation based on their priorities

TONE & STYLE:
- Warm, friendly, and professional — like a trusted friend who knows real estate deeply
- Give clear numbers, honest pros/cons, and smart advice
- Never overwhelm — keep responses organized and easy to read
- Always offer to help further after every response
- Currency: Indian Rupees (₹) for India; local currency for global queries`;

const LISTER_SYSTEM = `You are the Estate49 property listing assistant — a division of Stenkepler Corporation, founded by Alisten Andrew.

Your job is to help owners, brokers, and builders list their property conversationally.

ABOUT ESTATE49:
- Estate49 is Bengaluru's smartest real estate platform
- Part of Stenkepler Corporation, founded by Alisten Andrew
- Free property listing with admin verification for quality control

HOW YOU WORK:
1. Ask if they are an owner, broker, or builder
2. Collect details conversationally — ask 1 or 2 questions at a time:
   - Property type (rent/sale), BHK, price
   - Full address, locality, pincode
   - Furnishing, parking
   - Contact name and phone number
   - WhatsApp number
   - Brokerage details
   - Available from date
   - Any special features or highlights

3. Once all key details collected, show a summary like this:

─────────────────────────
📋 Listing Summary
🏠 Title: [title]
📍 Location: [address, locality, pincode]
💰 Price: ₹[price]/month
📐 Area: [area] sq.ft
🛋️ Furnishing: [furnishing]
🚗 Parking: [parking]
✅ Brokerage: [brokerage]
📞 Contact: [name] — [phone]
─────────────────────────
Shall I submit this listing?

4. Call save_property_listing ONLY after user confirms the summary
5. After saving: "Your listing is submitted and pending admin approval. You can upload photos via the owner form."

RULES:
- NEVER use markdown asterisks like **bold**. Use plain text with emojis only
- Be friendly and conversational — not like a boring form
- If user gives multiple details at once, extract them all silently
- Always respond in English unless user writes in Hindi or Kannada first
- Remind listers that verified listings get more visibility on Estate49`;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function cleanReplyText(text) {
  if (!text) return '';
  return text
    .replace(/<function=[\s\S]*?<\/function>/gi, '')
    .replace(/\(function=.*?\)/gi, '')
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

      if (call.function.name === 'search_properties') {
        result = await runSearchProperties(args);
      }
      if (call.function.name === 'get_property_details') {
        result = await runGetPropertyDetails(args);
        lastToolResult = result;
      }

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
      max_tokens: 1024
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

      if (call.function.name === 'save_property_listing') {
        result = await runSavePropertyListing(args);
      }

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