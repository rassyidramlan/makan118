const { useEffect, useState, useRef, useCallback, useMemo } = React;

// ── Travel time fetcher (Distance Matrix) ─────────────────────────────────

function fetchTravel(destination) {
  return new Promise(resolve => {
    const svc = new google.maps.DistanceMatrixService();
    const origin = window.CONFIG.MERDEKA118;
    const dest   = destination;

    // fire walking + driving in parallel
    const results = {};
    let done = 0;
    const finish = () => { if (++done === 3) resolve(results); };

    const modes = [
      ['walk',    google.maps.TravelMode.WALKING],
      ['drive',   google.maps.TravelMode.DRIVING],
      ['transit', google.maps.TravelMode.TRANSIT],
    ];

    modes.forEach(([key, mode]) => {
      svc.getDistanceMatrix({
        origins: [origin],
        destinations: [dest],
        travelMode: mode,
      }, (res, status) => {
        if (status === 'OK') {
          const row = res.rows[0]?.elements[0];
          if (row?.status === 'OK') results[key] = row;
        }
        finish();
      });
    });
  });
}

// ── Map markers manager ───────────────────────────────────────────────────

let gMap      = null;
let markers   = [];
let infoWin   = null;

function clearMarkers() {
  markers.forEach(m => m.setMap(null));
  markers = [];
}

function addMarkers(places, selectedId, onSelect) {
  clearMarkers();
  places.forEach(p => {
    const isSelected = p.place_id === selectedId;
    const marker = new google.maps.Marker({
      map: gMap,
      position: p.geometry.location,
      title: p.name,
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: isSelected ? 10 : 7,
        fillColor: isSelected ? '#ff6b35' : '#ffb347',
        fillOpacity: 1,
        strokeColor: '#0f1117',
        strokeWeight: 2,
      },
    });
    marker.addListener('click', () => onSelect(p));
    markers.push(marker);
  });
}

// ── Main App ──────────────────────────────────────────────────────────────

