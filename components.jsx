// ── Utilities ──────────────────────────────────────────────────────────────

window.halalScore = function(place) {
  // Safety: guard against missing fields
  const name     = (place.name     || '').toLowerCase();
  const vicinity = (place.vicinity || '').toLowerCase();
  const types    = Array.isArray(place.types) ? place.types.join(' ').toLowerCase() : '';
  const hay      = name + ' ' + vicinity + ' ' + types;

  const kw = window.HALAL_KEYWORDS;
  for (const w of kw.unlikely)  if (hay.includes(w)) return 'unsure';
  for (const w of kw.cert)      if (hay.includes(w)) return 'cert';
  for (const w of kw.friendly)  if (hay.includes(w)) return 'friendly';
  return 'cert'; // optimistic default for KL context
};

window.isMall = function(place) {
  const hay = ((place.name || '') + ' ' + (place.vicinity || '')).toLowerCase();
  return window.KL_MALLS.some(m => hay.includes(m));
};

window.photoUrl = function(place, maxW) {
  maxW = maxW || 200;
  try {
    return (place.photos && place.photos.length > 0)
      ? place.photos[0].getUrl({ maxWidth: maxW })
      : null;
  } catch(e) { return null; }
};

window.typeEmoji = function(types) {
  if (!Array.isArray(types)) return '🍽️';
  if (types.includes('cafe'))            return '☕';
  if (types.includes('bakery'))          return '🥐';
  if (types.includes('bar'))             return '🍸';
  if (types.includes('meal_takeaway'))   return '📦';
  return '🍽️';
};

window.fmtDur = function(secs) {
  if (!secs) return '—';
  const m = Math.round(secs / 60);
  return m < 60 ? m + ' min' : Math.floor(m/60) + 'h ' + (m%60) + 'm';
};

window.fmtDist = function(m) {
  if (!m) return '';
  return m < 1000 ? m + ' m' : (m/1000).toFixed(1) + ' km';
};

window.cuisineTag = function(types) {
  if (!Array.isArray(types)) return null;
  const map = {
    cafe:'Café', bakery:'Bakery', bar:'Bar',
    meal_takeaway:'Takeaway', meal_delivery:'Delivery',
    fast_food:'Fast Food', restaurant:'Restaurant'
  };
  for (const t of types) if (map[t]) return map[t];
  return null;
};

window.costDots = function(level) {
  if (!level) return null;
  return [1,2,3,4].map(function(i) {
    return React.createElement(
      'span', { key: i, className: i <= level ? 'cost__on' : 'cost__off' }, 'RM'
    );
  });
};

// ── HalalBadge ─────────────────────────────────────────────────────────────

const HalalBadge = ({ score }) => {
  const cfg = {
    cert:     { cls: 'halal--cert',     label: 'Halal' },
    friendly: { cls: 'halal--friendly', label: 'Muslim Friendly' },
    unsure:   { cls: 'halal--unsure',   label: 'Verify Halal' },
  }[score] || { cls: 'halal--cert', label: 'Halal' };
  return (
    <span className={`halal ${cfg.cls}`}>
      <span className="halal__dot" />
      {cfg.label}
    </span>
  );
};

// ── PlaceCard ──────────────────────────────────────────────────────────────

const PlaceCard = ({ place, selected, travel, onSelect }) => {
  // Guard: skip rendering if place is malformed
  if (!place || !place.place_id) return null;

  const score  = window.halalScore(place);
  const photo  = window.photoUrl(place, 192);
  const emoji  = window.typeEmoji(place.types);
  const ctag   = window.cuisineTag(place.types);
  const inMall = window.isMall(place);
  const isOpen = place.opening_hours && place.opening_hours.open_now;

  return (
    <div
      className={`card${selected ? ' card--sel' : ''}`}
      onClick={() => onSelect(place)}
    >
      <div className="card__thumb">
        {photo
          ? <img src={photo} alt={place.name} loading="lazy" />
          : <div className="card__thumb-ph">{emoji}</div>
        }
        {isOpen === false && <div className="card__closed">Closed</div>}
      </div>

      <div className="card__body">
        <div className="card__topline">
          <div>
            <h3 className="card__name">{place.name}</h3>
            {place.vicinity && (
              <span className="card__area">{place.vicinity.split(',')[0]}</span>
            )}
          </div>
          {place.rating && (
            <span className="rating">⭐ {place.rating}</span>
          )}
        </div>

        <div className="card__tags">
          <HalalBadge score={score} />
          {ctag && <span className="cuisine-tag">{ctag}</span>}
          {inMall && <span className="cuisine-tag">🏬 Mall</span>}
          {place.price_level && (
            <span className="cost">{window.costDots(place.price_level)}</span>
          )}
        </div>

        <div className="card__foot">
          {travel && travel.walk && (
            <span className="meta">
              🚶 <span className="meta__min">{window.fmtDur(travel.walk.duration && travel.walk.duration.value)}</span>
            </span>
          )}
          {travel && travel.drive && (
            <span className="meta">
              🚗 <span className="meta__min">{window.fmtDur(travel.drive.duration && travel.drive.duration.value)}</span>
            </span>
          )}
          <button
            className="card__dir"
            onClick={function(e){ e.stopPropagation(); onSelect(place); }}
          >
            Details →
          </button>
        </div>
      </div>
    </div>
  );
};

// ── DetailPanel ────────────────────────────────────────────────────────────

