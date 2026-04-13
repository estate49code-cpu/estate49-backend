const Groq = require('groq-sdk');
const supabase = require('../db');
const { fetchNearbyPlaces, buildNearbyAdvice } = require('./nearby');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const MODEL = 'llama-3.1-8b-instant';

// ─── Tool Definitions ───────────────────────────────────────────────────────

const clientTools = [
  {
    type: 'function',
    function: {
      name: 'search_properties',
      description: 'Search properties from the database based on client filters like type, BHK, budget, locality, furnishing, parking.',
      parameters: {
        type: 'object',
        properties: {
          property_type:  { type: 'string',  enum: ['rent', 'sale'], description: 'rent or sale' },
          bhk:            { type: 'number',  description: 'Number of bedrooms' },
          max_price:      { type: 'number',  description: 'Maximum budget in rupees' },
          min_price:      { type: 'number',  description: 'Minimum price in rupees' },
          locality:       { type: 'string',  description: 'Area or locality name e.g. Whitefield, Koramangala' },
          furnishing:     { type: 'string',  enum: ['unfurnished', 'semi-furnished', 'fully-furnished'] },
          parking:        { type: 'string',  enum: ['none', 'bike', 'car', 'car+bike'] },
          pincode:        { type: 'string',  description: '6-digit pincode' }
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
          title:               { type: 'string',  description: 'Property title e.g. 2 BHK Apartment in Whitefield' },
          property_type:       { type: 'string',  enum: ['rent', 'sale'] },
          bhk:                 { type: 'number' },
          price:               { type: 'number',  description: 'Monthly rent or sale price in rupees' },
          area_sqft:           { type: 'number',  description: 'Property area in square feet' },
          description:         { type: 'string' },
          address:             { type: 'string' },
          locality:            { type: 'string' },
          landmark:            { type: 'string' },
          pincode:             { type: 'string' },
          city:                { type: 'string' },
          furnishing:          { type: 'string',  enum: ['unfurnished', 'semi-furnished', 'fully-furnished'] },
          parking:             { type: 'string',  enum: ['none', 'bike', 'car', 'car+bike'] },
          listing_source:      { type: 'string',  enum: ['owner', 'broker', 'builder'] },
          contact_name:        { type: 'string' },
          contact_phone:       { type: 'string' },
          owner_whatsapp:      { type: 'string' },
          brokerage_type:      { type: 'string',  enum: ['none', 'fixed', 'percentage', 'one_month_rent'] },
          brokerage_amount:    { type: 'number' },
          available_from:      { type: 'string',  description: 'Date in YYYY-MM-DD format' }
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
  if (!data || data.length === 0) return { found: 0, properties: [], message: 'No matching properties found.' };

  return {
    found: data.length,
    properties: data.map(p => ({
      id:           p.id,
      title:        p.title,
      type:         p.property_type,
      bhk:          p.bhk,
      price:        p.price,
      area_sqft:    p.area_sqft,
      locality:     p.locality,
      address:      p.address,
      landmark:     p.landmark,
      pincode:      p.pincode,
      furnishing:   p.furnishing,
      parking:      p.parking,
      brokerage:    p.brokerage_type === 'none' ? 'No Brokerage' : `${p.brokerage_type} - ₹${p.brokerage_amount}`,
      contact_name: p.contact_name,
      contact_phone: p.contact_phone,
      whatsapp:     p.owner_whatsapp || p.contact_phone,
      photos:       p.photos || [],
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

  return { ...data, nearby_summary: nearbyAdvice };
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
  return { success: true, property_id: data.id, message: 'Property listed successfully and is pending admin approval.' };
}

// ─── System Prompts ──────────────────────────────────────────────────────────

const CLIENT_SYSTEM = `You are Estate49's expert real estate AI assistant for Bengaluru, India.
Your job is to help clients find the perfect property to rent or buy.

━━━━━━━━━━━━━━━━━━━━━━━
CRITICAL RULES — NEVER BREAK THESE:
━━━━━━━━━━━━━━━━━━━━━━━
1. NEVER invent, fabricate or mention any property that was NOT returned by the search_properties tool.
2. ONLY show properties from the tool result. If the tool returns 0 properties, say "No properties found" — do NOT suggest imaginary ones.
3. When user asks for photos, call get_property_details using the EXACT id field from the search result. NEVER make up an ID.
4. NEVER use markdown asterisks like **bold** or *italic*. Use plain text with emojis only.
5. Always respond in English unless user writes in Hindi or Kannada first.
━━━━━━━━━━━━━━━━━━━━━━━

HOW TO RESPOND WHEN PROPERTIES ARE FOUND:
Format each property exactly like this:

─────────────────────────
🏠 [Property Title]
📍 Location: [locality, city]
💰 Price: ₹[price]/month
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
2. Call search_properties tool with the filters you collected
3. Show ONLY properties returned by the tool using the format above
4. After showing properties, ask: "Which property would you like more details or photos for?"
5. When user picks a property, call get_property_details with its exact id
6. Give a final recommendation based on their priorities

ADDITIONAL RULES:
- If budget is too low, say so honestly and suggest adjusting filters
- Always mention if brokerage applies — renters care about this
- Keep responses focused and clean — no walls of text
- Currency always in Indian Rupees (₹)`;

const LISTER_SYSTEM = `You are Estate49's property listing assistant for Bengaluru, India.
Your job is to help owners, brokers, and builders list their property conversationally.

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
   - Any special features

3. Once all key details collected, show a summary like this:

─────────────────────────
📋 Listing Summary
🏠 Title: [title]
📍 Location: [address, locality, pincode]
💰 Price: ₹[price]/month
🛋️ Furnishing: [furnishing]
🚗 Parking: [parking]
✅ Brokerage: [brokerage]
📞 Contact: [name] — [phone]
─────────────────────────
Shall I submit this listing?

4. Call save_property_listing ONLY after user confirms the summary
5. After saving, tell them: "Your listing is submitted and pending admin approval. Please upload photos via the owner form."

RULES:
- NEVER use markdown asterisks like **bold**. Use plain text with emojis only.
- Be friendly and conversational — not like a form
- If user gives multiple details at once, extract them all
- Always respond in English unless user writes in Hindi or Kannada first`;

// ─── Main Chat Functions ─────────────────────────────────────────────────────

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

    for (const call of msg.tool_calls) {
      const args = JSON.parse(call.function.arguments);
      let result;

      if (call.function.name === 'search_properties')    result = await runSearchProperties(args);
      if (call.function.name === 'get_property_details') result = await runGetPropertyDetails(args);

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

    return {
      reply: followUp.choices[0].message.content,
      updatedHistory: [...history, msg, ...toolMessages, followUp.choices[0].message]
    };
  }

  return {
    reply: msg.content,
    updatedHistory: [...history, msg]
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
      const args = JSON.parse(call.function.arguments);
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

    return {
      reply: followUp.choices[0].message.content,
      updatedHistory: [...history, msg, ...toolMessages, followUp.choices[0].message]
    };
  }

  return {
    reply: msg.content,
    updatedHistory: [...history, msg]
  };
}

module.exports = { processClientMessage, processListerMessage };