function App() {
  const [places,       setPlaces]       = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [query,        setQuery]        = useState('');
  const [activeFilter, setActiveFilter] = useState('All');
  const [halalOnly,    setHalalOnly]    = useState(false);
  const [mallOnly,     setMallOnly]     = useState(false);
  const [sortBy,       setSortBy]       = useState('rating');
  const [selected,     setSelected]     = useState(null);
  const [details,      setDetails]      = useState(null);
  const [travelMap,    setTravelMap]    = useState({}); // place_id -> travel data
  const [detailTravel, setDetailTravel] = useState(null);

  const serviceRef = useRef(null);

  // ── Init map ──────────────────────────────────────────────────────────

  useEffect(() => {
    gMap = new google.maps.Map(document.getElementById('map'), {
      center:    window.CONFIG.MERDEKA118,
      zoom:      15,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      styles: [
        { elementType: 'geometry',        stylers: [{ color: '#1a1d27' }] },
        { elementType: 'labels.text.fill',stylers: [{ color: '#7c8098' }] },
        { elementType: 'labels.text.stroke',stylers:[{ color:'#0f1117' }] },
        { featureType: 'road',            elementType: 'geometry', stylers: [{ color: '#2d3148' }] },
        { featureType: 'road.arterial',   elementType: 'geometry', stylers: [{ color: '#393d58' }] },
        { featureType: 'water',           elementType: 'geometry', stylers: [{ color: '#0d1117' }] },
        { featureType: 'poi',             stylers: [{ visibility: 'off' }] },
        { featureType: 'transit',         elementType: 'geometry', stylers: [{ color: '#22263a' }] },
      ],
    });

    // Merdeka 118 marker
    new google.maps.Marker({
      map: gMap,
      position: window.CONFIG.MERDEKA118,
      title: 'Merdeka 118',
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 12,
        fillColor: '#6366f1',
        fillOpacity: 1,
        strokeColor: '#fff',
        strokeWeight: 2,
      },
      zIndex: 999,
    });

    infoWin = new google.maps.InfoWindow();
    serviceRef.current = new google.maps.places.PlacesService(gMap);
    doSearch('restaurant', false);
  }, []);

  // ── Places search ─────────────────────────────────────────────────────

  const doSearch = useCallback((keyword, keepExisting) => {
    setLoading(true);
    serviceRef.current.nearbySearch({
      location: window.CONFIG.MERDEKA118,
      radius:   window.CONFIG.SEARCH_RADIUS,
      keyword:  keyword || undefined,
      type:     'restaurant',
    }, (results, status) => {
      setLoading(false);
      if (status === google.maps.places.PlacesServiceStatus.OK) {
        const final = keepExisting
          ? (prev) => [...prev, ...results.filter(r => !prev.find(p => p.place_id === r.place_id))]
          : results;
        setPlaces(typeof final === 'function' ? [] : results);
        if (typeof final === 'function') setPlaces(final);
      } else {
        if (!keepExisting) setPlaces([]);
      }
    });
  }, []);

  const handleSearch = useCallback(() => {
    const q = query.trim();
    doSearch(q || 'restaurant', false);
  }, [query, doSearch]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSearch();
  };

  // ── Filter chips ──────────────────────────────────────────────────────

  const FILTERS = ['All', 'Mamak', 'Cafe', 'Fast Food', 'Western', 'Japanese', 'Korean'];

  const handleFilter = (f) => {
    setActiveFilter(f);
    if (f === 'All') { doSearch('restaurant', false); return; }
    doSearch(f.toLowerCase(), false);
  };

  // ── Select place → fetch details + travel ─────────────────────────────

  const handleSelect = useCallback((place) => {
    setSelected(place);
    setDetails(null);
    setDetailTravel(null);

    // pan map
    if (gMap && place.geometry?.location) {
      gMap.panTo(place.geometry.location);
    }

    // fetch detail
    serviceRef.current.getDetails({
      placeId: place.place_id,
      fields:  ['name','formatted_address','formatted_phone_number','website',
                'opening_hours','photos','price_level','rating','user_ratings_total'],
    }, (res, status) => {
      if (status === google.maps.places.PlacesServiceStatus.OK) {
        setDetails(res);
      }
    });

    // fetch travel (cache per place)
    if (travelMap[place.place_id]) {
      setDetailTravel(travelMap[place.place_id]);
    } else {
      fetchTravel(place.geometry.location).then(t => {
        setDetailTravel(t);
        setTravelMap(prev => ({ ...prev, [place.place_id]: t }));
      });
    }
  }, [travelMap]);

  // ── Derived list (filter + sort) ──────────────────────────────────────

  const displayPlaces = useMemo(() => {
    let list = [...places];

    if (halalOnly)   list = list.filter(p => window.halalScore(p) === 'likely');
    if (mallOnly)    list = list.filter(p => window.isMall(p));

    list.sort((a, b) => {
      if (sortBy === 'rating')   return (b.rating || 0) - (a.rating || 0);
      if (sortBy === 'reviews')  return (b.user_ratings_total || 0) - (a.user_ratings_total || 0);
      if (sortBy === 'halal') {
        const rank = { likely: 0, check: 1, unsure: 2 };
        return rank[window.halalScore(a)] - rank[window.halalScore(b)];
      }
      return 0;
    });

    return list;
  }, [places, halalOnly, mallOnly, sortBy]);

  // ── Update map markers when list or selection changes ─────────────────

  useEffect(() => {
    if (gMap) addMarkers(displayPlaces, selected?.place_id, handleSelect);
  }, [displayPlaces, selected, handleSelect]);

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column' }}>

      {/* Header */}
      <div id="header">
        <h1>Makan<span>@118</span></h1>
        <div className="sub">
          {loading ? 'searching…' : `${displayPlaces.length} places · ${window.CONFIG.SEARCH_RADIUS/1000} km radius`}
        </div>
      </div>

      {/* Search */}
      <div id="search-row">
        <input
          type="text"
          placeholder="Search food, cuisine, restaurant…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button onClick={handleSearch}>Search</button>
      </div>

      {/* Filter chips */}
      <div id="filter-row">
        {FILTERS.map(f => (
          <div
            key={f}
            className={`chip${activeFilter === f ? ' active' : ''}`}
            onClick={() => handleFilter(f)}
          >{f}</div>
        ))}
        <div
          className={`chip halal-chip${halalOnly ? ' active' : ''}`}
          onClick={() => setHalalOnly(v => !v)}
        >Halal Only</div>
        <div
          className={`chip${mallOnly ? ' active' : ''}`}
          onClick={() => setMallOnly(v => !v)}
        >🏬 Mall</div>
      </div>

      {/* Sort row */}
      <div id="sort-row">
        <span className="label">Sort</span>
        <select value={sortBy} onChange={e => setSortBy(e.target.value)}>
          <option value="rating">Top Rated</option>
          <option value="reviews">Most Reviews</option>
          <option value="halal">Halal First</option>
        </select>
        <span className="count">{displayPlaces.length} results</span>
      </div>

      {/* List */}
      <div id="list">
        {loading && (
          <div className="state-msg">
            <div className="spinner" />
            <span>Finding places near Merdeka 118…</span>
          </div>
        )}
        {!loading && displayPlaces.length === 0 && (
          <div className="state-msg">
            <span>😶 No places found</span>
            <span style={{fontSize:'11px'}}>Try a different search or filter</span>
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

      {/* Detail panel */}
      {selected && (
        <DetailPanel
          place={selected}
          details={details}
          travel={detailTravel}
          onClose={() => { setSelected(null); setDetails(null); }}
        />
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
