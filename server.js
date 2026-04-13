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

// ─── Session Store ───────────────────────────────────────────────────────────
const sessions = new Map(); // socketId → { mode, history }

function detectMode(text) {
  const lower = text.toLowerCase();
  const listerKeywords = [
    'list', 'listing', 'owner', 'broker', 'builder',
    'sell', 'rent out', 'add property', 'post property',
    'want to list', 'my property', 'i have a property',
    'i own', 'want to sell', 'want to rent my'
  ];
  return listerKeywords.some(k => lower.includes(k)) ? 'lister' : 'client';
}

// ─── Socket.io AI Chat ───────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  sessions.set(socket.id, { mode: null, history: [] });

  // Welcome message
  socket.emit('bot_reply', {
    message: `🏠 Welcome to Estate49!\n\nI'm your AI real estate assistant for Bengaluru.\n\nAre you:\n👉 Looking for a property to rent or buy?\n👉 Listing a property you own or manage?\n\nJust tell me what you need!`,
    timestamp: new Date()
  });

  // Listen to old event name so frontend works without changes
  socket.on('user_message', async (data) => {
    try {
      const userText = (data && data.message ? data.message : data || '')
        .toString()
        .trim();
      if (!userText) return;

      console.log(`Message [${socket.id}]:`, userText);

      const session = sessions.get(socket.id) || { mode: null, history: [] };

      // Detect mode on first message
      if (!session.mode) {
        session.mode = detectMode(userText);
      }

      // Add user message to history
      session.history.push({ role: 'user', content: userText });

      // Show typing indicator
      socket.emit('typing', true);

      // Filter history to only user/assistant roles for AI
      const cleanHistory = session.history.filter(
        (m) => m.role === 'user' || m.role === 'assistant'
      );

      let result;
      if (session.mode === 'lister') {
        result = await processListerMessage(cleanHistory);
      } else {
        result = await processClientMessage(cleanHistory);
      }

      // Safety: ensure reply is plain string
      const replyText =
        typeof result.reply === 'string'
          ? result.reply
          : JSON.stringify(result.reply || '');

      // Update session history
      session.history = result.updatedHistory || cleanHistory;
      sessions.set(socket.id, session);

      socket.emit('typing', false);
      socket.emit('bot_reply', {
        message: replyText,
        timestamp: new Date()
      });
    } catch (err) {
      console.error('Socket error:', err.message);
      socket.emit('typing', false);
      socket.emit('bot_reply', {
        message: '❌ I had trouble processing that. Please try again in a moment.',
        timestamp: new Date()
      });
    }
  });

  socket.on('disconnect', () => {
    sessions.delete(socket.id);
    console.log('User disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 5002;
server.listen(PORT, () => {
  console.log(`Estate49 server running on port ${PORT}`);
});