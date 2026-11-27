// ── Utilities ──────────────────────────────────────────────────────────────

// Whole-word keyword matcher, built once ("ham" must not match "Hamid")
function buildMatcher(words) {
  if (!words || !words.length) return function(){ return false; };
  var esc = words.map(function(w){ return w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); });
  var re = new RegExp('(^|[^a-z0-9])(' + esc.join('|') + ')(?=$|[^a-z0-9])', 'i');
  return function(text){ return re.test(text); };
}
var isFriendlyText = buildMatcher(window.HALAL_KEYWORDS.friendly);
var isUnlikelyText = buildMatcher(window.HALAL_KEYWORDS.unlikely);

window.haystack = function(place) {
  return ((place.name || '') + ' ' + (place.vicinity || '') + ' ' +
          (Array.isArray(place.types) ? place.types.join(' ') : '')).toLowerCase();
};

// Halal status, most reliable source first.
// Internal values stay 'cert' | 'friendly' | 'unsure' (same as v1).
window.halalScore = function(place) {
  if (place.verified && place.verified.halal) return place.verified.halal; // 1. you checked JAKIM
  if (place.halal === 'only') return 'cert';                             // 2. OSM tag
  if (place.halal === 'no')   return 'unsure';
  var hay = window.haystack(place);
  if (isUnlikelyText(hay))    return 'unsure';                           // 3. red-flag words
  if (place.halal === 'yes')  return 'friendly';
  if (isFriendlyText(hay))    return 'friendly';                         // 4. name / cuisine hints
  return 'unsure';                                                       // 5. unknown
};

window.halalSource = function(place) {
  if (place.verified && place.verified.halal) {
    var when = place.verified.checked ? ' (checked ' + window.fmtDate(place.verified.checked) + ')' : '';
    return 'Verified on the JAKIM Halal Malaysia portal' + when + '.';
  }
  if (place.halal === 'only') return 'Tagged “halal only” on OpenStreetMap. Not verified with JAKIM.';
  if (place.halal === 'yes')  return 'Tagged “some halal options” on OpenStreetMap. Not verified with JAKIM.';
  return null;
};

window.isMall = function(place) {
  var hay = ((place.name || '') + ' ' + (place.vicinity || '')).toLowerCase();
  return window.KL_MALLS.some(function(m){ return hay.indexOf(m) > -1; });
};

window.typeEmoji = function(types) {
  if (!Array.isArray(types)) return '🍽️';
  var t = types.join(' ');
  if (/\b(coffee_shop|coffee)\b/.test(t) || types[0] === 'cafe') return '☕';
  if (types[0] === 'bakery' || types[0] === 'pastry') return '🥐';
  if (/\b(burger)\b/.test(t)) return '🍔';
  if (/\b(pizza)\b/.test(t)) return '🍕';
  if (/\b(chicken)\b/.test(t)) return '🍗';
  if (/\b(noodle|ramen)\b/.test(t)) return '🍜';
  if (/\b(sushi|japanese)\b/.test(t)) return '🍱';
  if (/\b(indian)\b/.test(t)) return '🫓';
  if (types[0] === 'fast_food') return '🥡';
  if (types[0] === 'food_court') return '🏪';
  return '🍽️';
};

var TYPE_LABEL = {
  restaurant:'Restaurant', cafe:'Café', fast_food:'Fast food',
  food_court:'Food court', bakery:'Bakery', pastry:'Pastry'
};
window.cuisineLabel = function(types) {
  if (!Array.isArray(types) || !types.length) return null;
  var kind = TYPE_LABEL[types[0]] || null;
  var c = types[1] ? types[1].replace(/_/g, ' ') : null;
  if (c) c = c.charAt(0).toUpperCase() + c.slice(1);
  return c ? (kind ? c + ' · ' + kind : c) : kind;
};

// Walking estimate: straight line × 1.3 detour factor at 80 m per minute
window.walkMetres = function(place) { return Math.round((place._crow || 0) * 1.3); };
window.walkMins   = function(place) { return Math.max(1, Math.round(window.walkMetres(place) / 80)); };

window.fmtMins = function(m) { return m < 60 ? m + ' min' : Math.floor(m/60) + 'h ' + (m%60) + 'm'; };
window.fmtDist = function(m) {
  if (m == null) return '';
  return m < 1000 ? m + ' m' : (m/1000).toFixed(1) + ' km';
};
window.fmtDate = function(iso) {
  try { return new Date(iso).toLocaleDateString('en-MY', { day:'numeric', month:'short', year:'numeric' }); }
  catch (e) { return iso; }
};

