const express = require('express');
const router = express.Router();
const supabase = require('../db');

// POST /api/properties — Add new property
router.post('/', async (req, res) => {
  try {
    const {
      title,
      description,
      address,
      pincode,
      city,
      latitude,
      longitude,
      property_type,
      price,
      bhk,
      area_sqft,
      photos,
      contact_name,
      contact_phone,

      // New fields
      listing_source,
      brokerage_type,
      brokerage_amount,
      landmark,
      locality,
      verification_status,
      owner_name,
      owner_phone,
      owner_whatsapp,
      map_address,
      google_map_link,
      available_from,
      furnishing,
      parking
    } = req.body;

    if (!title || !address || !pincode || !property_type || !price) {
      return res.status(400).json({
        success: false,
        error: 'title, address, pincode, property_type and price are required'
      });
    }

    const payload = {
      title,
      description: description || null,
      address,
      pincode,
      city: city || 'Bengaluru',
      latitude: latitude || null,
      longitude: longitude || null,
      property_type,
      price,
      bhk: bhk || null,
      area_sqft: area_sqft || null,
      photos: photos || [],
      contact_name: contact_name || null,
      contact_phone: contact_phone || null,

      listing_source: listing_source || null,
      brokerage_type: brokerage_type || null,
      brokerage_amount: brokerage_amount || null,
      landmark: landmark || null,
      locality: locality || null,
      verification_status: verification_status || 'pending',
      owner_name: owner_name || null,
      owner_phone: owner_phone || null,
      owner_whatsapp: owner_whatsapp || null,
      map_address: map_address || null,
      google_map_link: google_map_link || null,
      available_from: available_from || null,
      furnishing: furnishing || null,
      parking: parking || null,
      is_available: true
    };

    const { data, error } = await supabase
      .from('properties')
      .insert([payload])
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      message: 'Property created successfully',
      property: data
    });
  } catch (err) {
    console.error('Create property error:', err.message);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// GET /api/properties — Get all properties
router.get('/', async (req, res) => {
  try {
    const { pincode, property_type, bhk, city, listing_source } = req.query;

    let query = supabase
      .from('properties')
      .select('*')
      .eq('is_available', true)
      .order('created_at', { ascending: false });

    if (pincode) query = query.eq('pincode', pincode);
    if (property_type) query = query.eq('property_type', property_type);
    if (bhk) query = query.eq('bhk', parseInt(bhk));
    if (city) query = query.ilike('city', `%${city}%`);
    if (listing_source) query = query.eq('listing_source', listing_source);

    const { data, error } = await query;
    if (error) throw error;

    res.json({ success: true, properties: data });
  } catch (err) {
    console.error('Fetch properties error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/properties/search?q=whitefield
router.get('/search', async (req, res) => {
  try {
    const { q } = req.query;

    const { data, error } = await supabase
      .from('properties')
      .select('*')
      .eq('is_available', true)
      .or(`address.ilike.%${q}%,title.ilike.%${q}%,pincode.ilike.%${q}%,city.ilike.%${q}%,locality.ilike.%${q}%,landmark.ilike.%${q}%`);

    if (error) throw error;

    res.json({ success: true, properties: data });
  } catch (err) {
    console.error('Search properties error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;