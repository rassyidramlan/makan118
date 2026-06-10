const { useEffect, useState, useRef, useCallback, useMemo } = React;

// ── Distance Matrix ────────────────────────────────────────────────────────

function fetchTravel(destination) {
  return new Promise(function(resolve) {
    var svc     = new google.maps.DistanceMatrixService();
    var results = {};
    var done    = 0;
    var finish  = function() { if (++done === 3) resolve(results); };
    [
      ['walk',    google.maps.TravelMode.WALKING],
      ['drive',   google.maps.TravelMode.DRIVING],
      ['transit', google.maps.TravelMode.TRANSIT],
    ].forEach(function(pair) {
      var key  = pair[0];
      var mode = pair[1];
      svc.getDistanceMatrix({
        origins:      [window.CONFIG.MERDEKA118],
        destinations: [destination],
        travelMode:   mode,
      }, function(res, status) {
        if (status === 'OK') {
          var el = res.rows[0] && res.rows[0].elements[0];
          if (el && el.status === 'OK') results[key] = el;
        }
        finish();
      });
    });
  });
}

// ── Google Maps ────────────────────────────────────────────────────────────

var gMap        = null;
var gMarkers    = [];
var gInfoWindow = null;

var MAP_STYLES = [
  { featureType:'poi',              stylers:[{visibility:'off'}] },
  { featureType:'poi.park',         stylers:[{visibility:'simplified'}] },
  { featureType:'transit.station',  stylers:[{visibility:'simplified'}] },
  { featureType:'road',             elementType:'geometry', stylers:[{color:'#f0f0eb'}] },
  { featureType:'road.arterial',    elementType:'geometry', stylers:[{color:'#e8e8e0'}] },
  { featureType:'road.highway',     elementType:'geometry', stylers:[{color:'#ddddd5'}] },
  { featureType:'water',            elementType:'geometry', stylers:[{color:'#c5dfe0'}] },
  { featureType:'landscape',        elementType:'geometry', stylers:[{color:'#f5f5f0'}] },
  { elementType:'labels.text.fill', stylers:[{color:'#6E7873'}] },
];

function initGoogleMap() {
  gMap = new google.maps.Map(document.getElementById('map'), {
    center:            window.CONFIG.MERDEKA118,
    zoom:              15,
    mapTypeControl:    false,
    streetViewControl: true,
    fullscreenControl: false,
    styles:            MAP_STYLES,
  });
  gInfoWindow = new google.maps.InfoWindow();

  // Merdeka 118 pin
  new google.maps.Marker({
    map:      gMap,
    position: window.CONFIG.MERDEKA118,
    title:    'Menara Merdeka 118',
    icon: {
      path:         google.maps.SymbolPath.CIRCLE,
      scale:        13,
      fillColor:    '#1C2420',
      fillOpacity:  1,
      strokeColor:  '#ffffff',
      strokeWeight: 3,
    },
    zIndex: 999,
    label: { text:'118', color:'#ffffff', fontSize:'9px', fontWeight:'700' },
  });
}

function updateMarkers(places, selectedId, onSelect) {
  gMarkers.forEach(function(m){ m.setMap(null); });
  gMarkers = [];
  places.forEach(function(p) {
    var score      = window.halalScore(p);
    var isSelected = p.place_id === selectedId;
    var fillColor  = isSelected ? '#E0892F'
      : score === 'cert'     ? '#2E7D5B'
      : score === 'friendly' ? '#E0892F'
      : '#C0504D';

    var marker = new google.maps.Marker({
      map:      gMap,
      position: p.geometry.location,
      title:    p.name,
      icon: {
        path:         google.maps.SymbolPath.CIRCLE,
        scale:        isSelected ? 11 : 7,
        fillColor:    fillColor,
        fillOpacity:  1,
        strokeColor:  '#ffffff',
        strokeWeight: isSelected ? 2.5 : 1.5,
      },
      zIndex: isSelected ? 100 : 1,
    });
    marker.addListener('click', function() {
      gInfoWindow.setContent(
        '<div style="font-family:\'Plus Jakarta Sans\',sans-serif;padding:3px 2px;max-width:200px;">' +
        '<strong style="font-size:13px;">' + p.name + '</strong><br>' +
        '<span style="font-size:11px;color:#6E7873;">' + (p.vicinity||'') + '</span>' +
        (p.rating ? '<br><span style="font-size:11px;">⭐ ' + p.rating + '</span>' : '') +
        '</div>'
      );
      gInfoWindow.open(gMap, marker);
      onSelect(p);
    });
    gMarkers.push(marker);
  });
}

// ── Multi-search to maximise results ──────────────────────────────────────
// Google Places nearbySearch returns max 60 results (3 pages of 20).
// We run multiple keyword searches and merge to get comprehensive coverage.

