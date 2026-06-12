// ── Utilities ──────────────────────────────────────────────────────────────

window.halalScore = function(place) {
  const name     = (place.name     || '').toLowerCase();
  const vicinity = (place.vicinity || '').toLowerCase();
  const types    = Array.isArray(place.types) ? place.types.join(' ').toLowerCase() : '';
  const hay      = name + ' ' + vicinity + ' ' + types;
  const kw       = window.HALAL_KEYWORDS;
  for (var i = 0; i < kw.unlikely.length;  i++) if (hay.indexOf(kw.unlikely[i])  > -1) return 'unsure';
  for (var i = 0; i < kw.cert.length;      i++) if (hay.indexOf(kw.cert[i])      > -1) return 'cert';
  for (var i = 0; i < kw.friendly.length;  i++) if (hay.indexOf(kw.friendly[i])  > -1) return 'friendly';
  return 'cert';
};

window.isMall = function(place) {
  var hay = ((place.name || '') + ' ' + (place.vicinity || '')).toLowerCase();
  return window.KL_MALLS.some(function(m){ return hay.indexOf(m) > -1; });
};

window.photoUrl = function(place, maxW) {
  try {
    return (place.photos && place.photos.length > 0)
      ? place.photos[0].getUrl({ maxWidth: maxW || 200 }) : null;
  } catch(e) { return null; }
};

window.typeEmoji = function(types) {
  if (!Array.isArray(types)) return '🍽️';
  if (types.indexOf('cafe') > -1)           return '☕';
  if (types.indexOf('bakery') > -1)         return '🥐';
  if (types.indexOf('bar') > -1)            return '🍸';
  if (types.indexOf('meal_takeaway') > -1)  return '📦';
  return '🍽️';
};

window.cuisineLabel = function(types) {
  if (!Array.isArray(types)) return null;
  var map = {
    cafe:'Café', bakery:'Bakery', bar:'Bar',
    meal_takeaway:'Takeaway', meal_delivery:'Delivery',
    fast_food:'Fast Food', restaurant:'Restaurant',
    food:'Food Court', night_club:'Club'
  };
  for (var i = 0; i < types.length; i++) if (map[types[i]]) return map[types[i]];
  return null;
};

window.fmtDur = function(secs) {
  if (!secs) return '—';
  var m = Math.round(secs / 60);
  return m < 60 ? m + ' min' : Math.floor(m/60) + 'h ' + (m%60) + 'm';
};

window.fmtDist = function(m) {
  if (!m) return '';
  return m < 1000 ? m + ' m' : (m/1000).toFixed(1) + ' km';
};

window.costDots = function(level) {
  if (!level) return null;
  return [1,2,3,4].map(function(i){
    return React.createElement('span',{key:i,className:i<=level?'cost__on':'cost__off'},'RM');
  });
};

// ── HalalBadge ─────────────────────────────────────────────────────────────

const HalalBadge = ({ score }) => {
  const cfg = {
    cert:     { cls:'halal--cert',     label:'Halal' },
    friendly: { cls:'halal--friendly', label:'Muslim Friendly' },
    unsure:   { cls:'halal--unsure',   label:'Unverified' },
  }[score] || { cls:'halal--cert', label:'Halal' };
  return (
    <span className={`halal ${cfg.cls}`}>
      <span className="halal__dot"/>
      {cfg.label}
    </span>
  );
};

// ── PlaceCard ──────────────────────────────────────────────────────────────

