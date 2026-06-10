// ── Utility helpers ────────────────────────────────────────────────────────

window.halalScore = function(place) {
  const hay = [
    (place.name || ''),
    (place.vicinity || ''),
    ...(place.types || [])
  ].join(' ').toLowerCase();

  const kw = window.HALAL_KEYWORDS;
  for (const word of kw.unlikely) if (hay.includes(word)) return 'unsure';
  for (const word of kw.likely)   if (hay.includes(word)) return 'likely';
  for (const word of kw.check)    if (hay.includes(word)) return 'check';
  return 'likely'; // default optimistic for KL context
};

window.halalLabel = { likely:'Halal ✓', check:'Check', unsure:'Not Halal' };

window.isMall = function(place) {
  const hay = [place.name || '', place.vicinity || ''].join(' ').toLowerCase();
  return window.KL_MALLS.some(m => hay.includes(m));
};

window.photoUrl = function(place, maxW = 200) {
  if (place.photos && place.photos.length > 0) {
    return place.photos[0].getUrl({ maxWidth: maxW });
  }
  return null;
};

window.typeEmoji = function(types) {
  if (!types) return '🍽️';
  if (types.includes('cafe'))       return '☕';
  if (types.includes('bakery'))     return '🥐';
  if (types.includes('bar'))        return '🍸';
  if (types.includes('meal_takeaway')) return '📦';
  return '🍽️';
};

window.fmtDuration = function(secs) {
  if (!secs) return '—';
  const m = Math.round(secs / 60);
  if (m < 60) return m + ' min';
  return Math.floor(m/60) + 'h ' + (m%60) + 'm';
};

window.fmtDist = function(metres) {
  if (!metres) return '';
  if (metres < 1000) return metres + ' m';
  return (metres/1000).toFixed(1) + ' km';
};

// ── PlaceCard ──────────────────────────────────────────────────────────────

const PlaceCard = ({ place, selected, travel, onSelect }) => {
  const score  = window.halalScore(place);
  const inMall = window.isMall(place);
  const photo  = window.photoUrl(place, 112);
  const emoji  = window.typeEmoji(place.types);

  const halalClass = { likely:'halal-likely', check:'halal-check', unsure:'halal-unsure' }[score];

  return (
    <div
      className={`place-card${selected ? ' selected' : ''}`}
      onClick={() => onSelect(place)}
    >
      {photo
        ? <img className="place-thumb" src={photo} alt={place.name} loading="lazy" />
        : <div className="place-thumb-placeholder">{emoji}</div>
      }

      <div className="place-info">
        <div className="place-name">{place.name}</div>

        <div className="place-meta">
          {place.rating && (
            <span className="rating">⭐ {place.rating} ({place.user_ratings_total || 0})</span>
          )}
          <span className={`halal-badge ${halalClass}`}>
            {window.halalLabel[score]}
          </span>
          {inMall && <span className="mall-badge">🏬 Mall</span>}
        </div>

        <div className="place-addr">
          {place.vicinity || place.formatted_address || ''}
        </div>

        {travel && (
          <div className="place-travel">
            {travel.walk  && <span className="walk">🚶 {window.fmtDuration(travel.walk.duration?.value)}</span>}
            {travel.walk && travel.drive && <span> · </span>}
            {travel.drive && <span className="drive">🚗 {window.fmtDuration(travel.drive.duration?.value)}</span>}
          </div>
        )}
      </div>
    </div>
  );
};

// ── DetailPanel ────────────────────────────────────────────────────────────

const DetailPanel = ({ place, details, travel, onClose }) => {
  if (!place) return null;

  const score    = window.halalScore(place);
  const inMall   = window.isMall(place);
  const halalClass = { likely:'halal-likely', check:'halal-check', unsure:'halal-unsure' }[score];

  const photos = (details?.photos || place.photos || []).slice(0, 6).map(p =>
    p.getUrl({ maxWidth: 320 })
  );

  const todayIdx = new Date().getDay(); // 0=Sun
  const hours = details?.opening_hours?.weekday_text || [];

  const lat = place.geometry?.location?.lat();
  const lng = place.geometry?.location?.lng();
  const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&destination_place_id=${place.place_id}`;

  return (
    <div id="detail">
      <div className="detail-close" onClick={onClose}>✕</div>

      {photos.length > 0 && (
        <div className="detail-photos">
          {photos.map((url, i) => (
            <img key={i} src={url} alt={`${place.name} photo ${i+1}`} />
          ))}
        </div>
      )}

      <div className="detail-name">{place.name}</div>

      <div className="detail-badges">
        <span className={`halal-badge ${halalClass}`}>{window.halalLabel[score]}</span>
        {inMall && <span className="mall-badge">🏬 Mall</span>}
        {place.rating && <span className="rating">⭐ {place.rating} ({place.user_ratings_total})</span>}
        {details?.price_level && (
          <span style={{fontSize:'12px', color:'var(--text-muted)'}}>
            {'RM '.repeat(details.price_level)}
          </span>
        )}
      </div>

      {/* Travel times */}
      {travel && (
        <div className="detail-section">
          <div className="sec-title">Travel from Merdeka 118</div>
          <div className="travel-grid">
            {travel.walk && (
              <div className="travel-box">
                <div className="mode">🚶 Walk</div>
                <div className="dur">{window.fmtDuration(travel.walk.duration?.value)}</div>
                <div className="dist">{window.fmtDist(travel.walk.distance?.value)}</div>
              </div>
            )}
            {travel.drive && (
              <div className="travel-box">
                <div className="mode">🚗 Drive</div>
                <div className="dur">{window.fmtDuration(travel.drive.duration?.value)}</div>
                <div className="dist">{window.fmtDist(travel.drive.distance?.value)}</div>
              </div>
            )}
            {travel.transit && (
              <div className="travel-box">
                <div className="mode">🚇 Transit</div>
                <div className="dur">{window.fmtDuration(travel.transit.duration?.value)}</div>
                <div className="dist">{window.fmtDist(travel.transit.distance?.value)}</div>
              </div>
            )}
          </div>
          <a className="directions-btn" href={mapsUrl} target="_blank" rel="noopener">
            Open in Google Maps ↗
          </a>
        </div>
      )}

      {/* Contact */}
      {(details?.formatted_phone_number || details?.website) && (
        <div className="detail-section">
          <div className="sec-title">Contact</div>
          {details.formatted_phone_number && (
            <div className="detail-row">
              <span>📞</span>
              <a href={`tel:${details.formatted_phone_number}`} style={{color:'var(--text-muted)', textDecoration:'none'}}>
                {details.formatted_phone_number}
              </a>
            </div>
          )}
          {details.website && (
            <div className="detail-row">
              <span>🌐</span>
              <a href={details.website} target="_blank" rel="noopener" style={{color:'var(--accent)', textDecoration:'none', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:'200px', display:'inline-block'}}>
                {details.website.replace(/^https?:\/\//, '').slice(0, 40)}
              </a>
            </div>
          )}
        </div>
      )}

      {/* Hours */}
      {hours.length > 0 && (
        <div className="detail-section">
          <div className="sec-title">Opening Hours</div>
          <div className="hours-list">
            {hours.map((line, i) => (
              <div key={i} className={i === ((todayIdx + 6) % 7) ? 'hours-today' : ''}>
                {line}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Address */}
      <div className="detail-section">
        <div className="sec-title">Address</div>
        <div className="detail-row">
          <span>📍</span>
          <span>{details?.formatted_address || place.vicinity || '—'}</span>
        </div>
      </div>
    </div>
  );
};

window.PlaceCard   = PlaceCard;
window.DetailPanel = DetailPanel;
