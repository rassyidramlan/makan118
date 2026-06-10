const { useEffect, useState, useRef, useCallback, useMemo } = React;

// ── Distance Matrix helper ─────────────────────────────────────────────────

function fetchTravel(destination) {
  return new Promise(resolve => {
    const svc = new google.maps.DistanceMatrixService();
    const results = {};
    let done = 0;
    const finish = () => { if (++done === 3) resolve(results); };
    [
      ['walk',    google.maps.TravelMode.WALKING],
      ['drive',   google.maps.TravelMode.DRIVING],
      ['transit', google.maps.TravelMode.TRANSIT],
    ].forEach(([key, mode]) => {
      svc.getDistanceMatrix({
        origins:      [window.CONFIG.MERDEKA118],
        destinations: [destination],
        travelMode:   mode,
      }, (res, status) => {
        if (status === 'OK') {
          const el = res.rows[0]?.elements[0];
          if (el?.status === 'OK') results[key] = el;
        }
        finish();
      });
    });
  });
}

// ── Google Maps manager ────────────────────────────────────────────────────

let gMap        = null;
let gMarkers    = [];
let gInfoWindow = null;

// Custom map style — light, clean, matches the green UI
const MAP_STYLES = [
  { featureType:'poi',             stylers:[{ visibility:'off' }] },
  { featureType:'poi.park',        stylers:[{ visibility:'simplified' }] },
  { featureType:'transit.station', stylers:[{ visibility:'simplified' }] },
  { featureType:'road',            elementType:'geometry', stylers:[{ color:'#f5f5f0' }] },
  { featureType:'road.arterial',   elementType:'geometry', stylers:[{ color:'#ebebE4' }] },
  { featureType:'road.highway',    elementType:'geometry', stylers:[{ color:'#e0ddd5' }] },
  { featureType:'water',           elementType:'geometry', stylers:[{ color:'#c9e4e0' }] },
  { featureType:'landscape',       elementType:'geometry', stylers:[{ color:'#f8f8f3' }] },
  { elementType:'labels.text.fill',stylers:[{ color:'#6E7873' }] },
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

  // Merdeka 118 origin pin
  new google.maps.Marker({
    map:      gMap,
    position: window.CONFIG.MERDEKA118,
    title:    'Merdeka 118',
    icon: {
      path:        google.maps.SymbolPath.CIRCLE,
      scale:       14,
      fillColor:   '#1C2420',
      fillOpacity: 1,
      strokeColor: '#ffffff',
      strokeWeight: 3,
    },
    zIndex: 999,
    label: {
      text:      '118',
      color:     '#ffffff',
      fontSize:  '10px',
      fontWeight:'700',
    },
  });
}

function updateMarkers(places, selectedId, onSelect) {
  gMarkers.forEach(m => m.setMap(null));
  gMarkers = [];

  places.forEach(p => {
    const score     = window.halalScore(p);
    const isSelected = p.place_id === selectedId;
    const fillColor  = isSelected
      ? '#E0892F'
      : score === 'cert'     ? '#2E7D5B'
      : score === 'friendly' ? '#E0892F'
      : '#9A2C2C';

    const marker = new google.maps.Marker({
      map:      gMap,
      position: p.geometry.location,
      title:    p.name,
      icon: {
        path:         google.maps.SymbolPath.CIRCLE,
        scale:        isSelected ? 11 : 8,
        fillColor:    fillColor,
        fillOpacity:  1,
        strokeColor:  '#ffffff',
        strokeWeight: 2,
      },
      zIndex: isSelected ? 100 : 1,
    });

    marker.addListener('click', () => {
      gInfoWindow.setContent(
        `<div style="font-family:'Plus Jakarta Sans',sans-serif;padding:4px 2px;">
          <strong style="font-size:13px;">${p.name}</strong><br>
          <span style="font-size:11px;color:#6E7873;">${p.vicinity || ''}</span>
          ${p.rating ? `<br><span style="font-size:11px;">⭐ ${p.rating}</span>` : ''}
        </div>`
      );
      gInfoWindow.open(gMap, marker);
      onSelect(p);
    });

    gMarkers.push(marker);
  });
}

// ── App ────────────────────────────────────────────────────────────────────

const FILTERS  = ['All','Mamak','Cafe','Fast Food','Western','Japanese','Korean','Halal Only'];
const SORT_OPTS = [
  { value:'rating',   label:'Top rated'     },
  { value:'reviews',  label:'Most reviews'  },
  { value:'halal',    label:'Halal first'   },
];

