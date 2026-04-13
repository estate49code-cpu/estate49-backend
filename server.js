const { processClientMessage, processListerMessage } = require('./services/ai');
const express = require('express');
const http = require('http');
const socketio = require('socket.io');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const supabase = require('./db');
const propertiesRoute = require('./routes/properties');
const uploadRoute = require('./routes/upload');
const { fetchNearbyPlaces, buildNearbyAdvice } = require('./services/nearby');

const app = express();
const server = http.createServer(app);
const io = socketio(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// API routes
app.use('/api/properties', propertiesRoute);
app.use('/api/upload', uploadRoute);

// Test DB connection
supabase.from('properties').select('id').limit(1).then(({ error }) => {
  if (error) console.log('DB Error:', error.message);
  else console.log('Database connected successfully! ✅');
});

// Home chat page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'test-chat.html'));
});

// Owner form page
app.get('/owner', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'owner', 'owner-form.html'));
});

function parseBudget(text) {
  const normalized = text.toLowerCase().replace(/,/g, '').trim();

  const underMatch = normalized.match(/(?:under|below|less than|max)\s*(\d+(?:\.\d+)?)\s*(k|lakh|lakhs)?/i);
  if (underMatch) {
    let value = parseFloat(underMatch[1]);
    const unit = underMatch[2];

    if (unit === 'k') value *= 1000;
    if (unit === 'lakh' || unit === 'lakhs') value *= 100000;

    return { max: Math.round(value), min: null };
  }

  const aboveMatch = normalized.match(/(?:above|over|more than|min)\s*(\d+(?:\.\d+)?)\s*(k|lakh|lakhs)?/i);
  if (aboveMatch) {
    let value = parseFloat(aboveMatch[1]);
    const unit = aboveMatch[2];

    if (unit === 'k') value *= 1000;
    if (unit === 'lakh' || unit === 'lakhs') value *= 100000;

    return { min: Math.round(value), max: null };
  }

  const betweenMatch = normalized.match(/(?:between)\s*(\d+(?:\.\d+)?)\s*(k|lakh|lakhs)?\s*(?:and|to|-)\s*(\d+(?:\.\d+)?)\s*(k|lakh|lakhs)?/i);
  if (betweenMatch) {
    let min = parseFloat(betweenMatch[1]);
    let max = parseFloat(betweenMatch[3]);
    const minUnit = betweenMatch[2];
    const maxUnit = betweenMatch[4];

    if (minUnit === 'k') min *= 1000;
    if (minUnit === 'lakh' || minUnit === 'lakhs') min *= 100000;
    if (maxUnit === 'k') max *= 1000;
    if (maxUnit === 'lakh' || maxUnit === 'lakhs') max *= 100000;

    return { min: Math.round(min), max: Math.round(max) };
  }

  const plainMatch = normalized.match(/(?:₹|rs\.?|inr)?\s*(\d+(?:\.\d+)?)\s*(k|lakh|lakhs)/i);
  if (plainMatch) {
    let value = parseFloat(plainMatch[1]);
    const unit = plainMatch[2];

    if (unit === 'k') value *= 1000;
    if (unit === 'lakh' || unit === 'lakhs') value *= 100000;

    return { max: Math.round(value), min: null };
  }

  return { min: null, max: null };
}

function parseFurnishing(text) {
  const msg = text.toLowerCase();

  if (msg.includes('semi furnished') || msg.includes('semi-furnished')) return 'semi-furnished';
  if (msg.includes('fully furnished') || msg.includes('full furnished') || msg.includes('furnished')) return 'fully-furnished';
  if (msg.includes('unfurnished')) return 'unfurnished';

  return null;
}

function parseParking(text) {
  const msg = text.toLowerCase();

  if (msg.includes('car parking') && msg.includes('bike parking')) return 'both';
  if (msg.includes('parking for car') && msg.includes('bike')) return 'both';
  if (msg.includes('parking')) {
    if (msg.includes('car')) return 'car';
    if (msg.includes('bike')) return 'bike';
    return 'yes';
  }

  if (msg.includes('car')) return 'car';
  if (msg.includes('bike')) return 'bike';

  return null;
}

function parsePropertyCategory(text) {
  const msg = text.toLowerCase();

  if (msg.includes('apartment') || msg.includes('flat')) return 'apartment';
  if (msg.includes('independent house') || msg.includes('independent home') || msg.includes('villa')) return 'independent house';
  if (msg.includes('plot') || msg.includes('land')) return 'plot';
  if (msg.includes('commercial') || msg.includes('office') || msg.includes('shop')) return 'commercial';

  return null;
}

