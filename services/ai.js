require('dotenv').config();
const Groq = require('groq-sdk');
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const CLIENT_SYSTEM = `You are Estate49's friendly AI assistant specializing in Bengaluru real estate.
Help clients find properties to rent or buy. Ask about budget, BHK, locality (Koramangala, Whitefield, 
Indiranagar, HSR Layout, Marathahalli, BTM Layout, Jayanagar, Electronic City, etc.), furnishing, 
parking, and pet-friendliness. Be concise, warm, and Bengaluru-specific. Keep replies under 100 words.`;

const LISTER_SYSTEM = `You are Estate49's AI assistant helping property owners list their property on the platform.
Guide them step by step: property type, BHK, location in Bengaluru, price (give market rate tips), 
photos advice, amenities to highlight, and contact details. Be practical and encouraging.
Keep replies under 100 words.`;

async function chat(history, mode = 'client') {
  const system = mode === 'lister' ? LISTER_SYSTEM : CLIENT_SYSTEM;
  const clean = history
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .slice(-20);

  const completion = await groq.chat.completions.create({
    model: 'llama3-8b-8192',
    messages: [{ role: 'system', content: system }, ...clean],
    max_tokens: 200,
    temperature: 0.7,
  });

  const reply = completion.choices[0]?.message?.content ||
    "I'm having trouble responding right now. Please try again.";

  return {
    reply,
    updatedHistory: [...clean, { role: 'assistant', content: reply }]
  };
}

module.exports = { chat };