const PlaceCard = ({ place, selected, travel, travelMode, onSelect }) => {
  if (!place || !place.place_id) return null;
  const score  = window.halalScore(place);
  const photo  = window.photoUrl(place, 192);
  const emoji  = window.typeEmoji(place.types);
  const ctag   = window.cuisineLabel(place.types);
  const inMall = window.isMall(place);
  const isOpen = place.opening_hours ? place.opening_hours.open_now : undefined;

  // Show travel time for the selected mode
  const travelData = travel && travel[travelMode];
  const dur  = travelData && travelData.duration  ? travelData.duration.value  : null;
  const dist = travelData && travelData.distance  ? travelData.distance.value  : null;

  const modeIcon = { walk:'🚶', transit:'🚇', drive:'🚗' }[travelMode] || '🚗';

  return (
    <div className={`card${selected?' card--sel':''}`} onClick={() => onSelect(place)}>
      <div className="card__thumb">
        {photo
          ? <img src={photo} alt={place.name} loading="lazy"/>
          : <div className="card__thumb-ph">{emoji}</div>
        }
        {isOpen === false && <div className="card__closed">Closed</div>}
      </div>
      <div className="card__body">
        <div className="card__topline">
          <div style={{minWidth:0}}>
            <h3 className="card__name">{place.name}</h3>
            {place.vicinity && (
              <div className="card__area">{place.vicinity.split(',').slice(0,2).join(',')}</div>
            )}
          </div>
          {place.rating && <span className="rating">⭐ {place.rating}</span>}
        </div>
        <div className="card__tags">
          <HalalBadge score={score}/>
          {ctag && <span className="cuisine-tag">{ctag}</span>}
          {inMall && <span className="cuisine-tag">🏬 Mall</span>}
          {place.price_level ? <span className="cost">{window.costDots(place.price_level)}</span> : null}
        </div>
        <div className="card__foot">
          {dur ? (
            <span className="meta">
              {modeIcon} <span className="meta__val">{window.fmtDur(dur)}</span>
              {dist ? <span style={{color:'var(--border)'}}> · {window.fmtDist(dist)}</span> : null}
            </span>
          ) : (place._crow != null ? (
            <span className="meta">
              📍 <span className="meta__val">{window.fmtDist(place._crow)}</span>
              <span style={{color:'var(--muted)'}}> away</span>
            </span>
          ) : null)}
          <button className="card__dir" onClick={e=>{e.stopPropagation();onSelect(place);}}>
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
  const score = window.halalScore(place);
  const photos = [];
  try {
    var src = (details && details.photos) ? details.photos : (place.photos || []);
    src.slice(0,6).forEach(function(p){ try{ photos.push(p.getUrl({maxWidth:400})); }catch(e){} });
  } catch(e){}

  const todayIdx = new Date().getDay();
  const hours    = (details && details.opening_hours && details.opening_hours.weekday_text) || [];
  const isOpen   = details
    ? (details.opening_hours ? details.opening_hours.open_now : undefined)
    : (place.opening_hours  ? place.opening_hours.open_now   : undefined);

  const lat     = place.geometry && place.geometry.location ? place.geometry.location.lat() : 0;
  const lng     = place.geometry && place.geometry.location ? place.geometry.location.lng() : 0;
  const mapsUrl = 'https://www.google.com/maps/dir/?api=1&destination='+lat+','+lng+'&destination_place_id='+place.place_id;

  return (
    <div className="detail">
      <div className="detail__head">
        <button className="detail__back" onClick={onClose}>←</button>
        <span className="detail__crumb">Restaurant detail</span>
      </div>
      <div className="detail__body">
        {photos.length > 0 && (
          <div style={{display:'flex',gap:'8px',overflowX:'auto',marginBottom:'14px',scrollbarWidth:'none'}}>
            {photos.map((url,i) => (
              <img key={i} src={url} alt="" style={{height:'130px',borderRadius:'9px',objectFit:'cover',flexShrink:0}}/>
            ))}
          </div>
        )}

        <h2 className="detail__name">{place.name}</h2>
        {place.vicinity && <div className="detail__area">{place.vicinity}</div>}

        <div className="detail__tags">
          <HalalBadge score={score}/>
          {isOpen !== undefined && (
            <span className={`open-tag ${isOpen?'open-tag--on':'open-tag--off'}`}>
              {isOpen ? '● Open now' : '● Closed'}
            </span>
          )}
          {details && details.price_level
            ? <span className="cost">{window.costDots(details.price_level)}</span> : null}
          {place.rating && (
            <span className="rating rating--lg">⭐ {place.rating} ({place.user_ratings_total||0})</span>
          )}
        </div>

        {score !== 'cert' && (
          <div className="detail__note">
            <div className="detail__note-ic">!</div>
            {score === 'friendly'
              ? 'Appears Muslim-friendly but may not be certified halal. Verify with the restaurant.'
              : 'Halal status unverified. Please confirm directly with the restaurant before ordering.'}
          </div>
        )}

        {travel && (
          <div className="detail__section">
            <div className="detail__h">Travel from Merdeka 118</div>
            <div className="travel-grid">
              {['walk','transit','drive'].map(mode => {
                const d = travel[mode];
                if (!d) return null;
                const icons = {walk:'🚶',transit:'🚇',drive:'🚗'};
                const labels = {walk:'Walk',transit:'Transit',drive:'Drive'};
                return (
                  <div className="travel-box" key={mode}>
                    <div className="travel-box__mode">{icons[mode]} {labels[mode]}</div>
                    <div className="travel-box__time">{window.fmtDur(d.duration&&d.duration.value)}</div>
                    <div className="travel-box__dist">{window.fmtDist(d.distance&&d.distance.value)}</div>
                  </div>
                );
              })}
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
                <a href={'tel:'+details.formatted_phone_number}>{details.formatted_phone_number}</a>
              </div>
            )}
            {details.website && (
              <div className="detail__row">
                <span>🌐</span>
                <a href={details.website} target="_blank" rel="noopener">
                  {details.website.replace(/^https?:\/\//,'').replace(/\/$/,'').slice(0,45)}
                </a>
              </div>
            )}
          </div>
        )}

        {hours.length > 0 && (
          <div className="detail__section">
            <div className="detail__h">Opening Hours</div>
            <div className="hours-list">
              {hours.map((line,i) => (
                <div key={i} className={i===((todayIdx+6)%7)?'hours-today':''}>{line}</div>
              ))}
            </div>
          </div>
        )}

        <div className="detail__section">
          <div className="detail__h">Address</div>
          <div className="detail__row">
            <span>📍</span>
            <span>{(details&&details.formatted_address)||place.vicinity||'—'}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

window.PlaceCard   = PlaceCard;
window.DetailPanel = DetailPanel;
window.HalalBadge  = HalalBadge;
