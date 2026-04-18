require('dotenv').config();
const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const cors       = require('cors');
const path       = require('path');
const db         = require('./db');
const { chat }   = require('./services/ai');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*', methods: ['GET','POST'] } });

app.use(cors());
app.use(express.json({ limit: '25mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ─── API Routes ─────────────────────────────
app.use('/api/properties',    require('./routes/properties'));
app.use('/api/favorites',     require('./routes/favorites'));
app.use('/api/messages',      require('./routes/messages'));
app.use('/api/profiles',      require('./routes/profiles'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/upload',        require('./routes/upload'));

// ─── AI REST endpoint ────────────────────────
app.post('/api/chat', async (req, res) => {
  try {
    const { history, mode } = req.body;
    if (!Array.isArray(history)) return res.status(400).json({ error: 'history array required' });
    const result = await chat(history, mode || 'client');
    res.json(result);
  } catch (e) {
    res.status(500).json({
      reply: 'AI service error. Please try again.',
      updatedHistory: req.body.history || []
    });
  }
});

// ─── Page routes ─────────────────────────────
const pages = ['login','browse','property','list-property','messages',
                'profile','favorites','notifications','chat'];
pages.forEach(p => {
  app.get(`/${p}`,      (req, res) => res.sendFile(path.join(__dirname, 'public', `${p}.html`)));
  app.get(`/${p}.html`, (req, res) => res.sendFile(path.join(__dirname, 'public', `${p}.html`)));
});
app.get('/auth/callback', (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'auth', 'callback.html')));
app.get('*', (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'index.html')));

// ─── Socket.io AI Chat ────────────────────────
const sessions = new Map();
const LISTER_KW = ['list','listing','sell','rent out','add property','post property',
                   'my property','i own','want to sell','want to rent my','owner'];

io.on('connection', socket => {
  sessions.set(socket.id, { mode: null, history: [] });
  socket.emit('botReply', {
    message: "Welcome to Estate49! 🏠\nAre you looking to **find** a property to rent/buy, or do you want to **list** your own property?",
    timestamp: new Date()
  });

  socket.on('userMessage', async data => {
    try {
      const text = (typeof data === 'string' ? data : data?.message || '').trim();
      if (!text) return;
      const sess = sessions.get(socket.id) || { mode: null, history: [] };
      if (!sess.mode) {
        sess.mode = LISTER_KW.some(k => text.toLowerCase().includes(k)) ? 'lister' : 'client';
      }
      sess.history.push({ role: 'user', content: text });
      socket.emit('typing', true);
      const result = await chat(sess.history, sess.mode);
      sess.history = result.updatedHistory;
      sessions.set(socket.id, sess);
      socket.emit('typing', false);
      socket.emit('botReply', { message: result.reply, timestamp: new Date() });
    } catch (e) {
      socket.emit('typing', false);
      socket.emit('botReply', { message: 'I had trouble with that. Please try again.', timestamp: new Date() });
    }
  });

  socket.on('disconnect', () => sessions.delete(socket.id));
});

// ─── Startup ─────────────────────────────────
db.from('properties').select('id').limit(1).then(({ error }) =>
  console.log(error ? '⚠️  DB: ' + error.message : '✅ Supabase connected')
);
const PORT = process.env.PORT || 5002;
server.listen(PORT, () => console.log(`🏠 Estate49 → http://localhost:${PORT}`));