var KEYWORD_SEARCHES = [
  'restaurant', 'cafe', 'kopitiam', 'mamak', 'food court',
  'bakery', 'nasi lemak', 'mee', 'western food', 'japanese food',
  'korean food', 'indian food', 'fast food', 'chinese restaurant', 'halal'
];

function runPagedSearch(service, request, allResults, resolve) {
  service.nearbySearch(request, function(results, status, pagination) {
    if (status === google.maps.places.PlacesServiceStatus.OK && results) {
      results.forEach(function(r) {
        if (!allResults.find(function(e){ return e.place_id === r.place_id; })) {
          allResults.push(r);
        }
      });
    }
    // Fetch next page if available (up to 3 pages = 60 results per keyword)
    if (pagination && pagination.hasNextPage) {
      setTimeout(function(){ pagination.nextPage(); }, 300);
    } else {
      resolve(allResults);
    }
  });
}

function searchAllKeywords(service, radius, onProgress) {
  var allPlaces = [];
  var remaining = KEYWORD_SEARCHES.length;

  return new Promise(function(resolve) {
    if (remaining === 0) { resolve([]); return; }

    KEYWORD_SEARCHES.forEach(function(keyword) {
      var localResults = [];
      var request = {
        location: window.CONFIG.MERDEKA118,
        radius:   radius,
        keyword:  keyword,
        type:     'food',
      };
      runPagedSearch(service, request, localResults, function(kResults) {
        kResults.forEach(function(r) {
          if (!allPlaces.find(function(e){ return e.place_id === r.place_id; })) {
            allPlaces.push(r);
          }
        });
        remaining--;
        if (onProgress) onProgress(allPlaces.length);
        if (remaining === 0) resolve(allPlaces);
      });
    });
  });
}

// ── Filter constants ───────────────────────────────────────────────────────

var CUISINE_CHIPS = [
  'All',
  'Malay / Nasi',
  'Mamak / Nasi Kandar',
  'Indian',
  'Chinese (halal)',
  'Western',
  'Middle Eastern',
  'Japanese / Korean',
  'Cafe / Brunch',
  'Quick bites',
];

var CUISINE_KEYWORDS = {
  'Malay / Nasi':        ['nasi','malay','melayu','rendang','lemak','padang','campur'],
  'Mamak / Nasi Kandar': ['mamak','kandar','roti canai','teh tarik','murtabak'],
  'Indian':              ['indian','briyani','biryani','tandoor','curry','dosai','chapati'],
  'Chinese (halal)':     ['chinese','dim sum','wonton','chow','fried rice'],
  'Western':             ['western','burger','steak','pasta','pizza','sandwich'],
  'Middle Eastern':      ['arabic','middle east','kebab','shawarma','turkish','lebanese'],
  'Japanese / Korean':   ['japanese','korean','sushi','ramen','bento','bbq','bulgogi'],
  'Cafe / Brunch':       ['cafe','coffee','brunch','bakery','pastry','waffle','toast'],
  'Quick bites':         ['fast food','takeaway','snack','kiosk','chicken rice','economy'],
};

var TRAVEL_MODES = ['walk','transit','drive'];
var TRAVEL_LABELS = { walk:'Walk', transit:'Transit', drive:'Drive' };
var TRAVEL_ICONS  = { walk:'🚶', transit:'🚇', drive:'🚗' };

var HALAL_FILTER_OPTS = [
  { value:'all',      label:'All'             },
  { value:'cert',     label:'Certified'       },
  { value:'friendly', label:'Muslim-friendly' },
  { value:'unsure',   label:'Unverified'      },
];

var SORT_OPTS = [
  { value:'rating',  label:'Top rated'    },
  { value:'reviews', label:'Most reviews' },
  { value:'halal',   label:'Halal first'  },
];

// ── App ────────────────────────────────────────────────────────────────────