// Socket.io chat
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.emit('bot_reply', {
    message: '👋 Welcome to Estate49! Tell me what property you are looking for. Example: "2 BHK rent in Whitefield under 25k semi furnished with car parking"',
    timestamp: new Date()
  });

  socket.on('user_message', async (data) => {
    try {
      const msg = (data.message || '').toLowerCase();
      console.log('Message:', msg);

      const pincodeMatch = msg.match(/\b\d{6}\b/);
      const pincode = pincodeMatch ? pincodeMatch[0] : null;

      const bhkMatch = msg.match(/(\d)\s*bhk/);
      const bhk = bhkMatch ? parseInt(bhkMatch[1]) : null;

      const type = msg.includes('rent')
        ? 'rent'
        : (msg.includes('buy') || msg.includes('sale'))
        ? 'sale'
        : null;

      const budget = parseBudget(msg);
      const furnishing = parseFurnishing(msg);
      const parking = parseParking(msg);
      const propertyCategory = parsePropertyCategory(msg);

      const localityWords = [
        'whitefield',
        'marathahalli',
        'electronic city',
        'hsr',
        'indiranagar',
        'koramangala',
        'hebbal',
        'jp nagar',
        'sarjapur',
        'bellandur',
        'btm',
        'jayanagar',
        'banashankari',
        'yelahanka'
      ];

      let matchedLocality = null;
      for (const place of localityWords) {
        if (msg.includes(place)) {
          matchedLocality = place;
          break;
        }
      }

      let query = supabase
        .from('properties')
        .select('*')
        .eq('is_available', true);

      if (pincode) query = query.eq('pincode', pincode);
      if (bhk) query = query.eq('bhk', bhk);
      if (type) query = query.eq('property_type', type);
      if (matchedLocality) query = query.ilike('locality', `%${matchedLocality}%`);
      if (budget.min !== null) query = query.gte('price', budget.min);
      if (budget.max !== null) query = query.lte('price', budget.max);
      if (furnishing) query = query.ilike('furnishing', `%${furnishing}%`);

      if (parking === 'car') {
        query = query.or('parking.ilike.%car%,parking.ilike.%covered car%,parking.ilike.%open car%');
      } else if (parking === 'bike') {
        query = query.or('parking.ilike.%bike%,parking.ilike.%two wheeler%');
      } else if (parking === 'both') {
        query = query.or('parking.ilike.%both%,parking.ilike.%car%,parking.ilike.%bike%');
      } else if (parking === 'yes') {
        query = query.not('parking', 'is', null);
      }

      if (propertyCategory) {
        query = query.ilike('category', `%${propertyCategory}%`);
      }

      const { data: properties, error } = await query.limit(5);

      if (error) {
        console.error('Search error:', error.message);
        socket.emit('bot_reply', {
          message: '❌ Something went wrong while searching properties.',
          timestamp: new Date()
        });
        return;
      }

      if (!properties || properties.length === 0) {
        const filtersUsed = [
          bhk ? `${bhk} BHK` : null,
          type ? type : null,
          matchedLocality ? `in ${matchedLocality}` : null,
          pincode ? `(${pincode})` : null,
          budget.max ? `under ₹${budget.max.toLocaleString('en-IN')}` : null,
          budget.min ? `above ₹${budget.min.toLocaleString('en-IN')}` : null,
          furnishing ? furnishing : null,
          parking ? `${parking} parking` : null,
          propertyCategory ? propertyCategory : null
        ].filter(Boolean).join(' ');

        socket.emit('bot_reply', {
          message: `🔍 I searched for ${filtersUsed || 'your property request'}. No listings found yet.`,
          timestamp: new Date()
        });
      } else {
        const enrichedProperties = [];

        for (const property of properties) {
          const nearbySummary = await fetchNearbyPlaces(property.latitude, property.longitude);
          const nearbyAdvice = buildNearbyAdvice(nearbySummary);

          enrichedProperties.push({
            ...property,
            nearby_summary: nearbySummary,
            nearby_advice: nearbyAdvice
          });
        }

        socket.emit('bot_reply', {
          message: `✅ Found ${enrichedProperties.length} propert${enrichedProperties.length > 1 ? 'ies' : 'y'} matching your filters.`,
          properties: enrichedProperties,
          timestamp: new Date()
        });
      }
    } catch (err) {
      console.error('Socket error:', err.message);
      socket.emit('bot_reply', {
        message: '❌ Server error while processing your request.',
        timestamp: new Date()
      });
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 5002;
server.listen(PORT, () => {
  console.log(`Estate49 server running on port ${PORT}`);
});