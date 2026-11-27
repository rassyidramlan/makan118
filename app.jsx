const { useEffect, useState, useRef, useCallback, useMemo } = React;

// ── Map (MapLibre GL + OpenFreeMap, no key) ────────────────────────────────
// MapLibre uses [lng, lat] order — the reverse of Google's {lat, lng}.

var mlMap      = null;
var mlPopup    = null;
var mapReady   = null;   // Promise resolved once the places layers exist
var onMapPick  = function(){};  // replaced by the App on every render

var EMPTY_FC = { type:'FeatureCollection', features:[] };

function lngLat(p) { return [p.lng, p.lat]; }

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
    return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
  });
}

function initMap() {
  var C = window.CONFIG;
  mlMap = new maplibregl.Map({
    container: 'map',
    style:     C.MAP_STYLE,
    center:    lngLat(C.MERDEKA118),
    zoom:      15,
  });
  mlMap.addControl(new maplibregl.NavigationControl({ showCompass:false }), 'top-right');
  mlPopup = new maplibregl.Popup({ offset:10, closeButton:false, maxWidth:'220px' });

  // Merdeka 118 pin
  var el = document.createElement('div');
  el.className = 'm118-pin';
  el.textContent = '118';
  el.title = 'Menara Merdeka 118';
  new maplibregl.Marker({ element: el }).setLngLat(lngLat(C.MERDEKA118)).addTo(mlMap);

  mapReady = new Promise(function(resolve) {
    mlMap.on('load', function() {
      mlMap.addSource('places', { type:'geojson', data: EMPTY_FC });

      mlMap.addLayer({
        id: 'places-dots', type: 'circle', source: 'places',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 13, 4, 16, 7, 18, 9],
          'circle-color': ['match', ['get', 'score'],
            'cert', '#2E7D5B', 'friendly', '#E0892F', '#C0504D'],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1.5,
        },
      });

      mlMap.addLayer({
        id: 'places-selected', type: 'circle', source: 'places',
        filter: ['==', ['get', 'id'], ''],
        paint: {
          'circle-radius': 11,
          'circle-color': '#E0892F',
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2.5,
        },
      });

      mlMap.on('click', 'places-dots', function(e) {
        var f = e.features && e.features[0];
        if (f) onMapPick(f.properties.id);
      });
      mlMap.on('mouseenter', 'places-dots', function(){ mlMap.getCanvas().style.cursor = 'pointer'; });
      mlMap.on('mouseleave', 'places-dots', function(){ mlMap.getCanvas().style.cursor = ''; });

      resolve();
    });
  });
}

function setMapPlaces(places) {
  if (!mapReady) return;
  mapReady.then(function() {
    mlMap.getSource('places').setData({
      type: 'FeatureCollection',
      features: places.map(function(p) {
        return {
          type: 'Feature',
          geometry: { type:'Point', coordinates: lngLat(p) },
          properties: { id: p.place_id, score: window.halalScore(p) },
        };
      }),
    });
  });
}

function setMapSelected(place) {
  if (!mapReady) return;
  mapReady.then(function() {
    mlMap.setFilter('places-selected', ['==', ['get', 'id'], place ? place.place_id : '']);
    if (place) {
      mlMap.flyTo({ center: lngLat(place), zoom: 17, speed: 1.4 });
      mlPopup.setLngLat(lngLat(place))
        .setHTML('<strong style="font-size:13px">' + escapeHtml(place.name) + '</strong>' +
                 (place.vicinity ? '<br><span style="font-size:11px;color:#6E7873">' +
                  escapeHtml(place.vicinity) + '</span>' : ''))
        .addTo(mlMap);
    } else {
      mlPopup.remove();
    }
  });
}

function resetMapView() {
  if (!mlMap) return;
  mlPopup && mlPopup.remove();
  mlMap.flyTo({ center: lngLat(window.CONFIG.MERDEKA118), zoom: 15 });
}

// ── Filter constants ───────────────────────────────────────────────────────

var CUISINE_CHIPS = [
  'All', 'Malay / Nasi', 'Mamak / Nasi Kandar', 'Indian', 'Chinese',
  'Western', 'Middle Eastern', 'Japanese / Korean', 'Cafe / Brunch', 'Quick bites',
];