function App() {
  const [places,       setPlaces]       = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [loadCount,    setLoadCount]    = useState(0);
  const [cuisine,      setCuisine]      = useState('All');
  const [travelMode,   setTravelMode]   = useState('walk');
  const [halalFilter,  setHalalFilter]  = useState('all');
  const [sortBy,       setSortBy]       = useState('rating');
  const [radius,       setRadius]       = useState(window.CONFIG.DEFAULT_RADIUS);
  const [radiusDisp,   setRadiusDisp]   = useState(window.CONFIG.DEFAULT_RADIUS);
  const [selected,     setSelected]     = useState(null);
  const [details,      setDetails]      = useState(null);
  const [travelMap,    setTravelMap]    = useState({});
  const [detailTravel, setDetailTravel] = useState(null);
  const [mobileView,   setMobileView]   = useState('list');

  const serviceRef  = useRef(null);
  const mapReadyRef = useRef(false);

  // ── Init ─────────────────────────────────────────────────────────────
  useEffect(() => {
    initGoogleMap();
    serviceRef.current = new google.maps.places.PlacesService(gMap);
    mapReadyRef.current = true;
    loadAllPlaces(window.CONFIG.DEFAULT_RADIUS);
  }, []);

  // ── Load all places via multi-keyword search ──────────────────────────
  const loadAllPlaces = useCallback((r) => {
    setLoading(true);
    setLoadCount(0);
    setSelected(null);
    setDetails(null);
    searchAllKeywords(
      serviceRef.current,
      r,
      function(n){ setLoadCount(n); }
    ).then(function(all) {
      setPlaces(all);
      setLoading(false);
    });
  }, []);

  // Re-search when radius committed
  const handleRadiusCommit = (val) => {
    setRadius(val);
    loadAllPlaces(val);
  };

  // ── Select place ──────────────────────────────────────────────────────
  const handleSelect = useCallback((place) => {
    setSelected(place);
    setDetails(null);
    setDetailTravel(null);
    setMobileView('list');

    if (gMap) {
      gMap.panTo(place.geometry.location);
      gMap.setZoom(17);
    }

    serviceRef.current.getDetails({
      placeId: place.place_id,
      fields: ['name','formatted_address','formatted_phone_number','website',
               'opening_hours','photos','price_level','rating','user_ratings_total'],
    }, function(res, status) {
      if (status === google.maps.places.PlacesServiceStatus.OK) setDetails(res);
    });

    if (travelMap[place.place_id]) {
      setDetailTravel(travelMap[place.place_id]);
    } else {
      fetchTravel(place.geometry.location).then(function(t) {
        setDetailTravel(t);
        setTravelMap(function(prev) {
          var next = Object.assign({}, prev);
          next[place.place_id] = t;
          return next;
        });
      });
    }
  }, [travelMap]);

  // ── Derived filtered + sorted list ────────────────────────────────────
  const displayPlaces = useMemo(() => {
    var list = places.slice();

    // Cuisine filter
    if (cuisine !== 'All') {
      var kws = CUISINE_KEYWORDS[cuisine] || [];
      list = list.filter(function(p) {
        var hay = ((p.name||'') + ' ' + (p.vicinity||'') + ' ' +
                   (Array.isArray(p.types)?p.types.join(' '):'')).toLowerCase();
        return kws.some(function(k){ return hay.indexOf(k) > -1; });
      });
    }

    // Halal filter
    if (halalFilter !== 'all') {
      list = list.filter(function(p){ return window.halalScore(p) === halalFilter; });
    }

    // Travel mode filter — if walk selected, cap at 2km; transit 5km; drive all
    if (travelMode === 'walk') {
      list = list.filter(function(p) {
        var t = travelMap[p.place_id];
        if (t && t.walk && t.walk.distance) return t.walk.distance.value <= 2000;
        return true; // include if not yet fetched
      });
    }

    // Sort
    list.sort(function(a, b) {
      if (sortBy === 'rating')  return (b.rating||0) - (a.rating||0);
      if (sortBy === 'reviews') return (b.user_ratings_total||0) - (a.user_ratings_total||0);
      if (sortBy === 'halal') {
        var r = {cert:0,friendly:1,unsure:2};
        return r[window.halalScore(a)] - r[window.halalScore(b)];
      }
      return 0;
    });

    return list;
  }, [places, cuisine, halalFilter, travelMode, sortBy, travelMap]);

  // ── Update markers ────────────────────────────────────────────────────
  useEffect(() => {
    if (mapReadyRef.current) updateMarkers(displayPlaces, selected && selected.place_id, handleSelect);
  }, [displayPlaces, selected, handleSelect]);

  const radiusLabel = radiusDisp >= 1000 ? (radiusDisp/1000).toFixed(1)+' km' : radiusDisp+' m';
  const sortLabel   = (SORT_OPTS.find(function(o){return o.value===sortBy;})||{}).label;

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className={`app view-${mobileView}`}>

      {/* Topbar */}
      <div className="topbar">
        <div className="brand">
          <div className="brand__mark">Makan<span className="brand__at">@118</span></div>
          <div className="brand__sub">Halal makan near Merdeka 118</div>
        </div>
        <div className="loc">
          <div className="loc__dot"/>
          <div>
            <div className="loc__label">Your location</div>
            <div className="loc__name">Menara Merdeka 118</div>
          </div>
        </div>
        <div className="topbar__spacer"/>
        <div className="count-pill">
          {loading ? (loadCount > 0 ? loadCount + '+ found…' : 'searching…') : displayPlaces.length + ' places'}
        </div>
      </div>

      {/* Filters */}
      <div className="filters">
        {/* Cuisine chips */}
        <div className="filters__row">
          {CUISINE_CHIPS.map(function(c) {
            return (
              <button key={c} className={`chip${cuisine===c?' chip--on':''}`} onClick={() => setCuisine(c)}>
                {c}
              </button>
            );
          })}
        </div>

        {/* Controls row */}
        <div className="filters__meta">

          {/* Getting there */}
          <div className="ctrl">
            <div className="ctrl__label">Getting there</div>
            <div className="seg">
              {TRAVEL_MODES.map(function(m) {
                return (
                  <button key={m} className={`seg__btn${travelMode===m?' seg__btn--on':''}`}
                    onClick={() => setTravelMode(m)}>
                    {TRAVEL_ICONS[m]} {TRAVEL_LABELS[m]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Halal status */}
          <div className="ctrl">
            <div className="ctrl__label">Halal status</div>
            <div className="seg">
              {HALAL_FILTER_OPTS.map(function(o) {
                return (
                  <button key={o.value} className={`seg__btn${halalFilter===o.value?' seg__btn--on':''}`}
                    onClick={() => setHalalFilter(o.value)}>
                    {o.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Radius */}
          <div className="ctrl ctrl--dist">
            <div className="ctrl__label">Within <strong>{radiusLabel}</strong></div>
            <input className="range" type="range" min="500" max="10000" step="500"
              value={radiusDisp}
              onChange={e => setRadiusDisp(Number(e.target.value))}
              onMouseUp={e  => handleRadiusCommit(Number(e.target.value))}
              onTouchEnd={e => handleRadiusCommit(Number(e.target.value))}
            />
          </div>

        </div>
      </div>

      {/* Mobile tabs */}
      <div className="vtabs">
        <button className={`vtab${mobileView==='list'?' vtab--on':''}`} onClick={() => setMobileView('list')}>🍽 List</button>
        <button className={`vtab${mobileView==='map'?' vtab--on':''}`}  onClick={() => setMobileView('map')}>🗺 Map</button>
      </div>

      {/* Stage */}
      <div className="stage">

        {/* Panel */}
        <div className="panel">
          {selected ? (
            <DetailPanel
              place={selected}
              details={details}
              travel={detailTravel}
              onClose={() => {
                setSelected(null);
                setDetails(null);
                if (gMap) { gMap.panTo(window.CONFIG.MERDEKA118); gMap.setZoom(15); }
              }}
            />
          ) : (
            <div className="list">
              <div className="listhead">
                <span className="listhead__count">
                  {loading
                    ? (loadCount > 0 ? 'Found ' + loadCount + ' so far…' : 'Searching all restaurants…')
                    : displayPlaces.length + ' places found'}
                </span>
                <span className="listhead__sort">↕ {sortLabel}</span>
              </div>

              <div className="verify">
                <div className="verify__dot"/>
                Halal status is estimated from place names. Always verify with the restaurant for certified halal.
              </div>

              {/* Sort chips */}
              <div style={{display:'flex',gap:'6px',marginBottom:'12px',flexWrap:'wrap'}}>
                {SORT_OPTS.map(function(o) {
                  return (
                    <button key={o.value} className={`chip${sortBy===o.value?' chip--on':''}`}
                      style={{padding:'4px 11px',fontSize:'11.5px'}}
                      onClick={() => setSortBy(o.value)}>
                      {o.label}
                    </button>
                  );
                })}
              </div>

              {loading && (
                <div className="spinner-wrap">
                  <div className="spinner"/>
                  <span>Searching all eateries near Merdeka 118…</span>
                  {loadCount > 0 && (
                    <span style={{fontFamily:'var(--font-mono)',fontSize:'12px',color:'var(--primary)'}}>
                      {loadCount} places found so far
                    </span>
                  )}
                </div>
              )}

              {!loading && displayPlaces.length === 0 && (
                <div className="empty">
                  <div className="empty__h">No places found</div>
                  <div className="empty__p">Try a different filter, halal setting, or increase the radius</div>
                </div>
              )}

              {displayPlaces.map(function(p) {
                return (
                  <PlaceCard
                    key={p.place_id}
                    place={p}
                    selected={selected && selected.place_id === p.place_id}
                    travel={travelMap[p.place_id] || null}
                    travelMode={travelMode}
                    onSelect={handleSelect}
                  />
                );
              })}

              {!loading && displayPlaces.length > 0 && (
                <div className="loading-more">
                  {places.length} total places loaded · showing {displayPlaces.length}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Map */}
        <div className="mapwrap">
          <div id="map" className="map"/>
          <div className="maplegend">
            <div className="maplegend__item"><div className="lg-dot lg-dot--cert"/>Halal</div>
            <div className="maplegend__item"><div className="lg-dot lg-dot--friendly"/>Friendly</div>
            <div className="maplegend__item"><div className="lg-dot lg-dot--unsure"/>Unverified</div>
          </div>
        </div>

      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