const DetailPanel = ({ place, details, travel, onClose }) => {
  if (!place) return null;

  const score  = window.halalScore(place);
  const photos = [];
  try {
    const src = (details && details.photos) ? details.photos : (place.photos || []);
    src.slice(0, 6).forEach(function(p) {
      try { photos.push(p.getUrl({ maxWidth: 400 })); } catch(e) {}
    });
  } catch(e) {}

  const todayIdx = new Date().getDay();
  const hours    = (details && details.opening_hours && details.opening_hours.weekday_text) || [];
  const isOpen   = details
    ? (details.opening_hours && details.opening_hours.open_now)
    : (place.opening_hours && place.opening_hours.open_now);

  const lat     = place.geometry && place.geometry.location ? place.geometry.location.lat() : 0;
  const lng     = place.geometry && place.geometry.location ? place.geometry.location.lng() : 0;
  const mapsUrl = 'https://www.google.com/maps/dir/?api=1&destination=' + lat + ',' + lng +
                  '&destination_place_id=' + place.place_id;

  return (
    <div className="detail">
      <div className="detail__head">
        <button className="detail__back" onClick={onClose}>←</button>
        <span className="detail__crumb">Restaurant detail</span>
      </div>

      <div className="detail__body">
        {photos.length > 0 && (
          <div style={{display:'flex',gap:'8px',overflowX:'auto',marginBottom:'16px',scrollbarWidth:'none'}}>
            {photos.map(function(url, i) {
              return <img key={i} src={url} alt="" style={{height:'140px',borderRadius:'10px',objectFit:'cover',flexShrink:0}} />;
            })}
          </div>
        )}

        <h2 className="detail__name">{place.name}</h2>
        {place.vicinity && <div className="detail__area">{place.vicinity}</div>}

        <div className="detail__tags">
          <HalalBadge score={score} />
          {isOpen !== undefined && isOpen !== null && (
            <span className={`open-tag ${isOpen ? 'open-tag--on' : 'open-tag--off'}`}>
              {isOpen ? '● Open now' : '● Closed'}
            </span>
          )}
          {details && details.price_level && (
            <span className="cost">{window.costDots(details.price_level)}</span>
          )}
          {place.rating && (
            <span className="rating rating--lg">⭐ {place.rating} ({place.user_ratings_total || 0})</span>
          )}
        </div>

        {score !== 'cert' && (
          <div className="detail__note">
            <div className="detail__note-ic">!</div>
            {score === 'friendly'
              ? 'This place appears Muslim-friendly but may not be certified halal. Please verify with the restaurant directly.'
              : 'Halal status unclear. Please verify directly with the restaurant before ordering.'}
          </div>
        )}

        {travel && (
          <div className="detail__section">
            <div className="detail__h">Travel from Merdeka 118</div>
            <div className="travel-grid">
              {travel.walk && (
                <div className="travel-box">
                  <div className="travel-box__mode">🚶 Walk</div>
                  <div className="travel-box__time">{window.fmtDur(travel.walk.duration && travel.walk.duration.value)}</div>
                  <div className="travel-box__dist">{window.fmtDist(travel.walk.distance && travel.walk.distance.value)}</div>
                </div>
              )}
              {travel.drive && (
                <div className="travel-box">
                  <div className="travel-box__mode">🚗 Drive</div>
                  <div className="travel-box__time">{window.fmtDur(travel.drive.duration && travel.drive.duration.value)}</div>
                  <div className="travel-box__dist">{window.fmtDist(travel.drive.distance && travel.drive.distance.value)}</div>
                </div>
              )}
              {travel.transit && (
                <div className="travel-box">
                  <div className="travel-box__mode">🚇 Transit</div>
                  <div className="travel-box__time">{window.fmtDur(travel.transit.duration && travel.transit.duration.value)}</div>
                  <div className="travel-box__dist">{window.fmtDist(travel.transit.distance && travel.transit.distance.value)}</div>
                </div>
              )}
            </div>
            <a className="btn btn--primary" href={mapsUrl} target="_blank" rel="noopener">
              Open in Google Maps ↗
            </a>
          </div>
        )}

        {details && (details.formatted_phone_number || details.website) && (
          <div className="detail__section">
            <div className="detail__h">Contact</div>
            {details.formatted_phone_number && (
              <div className="detail__row">
                <span>📞</span>
                <a href={'tel:' + details.formatted_phone_number}>{details.formatted_phone_number}</a>
              </div>
            )}
            {details.website && (
              <div className="detail__row">
                <span>🌐</span>
                <a href={details.website} target="_blank" rel="noopener">
                  {details.website.replace(/^https?:\/\//, '').replace(/\/$/, '').slice(0, 45)}
                </a>
              </div>
            )}
          </div>
        )}

        {hours.length > 0 && (
          <div className="detail__section">
            <div className="detail__h">Opening Hours</div>
            <div className="hours-list">
              {hours.map(function(line, i) {
                return (
                  <div key={i} className={i === ((todayIdx + 6) % 7) ? 'hours-today' : ''}>
                    {line}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="detail__section">
          <div className="detail__h">Address</div>
          <div className="detail__row">
            <span>📍</span>
            <span>{(details && details.formatted_address) || place.vicinity || '—'}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

window.PlaceCard   = PlaceCard;
window.DetailPanel = DetailPanel;
window.HalalBadge  = HalalBadge;
