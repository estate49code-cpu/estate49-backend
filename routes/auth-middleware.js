const supabase = require('../db');

async function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer '))
    return res.status(401).json({ error: 'Unauthorized – no token' });

  const token = auth.split(' ')[1];
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user)
    return res.status(401).json({ error: 'Invalid or expired token' });

  req.user = user;
  next();
}

module.exports = { authMiddleware };