function App() {
  const [ready,        setReady]        = useState(false);
  const [places,       setPlaces]       = useState([]);
  const [loading,      setLoading]      = useState(false);
  const [activeChip,   setActiveChip]   = useState('All');
  const [sortBy,       setSortBy]       = useState('rating');
  const [radius,       setRadius]       = useState(window.CONFIG.SEARCH_RADIUS);
  const [radiusDisplay,setRadiusDisplay]= useState(window.CONFIG.SEARCH_RADIUS);
  const [selected,     setSelected]     = useState(null);
  const [details,      setDetails]      = useState(null);
  const [travelMap,    setTravelMap]    = useState({});
  const [detailTravel, setDetailTravel] = useState(null);
  const [mobileView,   setMobileView]   = useState('list');

  const serviceRef = useRef(null);
  const mapReadyRef = useRef(false);

  // ── Wait for Google Maps API callback ─────────────────────────────────
  useEffect(() => {
    window.initMap = () => setReady(true);
    // If already loaded (cached)
    if (window.google?.maps) setReady(true);
  }, []);

  // ── Init map + first search once API is ready ──────────────────────────
  useEffect(() => {
    if (!ready) return;
    initGoogleMap();
    serviceRef.current = new google.maps.places.PlacesService(gMap);
    mapReadyRef.current = true;
    doSearch('restaurant');
  }, [ready]);

  // ── Places search ──────────────────────────────────────────────────────
  const doSearch = useCallback((keyword) => {
    if (!serviceRef.current) return;
    setLoading(true);
    setSelected(null);
    setDetails(null);
    serviceRef.current.nearbySearch({
      location: window.CONFIG.MERDEKA118,
      radius:   radius,
      keyword:  keyword !== 'restaurant' ? keyword : undefined,
      type:     'restaurant',
    }, (results, status) => {
      setLoading(false);
      setPlaces(status === google.maps.places.PlacesServiceStatus.OK ? results : []);
    });
  }, [radius]);

  const triggerSearch = useCallback((chip, currentRadius) => {
    if (!serviceRef.current) return;
    setLoading(true);
    setSelected(null);
    setDetails(null);
    const keyword = (chip === 'All' || chip === 'Halal Only') ? undefined : chip.toLowerCase();
    serviceRef.current.nearbySearch({
      location: window.CONFIG.MERDEKA118,
      radius:   currentRadius,
      keyword:  keyword,
      type:     'restaurant',
    }, (results, status) => {
      setLoading(false);
      setPlaces(status === google.maps.places.PlacesServiceStatus.OK ? results : []);
    });
  }, []);

  // ── Chip filter ────────────────────────────────────────────────────────
  const handleChip = (chip) => {
    setActiveChip(chip);
    triggerSearch(chip, radius);
  };

  // ── Radius slider ──────────────────────────────────────────────────────
  const handleRadiusCommit = (val) => {
    setRadius(val);
    triggerSearch(activeChip, val);
  };

  // ── Select place ───────────────────────────────────────────────────────
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
      fields:  ['name','formatted_address','formatted_phone_number','website',
                'opening_hours','photos','price_level','rating','user_ratings_total'],
    }, (res, status) => {
      if (status === google.maps.places.PlacesServiceStatus.OK) setDetails(res);
    });

    if (travelMap[place.place_id]) {
      setDetailTravel(travelMap[place.place_id]);
    } else {
      fetchTravel(place.geometry.location).then(t => {
        setDetailTravel(t);
        setTravelMap(prev => ({ ...prev, [place.place_id]: t }));
      });
    }
  }, [travelMap]);

  // ── Derived sorted list ────────────────────────────────────────────────
  const displayPlaces = useMemo(() => {
    let list = [...places];
    if (activeChip === 'Halal Only') list = list.filter(p => window.halalScore(p) === 'cert');
    list.sort((a, b) => {
      if (sortBy === 'rating')  return (b.rating || 0) - (a.rating || 0);
      if (sortBy === 'reviews') return (b.user_ratings_total || 0) - (a.user_ratings_total || 0);
      if (sortBy === 'halal') {
        const r = { cert:0, friendly:1, unsure:2 };
        return r[window.halalScore(a)] - r[window.halalScore(b)];
      }
      return 0;
    });
    return list;
  }, [places, activeChip, sortBy]);

  // ── Update map markers ─────────────────────────────────────────────────
  useEffect(() => {
    if (mapReadyRef.current) updateMarkers(displayPlaces, selected?.place_id, handleSelect);
  }, [displayPlaces, selected, handleSelect]);

  const sortLabel = SORT_OPTS.find(o => o.value === sortBy)?.label;
  const radiusLabel = radiusDisplay >= 1000
    ? (radiusDisplay / 1000).toFixed(1) + ' km'
    : radiusDisplay + ' m';

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className={`app view-${mobileView}`}>

      {/* Topbar */}
      <div className="topbar">
        <div className="brand">
          <div className="brand__mark">Makan<span className="brand__at">@118</span></div>
          <div className="brand__sub">Halal makan near Merdeka 118</div>
        </div>
        <div className="loc">
          <div className="loc__dot" />
          <div>
            <div className="loc__label">Origin</div>
            <div className="loc__name">Merdeka 118</div>
          </div>
        </div>
        <div className="topbar__spacer" />
        <div className="count-pill">
          {loading ? 'searching…' : `${displayPlaces.length} places`}
        </div>
      </div>

      {/* Filters */}
      <div className="filters">
        <div className="filters__chips">
          {FILTERS.map(f => (
            <button
              key={f}
              className={`chip${activeChip === f ? ' chip--on' : ''}`}
              onClick={() => handleChip(f)}
            >{f}</button>
          ))}
        </div>
        <div className="filters__controls">
          <div className="ctrl">
            <div className="ctrl__label">Sort by</div>
            <div className="seg">
              {SORT_OPTS.map(o => (
                <button
                  key={o.value}
                  className={`seg__btn${sortBy === o.value ? ' seg__btn--on' : ''}`}
                  onClick={() => setSortBy(o.value)}
                >{o.label}</button>
              ))}
            </div>
          </div>
          <div className="ctrl ctrl--dist">
            <div className="ctrl__label">
              Radius — <strong>{radiusLabel}</strong>
            </div>
            <input
              className="range"
              type="range" min="500" max="5000" step="250"
              value={radiusDisplay}
              onChange={e => setRadiusDisplay(Number(e.target.value))}
              onMouseUp={e  => handleRadiusCommit(Number(e.target.value))}
              onTouchEnd={e => handleRadiusCommit(Number(e.target.value))}
            />
          </div>
        </div>
      </div>

      {/* Mobile tabs */}
      <div className="vtabs">
        <button className={`vtab${mobileView==='list'?' vtab--on':''}`} onClick={() => setMobileView('list')}>
          🍽 List
        </button>
        <button className={`vtab${mobileView==='map'?' vtab--on':''}`} onClick={() => setMobileView('map')}>
          🗺 Map
        </button>
      </div>

      {/* Stage */}
      <div className="stage">

        {/* Panel — list or detail */}
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
                  {loading ? 'Searching…' : `${displayPlaces.length} places found`}
                </span>
                <span className="listhead__sort">↕ {sortLabel}</span>
              </div>

              <div className="verify">
                <div className="verify__dot" />
                Halal status is estimated from place names and types.
                Always verify directly with the restaurant for certified halal assurance.
              </div>

              {loading && (
                <div className="spinner-wrap">
                  <div className="spinner" />
                  <span>Finding places near Merdeka 118…</span>
                </div>
              )}

              {!loading && displayPlaces.length === 0 && (
                <div className="empty">
                  <div className="empty__h">No places found</div>
                  <div className="empty__p">Try a different filter or increase the radius</div>
                </div>
              )}

              {!loading && displayPlaces.map(p => (
                <PlaceCard
                  key={p.place_id}
                  place={p}
                  selected={selected?.place_id === p.place_id}
                  travel={travelMap[p.place_id] || null}
                  onSelect={handleSelect}
                />
              ))}
            </div>
          )}
        </div>

        {/* Map */}
        <div className="mapwrap">
          <div id="map" className="map" />
          <div className="maplegend">
            <div className="maplegend__item"><div className="lg-dot lg-dot--cert" />Halal</div>
            <div className="maplegend__item"><div className="lg-dot lg-dot--friendly" />Friendly</div>
            <div className="maplegend__item"><div className="lg-dot lg-dot--unsure" />Verify</div>
          </div>
        </div>

      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