// Matched against name, address and OpenStreetMap cuisine tags
var CUISINE_KEYWORDS = {
  'Malay / Nasi':        ['nasi','malay','melayu','malaysian','rendang','lemak','padang','campur','warung','indonesian','ayam penyet'],
  'Mamak / Nasi Kandar': ['mamak','kandar','roti canai','teh tarik','murtabak'],
  'Indian':              ['indian','briyani','biryani','tandoor','curry','dosai','thosai','chapati','banana leaf'],
  'Chinese':     ['chinese','dim sum','wonton','chow','fried rice','noodle','cantonese'],
  'Western':             ['western','burger','steak','pasta','pizza','sandwich','american','italian','grill'],
  'Middle Eastern':      ['arab','arabic','middle_eastern','kebab','shawarma','turkish','lebanese','yemeni','persian'],
  'Japanese / Korean':   ['japanese','korean','sushi','ramen','bento','bulgogi'],
  'Cafe / Brunch':       ['cafe','coffee','coffee_shop','brunch','bakery','pastry','cake','waffle','toast','tea'],
  'Quick bites':         ['fast_food','fast food','takeaway','snack','kiosk','chicken','food_court','food court','economy'],
};

var TRAVEL_MODES  = ['walk','transit','drive'];
var TRAVEL_LABELS = { walk:'Walk', transit:'Transit', drive:'Drive' };
var TRAVEL_ICONS  = { walk:'🚶', transit:'🚇', drive:'🚗' };

var HALAL_FILTER_OPTS = [
  { value:'all',      label:'All'             },
  { value:'cert',     label:'Halal'           },
  { value:'friendly', label:'Muslim-friendly' },
  { value:'unsure',   label:'Unverified'      },
];

var SORT_OPTS = [
  { value:'near',  label:'Nearest'     },
  { value:'halal', label:'Halal first' },
  { value:'name',  label:'A–Z'         },
];

// Whole-word matchers ("tea" must not match "steak")
var CUISINE_MATCHERS = {};
Object.keys(CUISINE_KEYWORDS).forEach(function(k){ CUISINE_MATCHERS[k] = buildMatcher(CUISINE_KEYWORDS[k]); });

function matchesCuisine(place, chip) {
  if (chip === 'All') return true;
  var m = CUISINE_MATCHERS[chip];
  return m ? m(window.haystack(place)) : true;
}

// ── "Missing a place?" ─────────────────────────────────────────────────────
// Points people to OpenStreetMap, where new places get added. They appear on
// Makan@118 after the next data refresh (node scripts/build-places.mjs).

function MissingPlace() {
  var C = window.CONFIG;
  var editUrl = 'https://www.openstreetmap.org/edit#map=19/' +
    C.MERDEKA118.lat.toFixed(5) + '/' + C.MERDEKA118.lng.toFixed(5);
  return (
    <div className="missing">
      <div className="missing__h">Missing a place?</div>
      <p className="missing__p">
        Makan@118 lists eateries from OpenStreetMap, the free map anyone can edit.
        Add a missing restaurant there and it shows up here after the next monthly refresh.
      </p>
      <div className="missing__links">
        <a className="btn btn--ghost" href="https://every-door.app" target="_blank" rel="noopener">
          On your phone: Every Door app ↗
        </a>
        <a className="btn btn--ghost" href={editUrl} target="_blank" rel="noopener">
          On a laptop: edit the map ↗
        </a>
        {C.REPORT_URL && (
          <a className="btn btn--ghost" href={C.REPORT_URL} target="_blank" rel="noopener">
            Or just tell us ↗
          </a>
        )}
      </div>
      <p className="missing__tip">
        Tips: use the name on the shopfront, set the floor level for places inside 118 Mall,
        and add “halal only” only if a JAKIM certificate is displayed. Please don’t copy from Google Maps.
      </p>
    </div>
  );
}

