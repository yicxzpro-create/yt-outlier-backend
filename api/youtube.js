// api/youtube.js — Proxy YouTube Data API

const YT_API = 'https://www.googleapis.com/youtube/v3';

const ipRequests = new Map();
const MAX_REQUESTS_PER_MINUTE = 30;

function checkRateLimit(ip) {
  const now = Date.now();
  const windowMs = 60 * 1000;
  if (!ipRequests.has(ip)) {
    ipRequests.set(ip, { count: 1, resetAt: now + windowMs });
    return true;
  }
  const data = ipRequests.get(ip);
  if (now > data.resetAt) {
    ipRequests.set(ip, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (data.count >= MAX_REQUESTS_PER_MINUTE) return false;
  data.count++;
  return true;
}

export default async function handler(req, res) {
  // ── CORS — autoriser toutes les origines ──
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const ip = req.headers['x-forwarded-for']?.split(',')[0] || 'unknown';
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: 'Too many requests' });
  }

  const { endpoint, ...params } = req.query;
  const allowedEndpoints = ['videos', 'search'];
  if (!endpoint || !allowedEndpoints.includes(endpoint)) {
    return res.status(400).json({ error: 'Invalid endpoint' });
  }

  const allowedParams = ['part', 'id', 'channelId', 'type', 'order', 'maxResults', 'publishedAfter'];
  const filteredParams = {};
  for (const key of allowedParams) {
    if (params[key]) filteredParams[key] = params[key];
  }

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Server configuration error' });

  const queryString = new URLSearchParams({ ...filteredParams, key: apiKey }).toString();
  const ytUrl = `${YT_API}/${endpoint}?${queryString}`;

  try {
    const response = await fetch(ytUrl);
    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({ error: data.error?.message || 'YouTube API error' });
    }
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate');
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
