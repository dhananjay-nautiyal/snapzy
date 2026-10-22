const db = require('./db');

// Pick an ad to show and count the impression.
//
// Rotation is fair: the active ad with the fewest impressions is chosen
// first (ties broken at random), so when several sponsors are loaded they
// cycle evenly. Returns null when no active ads exist — callers render
// nothing, so the UI stays clean until you add an ad via /admin.
function getSponsoredAd() {
  const ad = db
    .prepare(
      `SELECT id, headline, sponsor, image_url, link_url
         FROM ads
        WHERE active = 1
        ORDER BY impressions ASC, RANDOM()
        LIMIT 1`
    )
    .get();

  if (!ad) return null;

  db.prepare('UPDATE ads SET impressions = impressions + 1 WHERE id = ?').run(ad.id);
  return ad;
}

module.exports = { getSponsoredAd };