// Pop-up version of the same content, opened from the "+" in the top bar
function AddPlaceModal({ onClose }) {
  useEffect(() => {
    var onKey = function(e){ if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal" onClick={onClose}>
      <div className="modal__box" role="dialog" aria-modal="true" aria-label="Add a missing place"
        onClick={e => e.stopPropagation()}>
        <button className="modal__close" onClick={onClose} aria-label="Close">✕</button>
        <MissingPlace/>
      </div>
    </div>
  );
}

// ── App ────────────────────────────────────────────────────────────────────

function App() {
  const C = window.CONFIG;
  const [data,        setData]        = useState(null);
  const [error,       setError]       = useState(null);
  const [cuisine,     setCuisine]     = useState('All');
  const [travelMode,  setTravelMode]  = useState('walk');
  const [halalFilter, setHalalFilter] = useState('all');
  const [sortBy,      setSortBy]      = useState('near');
  const [radius,      setRadius]      = useState(C.DEFAULT_RADIUS);
  const [selected,    setSelected]    = useState(null);
  const [mobileView,  setMobileView]  = useState('list');
  const [showAdd,     setShowAdd]     = useState(false);
  const panelRef = useRef(null);

  const places  = data ? data.places : [];
  const maxRad  = data ? data.radius : 3000;

  // ── Init: map + data (one static file, no API calls) ─────────────────
  useEffect(() => {
    initMap();
    fetch('places.json', { cache: 'no-cache' })
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(setData)
      .catch(e => setError(e.message));
  }, []);

  // MapLibre needs a resize when the map tab becomes visible on mobile
  useEffect(() => { if (mlMap) setTimeout(() => mlMap.resize(), 0); }, [mobileView]);

  const handleSelect = useCallback((place) => {
    setSelected(place);
    if (panelRef.current) panelRef.current.scrollTop = 0;
  }, []);

  // Map dot clicks → select that place and show its details
  onMapPick = function(id) {
    var p = places.find(function(x){ return x.place_id === id; });
    if (p) { handleSelect(p); setMobileView('list'); }
  };

  useEffect(() => { setMapSelected(selected); }, [selected]);

  const resetAll = () => {
    setCuisine('All'); setHalalFilter('all'); setSortBy('near');
    setTravelMode('walk'); setRadius(C.DEFAULT_RADIUS);
    setSelected(null); setMobileView('list');
    resetMapView();
  };

  // ── Derived filtered + sorted list ────────────────────────────────────
  const displayPlaces = useMemo(() => {
    var maxDist = travelMode === 'walk' ? Math.min(radius, C.WALK_CAP) : radius;
    var list = places.filter(function(p) {
      if (p._crow > maxDist) return false;
      if (!matchesCuisine(p, cuisine)) return false;
      if (halalFilter !== 'all' && window.halalScore(p) !== halalFilter) return false;
      return true;
    });
    var rank = { cert:0, friendly:1, unsure:2 };
    list.sort(function(a, b) {
      if (sortBy === 'halal') {
        var d = rank[window.halalScore(a)] - rank[window.halalScore(b)];
        return d !== 0 ? d : a._crow - b._crow;
      }
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      return a._crow - b._crow;
    });
    return list;
  }, [places, cuisine, halalFilter, travelMode, sortBy, radius]);

  useEffect(() => { setMapPlaces(displayPlaces); }, [displayPlaces]);

  const effRadius   = travelMode === 'walk' ? Math.min(radius, C.WALK_CAP) : radius;
  const radiusLabel = effRadius >= 1000 ? (effRadius/1000).toFixed(1) + ' km' : effRadius + ' m';
  const sortLabel   = (SORT_OPTS.find(o => o.value === sortBy) || {}).label;
  const loading     = !data && !error;

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className={`app view-${mobileView}`}>

      <div className="topbar">
        <button className="brand" onClick={resetAll} title="Reset Makan@118">
          <div className="brand__mark">Makan<span className="brand__at">@118</span></div>
        </button>
        <div className="loc">
          <div className="loc__dot"/>
          <div className="loc__name">Makan places around Merdeka 118</div>
        </div>
        <div className="topbar__spacer"/>
        <div className="count-pill">{loading ? 'loading…' : displayPlaces.length + ' places'}</div>
        <button className="add-btn" onClick={() => setShowAdd(true)}
          title="Missing a place? Add it" aria-label="Add a missing place">+</button>
      </div>

      <div className="filters">
        <div className="filters__row filters__row--chips">
          {CUISINE_CHIPS.map(c => (
            <button key={c} className={`chip${cuisine === c ? ' chip--on' : ''}`} onClick={() => setCuisine(c)}>{c}</button>
          ))}
        </div>

        <div className="filters__meta">
          <div className="ctrl ctrl--cuisine">
            <div className="ctrl__label">Type of food</div>
            <select className="cuisine-select" value={cuisine} onChange={e => setCuisine(e.target.value)}>
              {CUISINE_CHIPS.map(c => <option key={c} value={c}>{c === 'All' ? 'All food types' : c}</option>)}
            </select>
          </div>

          <div className="ctrl">
            <div className="ctrl__label">Getting there</div>
            <div className="seg">
              {TRAVEL_MODES.map(m => (
                <button key={m} className={`seg__btn${travelMode === m ? ' seg__btn--on' : ''}`}
                  onClick={() => setTravelMode(m)}>
                  {TRAVEL_ICONS[m]} {TRAVEL_LABELS[m]}
                </button>
              ))}
            </div>
          </div>

          <div className="ctrl">
            <div className="ctrl__label">Halal status</div>
            <div className="seg">
              {HALAL_FILTER_OPTS.map(o => (
                <button key={o.value} className={`seg__btn${halalFilter === o.value ? ' seg__btn--on' : ''}`}
                  onClick={() => setHalalFilter(o.value)}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <div className="ctrl ctrl--dist">
            <div className="ctrl__label">
              Within <strong>{radiusLabel}</strong>
              {travelMode === 'walk' ? ' walking' : ''}
            </div>
            <input className="range" type="range" min="500" step="250"
              max={travelMode === 'walk' ? Math.min(maxRad, C.WALK_CAP) : maxRad}
              value={effRadius} aria-label="Search radius"
              onChange={e => setRadius(Number(e.target.value))}/>
          </div>
        </div>
      </div>

      <div className="vtabs">
        <button className={`vtab${mobileView === 'list' ? ' vtab--on' : ''}`} onClick={() => setMobileView('list')}>🍽 List</button>
        <button className={`vtab${mobileView === 'map' ? ' vtab--on' : ''}`} onClick={() => setMobileView('map')}>🗺 Map</button>
      </div>

      <div className="stage">
        <div className="panel" ref={panelRef}>
          {selected ? (
            <DetailPanel place={selected} onClose={() => { setSelected(null); resetMapView(); }}/>
          ) : (
            <div className="list">
              <div className="listhead">
                <span className="listhead__count">
                  {loading ? 'Loading places…' : error ? 'Could not load places' : displayPlaces.length + ' places found'}
                </span>
                <span className="listhead__sort">↕ {sortLabel}</span>
              </div>

              <div className="verify">
                <div className="verify__dot"/>
                “Halal” means verified on the JAKIM portal or tagged halal-only on OpenStreetMap.
                “Muslim-friendly” is a guess from the name or cuisine. Always confirm with the restaurant.
              </div>

              <div style={{display:'flex',gap:'6px',marginBottom:'12px',flexWrap:'wrap'}}>
                {SORT_OPTS.map(o => (
                  <button key={o.value} className={`chip${sortBy === o.value ? ' chip--on' : ''}`}
                    style={{padding:'4px 11px',fontSize:'11.5px'}} onClick={() => setSortBy(o.value)}>
                    {o.label}
                  </button>
                ))}
              </div>

              {loading && (
                <div className="spinner-wrap"><div className="spinner"/><span>Loading eateries near Merdeka 118…</span></div>
              )}

              {error && (
                <div className="empty">
                  <div className="empty__h">places.json not found</div>
                  <div className="empty__p">Run <code>node scripts/build-places.mjs</code> and upload places.json. ({error})</div>
                </div>
              )}

              {data && displayPlaces.length === 0 && (
                <div className="empty">
                  <div className="empty__h">No places found</div>
                  <div className="empty__p">Try a different food type or halal setting, or widen the radius</div>
                </div>
              )}

              {displayPlaces.map(p => (
                <PlaceCard key={p.place_id} place={p} travelMode={travelMode}
                  selected={selected && selected.place_id === p.place_id} onSelect={handleSelect}/>
              ))}

              {data && <MissingPlace/>}

              {data && (
                <div className="loading-more">
                  Showing {displayPlaces.length} of {places.length} places · data updated {window.fmtDate(data.generated_at)}<br/>
                  Map data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors
                </div>
              )}
            </div>
          )}
        </div>

        <div className="mapwrap">
          <div id="map" className="map"/>
          <div className="maplegend">
            <div className="maplegend__item"><div className="lg-dot lg-dot--cert"/>Halal</div>
            <div className="maplegend__item"><div className="lg-dot lg-dot--friendly"/>Friendly</div>
            <div className="maplegend__item"><div className="lg-dot lg-dot--unsure"/>Unverified</div>
          </div>
        </div>
      </div>

      {showAdd && <AddPlaceModal onClose={() => setShowAdd(false)}/>}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