// ── Free links (no API key needed) ─────────────────────────────────────────

// Text Google Maps can resolve to the right restaurant: name + street + city.
// Coordinates alone get snapped to whatever business is nearest the point.
window.placeQuery = function(place) {
  var q = place.name;
  var v = place.vicinity || '';
  if (v) q += ', ' + v;
  if (!/kuala lumpur/i.test(v)) q += ', Kuala Lumpur';
  return q;
};
window.dirUrl = function(place, mode) {
  return 'https://www.google.com/maps/dir/?api=1' +
    '&origin=' + encodeURIComponent(window.CONFIG.ORIGIN_NAME) +
    '&destination=' + encodeURIComponent(window.placeQuery(place)) +
    '&travelmode=' + (mode || 'walking');
};
window.googleSearchUrl = function(place) {
  return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(window.placeQuery(place));
};
window.osmUrl = function(place) {
  return /^(node|way)\//.test(place.place_id)
    ? 'https://www.openstreetmap.org/' + place.place_id : null;
};
window.mapillaryUrl = function(place) {
  return place.mly ? 'https://www.mapillary.com/app/?pKey=' + encodeURIComponent(place.mly) : null;
};
window.safeUrl = function(u) {
  if (!u) return null;
  u = String(u).trim();
  if (/^[a-z][a-z0-9+.-]*:/i.test(u) && !/^https?:\/\//i.test(u)) return null; // other schemes
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  return /^https?:\/\/[^\s"'<>]+$/i.test(u) ? u : null;
};

// ── HalalBadge ─────────────────────────────────────────────────────────────

const HalalBadge = ({ score }) => {
  const cfg = {
    cert:     { cls:'halal--cert',     label:'Halal' },
    friendly: { cls:'halal--friendly', label:'Muslim-friendly' },
    unsure:   { cls:'halal--unsure',   label:'Unverified' },
  }[score] || { cls:'halal--unsure', label:'Unverified' };
  return (
    <span className={`halal ${cfg.cls}`}>
      <span className="halal__dot"/>
      {cfg.label}
    </span>
  );
};

// ── PlaceCard ──────────────────────────────────────────────────────────────

const PlaceCard = ({ place, selected, travelMode, onSelect }) => {
  const score  = window.halalScore(place);
  const ctag   = window.cuisineLabel(place.types);
  const inMall = window.isMall(place);
  const area   = (place.vicinity || '').split(',').slice(0, 2).join(',');

  return (
    <div className={`card${selected ? ' card--sel' : ''}`} onClick={() => onSelect(place)}>
      <div className={`card__thumb card__thumb--${score}`}>{window.typeEmoji(place.types)}</div>
      <div className="card__body">
        <div style={{minWidth:0}}>
          <h3 className="card__name">{place.name}</h3>
          {area && <div className="card__area">{area}</div>}
        </div>
        <div className="card__tags">
          <HalalBadge score={score}/>
          {ctag && <span className="cuisine-tag">{ctag}</span>}
          {inMall && <span className="cuisine-tag">🏬 Mall</span>}
        </div>
        <div className="card__foot">
          {travelMode === 'walk' ? (
            <span className="meta">
              🚶 <span className="meta__val">~{window.fmtMins(window.walkMins(place))}</span>
              <span> · {window.fmtDist(window.walkMetres(place))}</span>
            </span>
          ) : (
            <span className="meta">
              📍 <span className="meta__val">{window.fmtDist(place._crow)}</span>
              <span> straight line</span>
            </span>
          )}
          <button className="card__dir" onClick={e => { e.stopPropagation(); onSelect(place); }}>
            Details →
          </button>
        </div>
      </div>
    </div>
  );
};

// ── DetailPanel ────────────────────────────────────────────────────────────

const DetailPanel = ({ place, onClose }) => {
  if (!place) return null;
  const score   = window.halalScore(place);
  const source  = window.halalSource(place);
  const website = window.safeUrl(place.website);
  const osm     = window.osmUrl(place);
  const mly     = window.mapillaryUrl(place);
  const report  = window.CONFIG.REPORT_URL;
  const ctag    = window.cuisineLabel(place.types);

  return (
    <div className="detail">
      <div className="detail__head">
        <button className="detail__back" onClick={onClose} aria-label="Back to list">←</button>
        <span className="detail__crumb">Restaurant detail</span>
      </div>
      <div className="detail__body">
        <div className={`detail__hero card__thumb--${score}`}>{window.typeEmoji(place.types)}</div>

        <h2 className="detail__name">{place.name}</h2>
        {place.vicinity && <div className="detail__area">{place.vicinity}</div>}

        <div className="detail__tags">
          <HalalBadge score={score}/>
          {ctag && <span className="cuisine-tag">{ctag}</span>}
          {window.isMall(place) && <span className="cuisine-tag">🏬 Mall</span>}
        </div>

        {score === 'cert' && source && (
          <div className="detail__note detail__note--ok">
            <div className="detail__note-ic">✓</div>{source}
          </div>
        )}
        {score !== 'cert' && (
          <div className="detail__note">
            <div className="detail__note-ic">!</div>
            {score === 'friendly'
              ? (source || 'Looks Muslim-friendly from its name or cuisine.') + ' Please confirm with the restaurant.'
              : 'Halal status unknown. Please confirm directly with the restaurant before ordering.'}
          </div>
        )}

        <div className="detail__section">
          <div className="detail__h">Getting there from Merdeka 118</div>
          <div className="travel-grid">
            <a className="travel-box" href={window.dirUrl(place, 'walking')} target="_blank" rel="noopener">
              <div className="travel-box__mode">🚶 Walk</div>
              <div className="travel-box__time">~{window.fmtMins(window.walkMins(place))}</div>
              <div className="travel-box__dist">≈ {window.fmtDist(window.walkMetres(place))}</div>
            </a>
            <a className="travel-box" href={window.dirUrl(place, 'transit')} target="_blank" rel="noopener">
              <div className="travel-box__mode">🚇 Transit</div>
              <div className="travel-box__time travel-box__time--link">Route ↗</div>
              <div className="travel-box__dist">in Google Maps</div>
            </a>
            <a className="travel-box" href={window.dirUrl(place, 'driving')} target="_blank" rel="noopener">
              <div className="travel-box__mode">🚗 Drive</div>
              <div className="travel-box__time travel-box__time--link">Route ↗</div>
              <div className="travel-box__dist">in Google Maps</div>
            </a>
          </div>
          <div className="fineprint">Walking time is an estimate from straight-line distance. Tap a box for the real route.</div>
        </div>

        <div className="detail__section">
          <div className="detail__h">See it before you go</div>
          <div className="btns">
            <a className="btn btn--primary" href={window.googleSearchUrl(place)} target="_blank" rel="noopener">
              Photos &amp; reviews ↗
            </a>
            {mly && (
              <a className="btn btn--ghost" href={mly} target="_blank" rel="noopener">Street view ↗</a>
            )}
          </div>
        </div>

        {(place.phone || website) && (
          <div className="detail__section">
            <div className="detail__h">Contact</div>
            {place.phone && (
              <div className="detail__row">
                <span>📞</span>
                <a href={'tel:' + place.phone.replace(/[^\d+]/g, '')}>{place.phone}</a>
              </div>
            )}
            {website && (
              <div className="detail__row">
                <span>🌐</span>
                <a href={website} target="_blank" rel="noopener">
                  {website.replace(/^https?:\/\//, '').replace(/\/$/, '').slice(0, 45)}
                </a>
              </div>
            )}
          </div>
        )}

        {place.hours && (
          <div className="detail__section">
            <div className="detail__h">Opening hours</div>
            <div className="hours-raw">{place.hours.split(';').map((s, i) => <div key={i}>{s.trim()}</div>)}</div>
            <div className="fineprint">From OpenStreetMap. Mo = Monday, PH = public holidays.</div>
          </div>
        )}

        {(report || osm) && (
        <div className="detail__section">
          <div className="detail__h">Help keep this right</div>
          {report && (
            <div className="detail__row">
              <span>📝</span>
              <a href={report} target="_blank" rel="noopener">Report halal status or a closure</a>
            </div>
          )}
          {osm && (
            <div className="detail__row">
              <span>🗺</span>
              <a href={osm} target="_blank" rel="noopener">View or fix this place on OpenStreetMap</a>
            </div>
          )}
        </div>
        )}
      </div>
    </div>
  );
};

window.PlaceCard   = PlaceCard;
window.DetailPanel = DetailPanel;
window.HalalBadge  = HalalBadge;
