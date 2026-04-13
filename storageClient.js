// storageClient.js
const { createClient } = require('@supabase/supabase-js');

const storageClient = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY  // service_role key bypasses RLS
);

module.exports = storageClient;