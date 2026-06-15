import { useDeferredValue, useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  ChevronDown,
  ExternalLink,
  House,
  Info,
  KeyRound,
  ListFilter,
  Map,
  Search,
  ShieldAlert,
  Star,
  X
} from 'lucide-react';
import { getJson } from './api.js';
import { MapView } from './components/MapView.jsx';
import { dateTimeValue, formatDate, formatRelativeDate } from './date.js';

const DEFAULT_FILTERS = {
  q: '',
  type: '',
  state: '',
  maxRating: '',
  sort: 'relevance',
  agency: '',
  suburb: '',
  listed: ''
};

export function App() {
  const [tab, setTab] = useState(readInitialTab);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [meta, setMeta] = useState(null);
  const [reviews, setReviews] = useState(null);
  const [agencies, setAgencies] = useState(null);
  const [mapPoints, setMapPoints] = useState(null);
  const [page, setPage] = useState(1);
  const [selectedReview, setSelectedReview] = useState(null);
  const [selectedAgency, setSelectedAgency] = useState(null);
  const [showAbout, setShowAbout] = useState(false);
  const [error, setError] = useState('');
  const deferredQuery = useDeferredValue(filters.q);

  useEffect(() => {
    getJson('/api/meta').then(setMeta).catch((caught) => setError(caught.message));
  }, []);

  useEffect(() => {
    window.history.replaceState(null, '', tab === 'reviews' ? '/' : `/?view=${tab}`);
  }, [tab]);

  useEffect(() => {
    if (tab !== 'reviews') return;
    let active = true;
    getJson('/api/reviews', {
      q: deferredQuery,
      type: filters.type,
      state: filters.state,
      maxRating: filters.maxRating,
      sort: filters.sort,
      agency: filters.agency,
      listed: filters.listed,
      page,
      pageSize: 24
    }).then((data) => {
      if (active) {
        setReviews(data);
        setError('');
      }
    }).catch((caught) => active && setError(caught.message));
    return () => { active = false; };
  }, [
    deferredQuery,
    filters.agency,
    filters.listed,
    filters.maxRating,
    filters.sort,
    filters.state,
    filters.type,
    page,
    tab
  ]);

  useEffect(() => {
    if (tab !== 'repeat') return;
    let active = true;
    getJson('/api/agencies', {
      q: deferredQuery,
      state: filters.state,
      sort: filters.sort === 'rating_low' ? 'rating' : 'low_ratings',
      minReviews: 2,
      limit: 100
    }).then((data) => {
      if (active) {
        setAgencies(data);
        setError('');
      }
    }).catch((caught) => active && setError(caught.message));
    return () => { active = false; };
  }, [deferredQuery, filters.sort, filters.state, tab]);

  useEffect(() => {
    if (tab !== 'map') return;
    let active = true;
    getJson('/api/map', {
      q: deferredQuery,
      type: filters.type,
      state: filters.state,
      maxRating: filters.maxRating,
      agency: filters.agency,
      limit: 700
    }).then((data) => {
      if (active) {
        setMapPoints(data);
        setError('');
      }
    }).catch((caught) => active && setError(caught.message));
    return () => { active = false; };
  }, [deferredQuery, filters.agency, filters.maxRating, filters.state, filters.type, tab]);

  const hasFilters = Object.entries(filters).some(([key, value]) => (
    !['sort', 'suburb'].includes(key) && Boolean(value)
  ));

  function updateFilter(key, value) {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
  }

  function openAgency(agencyKey) {
    setError('');
    getJson(`/api/agencies/${encodeURIComponent(agencyKey)}`)
      .then(setSelectedAgency)
      .catch((caught) => setError(caught.message));
  }

  function showAgencyReviews(agency) {
    setFilters({ ...DEFAULT_FILTERS, agency: agency.agency_key || agency.agencyKey });
    setSelectedAgency(null);
    setTab('reviews');
    setPage(1);
  }

  function showLocation(point) {
    setFilters({
      ...DEFAULT_FILTERS,
      state: point.state,
      q: point.suburb
    });
    setTab('reviews');
    setPage(1);
  }

  return (
    <div className="site-shell">
      <header className="masthead">
        <a className="wordmark" href="/" aria-label="shitrentals home">
          <span className="wordmark-mark"><House size={18} strokeWidth={2.6} /></span>
          <span className="wordmark-name">shit<em>rentals</em></span>
        </a>
        <div className="source-links">
          <button type="button" className="about-link" onClick={() => setShowAbout(true)}>
            <Info size={13} /> About
          </button>
          <a href="https://www.shitrentals.org/review/review-a-shit-rental" target="_blank" rel="noreferrer">
            Report a rental <ExternalLink size={13} />
          </a>
        </div>
      </header>

      <main>
        <section className="explorer">
          <div className="search-panel">
            <div className="search-box">
              <Search size={21} />
              <input
                value={filters.q}
                onChange={(event) => updateFilter('q', event.target.value)}
                placeholder={tab === 'repeat'
                  ? 'Search an agency name'
                  : 'Search an address, suburb, agency or review'}
                aria-label="Search reviews"
              />
              {filters.q && (
                <button className="clear-search" onClick={() => updateFilter('q', '')} aria-label="Clear search">
                  <X size={17} />
                </button>
              )}
            </div>

            <nav className="view-tabs" aria-label="Database views">
              <Tab active={tab === 'reviews'} onClick={() => setTab('reviews')} icon={ListFilter}>Reviews</Tab>
              <Tab active={tab === 'map'} onClick={() => setTab('map')} icon={Map}>Map</Tab>
              <Tab active={tab === 'repeat'} onClick={() => setTab('repeat')} icon={ShieldAlert}>Repeat agencies</Tab>
            </nav>

            <div className="filters">
              {tab !== 'repeat' && (
                <select value={filters.type} onChange={(event) => updateFilter('type', event.target.value)} aria-label="Review type">
                  <option value="">All review types</option>
                  <option value="property">Property reviews</option>
                  <option value="agency">Agency reviews</option>
                </select>
              )}
              <select value={filters.state} onChange={(event) => updateFilter('state', event.target.value)} aria-label="State">
                <option value="">All states</option>
                {meta?.states.map((state) => (
                  <option key={state.state} value={state.state}>{state.state} ({state.count})</option>
                ))}
              </select>
              {tab !== 'repeat' && (
                <select value={filters.maxRating} onChange={(event) => updateFilter('maxRating', event.target.value)} aria-label="Maximum rating">
                  <option value="">Any rating</option>
                  <option value="1">1 star only</option>
                  <option value="2">2 stars or below</option>
                  <option value="3">3 stars or below</option>
                </select>
              )}
              {tab !== 'map' && (
                <select value={filters.sort} onChange={(event) => updateFilter('sort', event.target.value)} aria-label="Sort results">
                  {tab === 'reviews' && <option value="relevance">Most relevant</option>}
                  {tab === 'reviews' && <option value="newest">Newest first</option>}
                  <option value="rating_low">Lowest rated first</option>
                  {tab === 'reviews' && <option value="rating_high">Highest rated first</option>}
                </select>
              )}
              {tab === 'reviews' && (
                <button
                  type="button"
                  className={`listed-toggle ${filters.listed ? 'active' : ''}`}
                  aria-pressed={Boolean(filters.listed)}
                  onClick={() => updateFilter('listed', filters.listed ? '' : '1')}
                  title="Show only reviewed properties currently advertised for rent"
                >
                  <KeyRound size={15} /> Currently listed
                  {meta?.listedReviews ? <span className="listed-count">{meta.listedReviews}</span> : null}
                </button>
              )}
              {hasFilters && (
                <button className="reset-button" onClick={() => {
                  setFilters(DEFAULT_FILTERS);
                  setPage(1);
                }}>
                  Reset
                </button>
              )}
            </div>
          </div>

          {filters.agency && (
            <div className="active-filter">
              Showing correlated reviews for <strong>{selectedAgency?.name || filters.agency}</strong>
              <button onClick={() => updateFilter('agency', '')}><X size={14} /> Clear</button>
            </div>
          )}

          {error && <div className="error-banner">{error}</div>}

          {tab === 'reviews' && (
            <ReviewResults
              data={reviews}
              page={page}
              setPage={setPage}
              onAgency={openAgency}
            />
          )}
          {tab === 'map' && (
            <MapResults points={mapPoints} onLocation={showLocation} />
          )}
          {tab === 'repeat' && (
            <AgencyResults agencies={agencies} onAgency={openAgency} />
          )}
        </section>
      </main>

      <footer>
        <p>
          Data last synced {formatDate(meta?.source_synced_at)}. Reviews are community submissions
          published by the upstream source.
        </p>
        <a href="https://www.shitrentals.org/database/search-a-shit-rental" target="_blank" rel="noreferrer">
          View original database <ExternalLink size={13} />
        </a>
      </footer>

      {selectedReview && (
        <ReviewDrawer
          review={selectedReview}
          onClose={() => setSelectedReview(null)}
          onAgency={(agencyKey) => {
            setSelectedReview(null);
            openAgency(agencyKey);
          }}
        />
      )}
      {selectedAgency && (
        <AgencyDrawer
          agency={selectedAgency}
          onClose={() => setSelectedAgency(null)}
          onReview={setSelectedReview}
          onShowAll={showAgencyReviews}
        />
      )}
      {showAbout && <AboutDrawer onClose={() => setShowAbout(false)} />}
    </div>
  );
}

function AboutDrawer({ onClose }) {
  return (
    <Drawer onClose={onClose}>
      <span className="kicker">About shitrentals</span>
      <h2>Giving power back to renters</h2>
      <div className="about-body">
        <p>
          As a renter, landlords and real estate agents have access to so much information about you,
          but you don't get that same level of transparency from them.
        </p>
        <p>
          Real estate agents often provide photos of properties that are years out of date, and don't
          tell you what it's like to actually live there. You don't get to enter into a new rental
          knowing how difficult it might be for you to request basic repairs to be completed.
        </p>
        <h3>This website is here to help.</h3>
        <p>
          It will always be free, and there will be no ability for landlords or real estate agents to
          pay for reviews to be removed.
        </p>
        <p>
          Do your part to help your fellow renters by writing an anonymous review of your rental
          property or real estate agency.
        </p>
        <p>
          At this stage, I'll be reviewing each submission each night and uploading the submissions to
          the page, so if you don't see your review immediately, don't stress!
        </p>
      </div>
      <div className="about-links">
        <a href="https://lonelykidsclub.com/collections/purplepingers" target="_blank" rel="noreferrer">
          Merch <ExternalLink size={13} />
        </a>
        <a href="https://www.paypal.com/paypalme/ptylt" target="_blank" rel="noreferrer">
          Donate <ExternalLink size={13} />
        </a>
        <a href="https://www.shitrentals.org/supporters" target="_blank" rel="noreferrer">
          Support <ExternalLink size={13} />
        </a>
        <a href="https://github.com/crnst8/shitrentals" target="_blank" rel="noreferrer">
          GitHub <ExternalLink size={13} />
        </a>
      </div>
    </Drawer>
  );
}

function ReviewResults({ data, page, setPage, onAgency }) {
  if (!data) return <Loading />;
  return (
    <div className="results-section">
      <div className="results-heading">
        <div>
          <h2>LATEST</h2>
        </div>
      </div>
      {!data.items.length ? <Empty /> : (
        <div className="review-grid">
          {data.items.map((review) => (
            <ReviewCard key={review.id} review={review} onAgency={onAgency} />
          ))}
        </div>
      )}
      {data.pages > 1 && (
        <div className="pagination">
          <button disabled={page <= 1} onClick={() => setPage((value) => value - 1)}><ArrowLeft size={16} /> Previous</button>
          <span>{page} / {data.pages}</span>
          <button disabled={page >= data.pages} onClick={() => setPage((value) => value + 1)}>Next <ArrowRight size={16} /></button>
        </div>
      )}
    </div>
  );
}

function ReviewCard({ review, onAgency }) {
  const [open, setOpen] = useState(false);
  const body = review.reviewText || 'No written review supplied.';
  const submittedAt = review.submittedAt || review.sourceCreatedAt;
  const submitted = formatDate(submittedAt);
  const relativeSubmitted = formatRelativeDate(submittedAt);
  return (
    <article className={`review-row ${open ? 'open' : ''}`}>
      <button className="row-main" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <span className="row-address">
          <SourceBadge type={review.sourceType} />
          {review.listing && <ListedBadge />}
          <span className="row-address-text">{formatHeadline(review)}</span>
        </span>
        <Rating value={review.rating} />
        <time className="row-date" dateTime={dateTimeValue(submittedAt)} title={submitted}>
          {relativeSubmitted}
        </time>
        <ChevronDown size={16} className="row-chevron" />
      </button>
      {open && (
        <div className="row-detail">
          {review.listing && <ListingCallout listing={review.listing} />}
          <div className="review-body">{body}</div>
          <dl className="review-details">
            <div><dt>Submitted</dt><dd>{submitted}</dd></div>
            {review.sourceType === 'agency' && formatProperty(review) && (
              <div><dt>Property</dt><dd>{formatProperty(review)}</dd></div>
            )}
            <div><dt>Managed by</dt><dd>{review.landlordType || (review.agencyName ? 'Agency' : 'Not specified')}</dd></div>
            <div><dt>Source ID</dt><dd>{review.sourceId}</dd></div>
          </dl>
          <div className="row-detail-actions">
            {review.agencyName && (
              <button className="agency-link" onClick={() => onAgency(review.agencyKey)}>
                <Building2 size={14} /> {review.agencyName}
              </button>
            )}
  
          </div>
        </div>
      )}
    </article>
  );
}

function MapResults({ points, onLocation }) {
  if (!points) return <Loading />;
  return (
    <div className="results-section map-section">
      <div className="results-heading">
        <div>
          <span className="kicker">Location view</span>
          <h2>{points.length.toLocaleString()} mapped localities</h2>
        </div>
        <span>Click a marker to search that suburb</span>
      </div>
      {points.length ? <MapView points={points} onLocation={onLocation} /> : <Empty />}
    </div>
  );
}

function AgencyResults({ agencies, onAgency }) {
  if (!agencies) return <Loading />;
  return (
    <div className="results-section">
      <div className="results-heading">
        <div>
          <span className="kicker">Correlated names</span>
          <h2>{agencies.length} repeat agenc{agencies.length === 1 ? 'y' : 'ies'}</h2>
        </div>
        <span>Two or more linked reports</span>
      </div>
      {!agencies.length ? <Empty /> : (
        <div className="agency-list">
          <div className="agency-list-head">
            <span>Agency</span>
            <span>Reports</span>
            <span>Low ratings</span>
            <span>Average</span>
          </div>
          {agencies.map((agency, index) => (
            <button className="agency-row" key={agency.agency_key} onClick={() => onAgency(agency.agency_key)}>
              <span className="agency-rank">{String(index + 1).padStart(2, '0')}</span>
              <span className="agency-identity">
                <strong>{agency.name}</strong>
                <small>{[...agency.suburbs.slice(0, 3), ...agency.states].filter(Boolean).join(' · ')}</small>
              </span>
              <strong>{agency.total_reviews}</strong>
              <strong className="danger-number">{agency.low_rating_reviews}</strong>
              <Rating value={agency.average_rating} compact />
              <ArrowRight size={16} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ReviewDrawer({ review, onClose, onAgency }) {
  return (
    <Drawer onClose={onClose}>
      <div className="drawer-topline"><SourceBadge type={review.sourceType} /><Rating value={review.rating} /></div>
      <h2>{review.title}</h2>
      <p className="drawer-location">{formatLocation(review)}</p>
      {review.agencyName && (
        <button className="drawer-agency" onClick={() => onAgency(review.agencyKey)}>
          <Building2 size={16} /> {review.agencyName} <ArrowRight size={14} />
        </button>
      )}
      {review.listing && <ListingCallout listing={review.listing} />}
      <div className="review-body">{review.reviewText || 'No written review supplied.'}</div>
      <dl className="review-details">
        <div><dt>Submitted</dt><dd>{formatDate(review.submittedAt || review.sourceCreatedAt)}</dd></div>
        {review.sourceType === 'agency' && formatProperty(review) && (
          <div><dt>Property</dt><dd>{formatProperty(review)}</dd></div>
        )}
        <div><dt>Managed by</dt><dd>{review.landlordType || (review.agencyName ? 'Agency' : 'Not specified')}</dd></div>
        <div><dt>Source ID</dt><dd>{review.sourceId}</dd></div>
      </dl>
      {(review.address || review.suburb) && (
        <a
          className="map-external"
          href={`https://www.openstreetmap.org/search?query=${encodeURIComponent([review.address, review.suburb, review.state, review.country].filter(Boolean).join(', '))}`}
          target="_blank"
          rel="noreferrer"
        >
          Open location search <ExternalLink size={14} />
        </a>
      )}
    </Drawer>
  );
}

function AgencyDrawer({ agency, onClose, onReview, onShowAll }) {
  return (
    <Drawer onClose={onClose} wide>
      <span className="kicker">Correlated agency profile</span>
      <h2>{agency.name}</h2>
      <p className="drawer-location">{agency.states.join(' · ') || 'Location not specified'}</p>
      <div className="agency-metrics">
        <Stat value={agency.total_reviews} label="linked reports" />
        <Stat value={agency.low_rating_reviews} label="1–2 star reports" />
        <Stat value={agency.average_rating ?? '—'} label="average rating" />
      </div>
      <div className="correlation-note">
        <ShieldAlert size={17} />
        Reports are linked using a normalized agency name. Branches and similarly named businesses may need manual verification.
      </div>
      <div className="drawer-review-list">
        {agency.reviews.slice(0, 8).map((review) => (
          <button key={review.id} onClick={() => onReview(review)}>
            <span><SourceBadge type={review.sourceType} /><Rating value={review.rating} compact /></span>
            <strong>{review.title}</strong>
            <small>{formatLocation(review)}</small>
          </button>
        ))}
      </div>
      <button className="primary-button" onClick={() => onShowAll(agency)}>
        Search all {agency.total_reviews} linked reports <ArrowRight size={16} />
      </button>
    </Drawer>
  );
}

function Drawer({ children, onClose, wide = false }) {
  useEffect(() => {
    const handleKey = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div className="drawer-layer" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <aside className={`drawer ${wide ? 'drawer-wide' : ''}`} role="dialog" aria-modal="true">
        <button className="drawer-close" onClick={onClose} aria-label="Close"><X size={19} /></button>
        {children}
      </aside>
    </div>
  );
}

function SourceBadge({ type }) {
  if (type !== 'agency') return null;
  return <span className="source-badge agency"><Building2 size={13} /> Agency</span>;
}

function ListedBadge() {
  return <span className="listed-badge"><KeyRound size={12} /> Listed for rent</span>;
}

function ListingCallout({ listing }) {
  return (
    <div className="listing-callout">
      <KeyRound size={16} />
      <div className="listing-callout-text">
        <strong>Currently advertised for rent{listing.price ? ` — ${listing.price}` : ''}</strong>
        <small>
          {listing.address}
          {listing.unitMatch === 'mismatch' && ' · different unit, same building'}
        </small>
      </div>
      {listing.url && (
        <a href={listing.url} target="_blank" rel="noreferrer" className="listing-callout-link">
          View listing <ExternalLink size={13} />
        </a>
      )}
    </div>
  );
}

function Rating({ value, compact = false }) {
  const numeric = value == null ? null : Number(value);
  const low = numeric != null && numeric <= 2;
  const label = numeric == null ? '—' : numeric.toFixed(Number.isInteger(numeric) ? 0 : 1);

  if (compact) {
    return (
      <span className={`rating compact ${low ? 'rating-low' : ''}`}>
        <Star size={12} fill="currentColor" />{label}
      </span>
    );
  }

  const filled = numeric == null ? 0 : Math.round(numeric);
  return (
    <span className={`rating ${low ? 'rating-low' : ''}`} title={numeric == null ? 'No rating' : `${label} out of 5`}>
      <span className="rating-stars" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((index) => (
          <Star
            key={index}
            size={14}
            className={index < filled ? 'star-on' : 'star-off'}
            fill={index < filled ? 'currentColor' : 'none'}
          />
        ))}
      </span>
      <span className="rating-num">{label}</span>
    </span>
  );
}

function Tab({ active, onClick, icon: Icon, children }) {
  return <button className={active ? 'active' : ''} onClick={onClick}><Icon size={16} /> {children}</button>;
}

function Stat({ value, label }) {
  const number = Number(value);
  const numeric = value != null && value !== '' && Number.isFinite(number);
  const animated = useCountUp(numeric ? number : 0);
  const display = !numeric
    ? (value == null || value === '' ? '—' : String(value))
    : animated.toLocaleString();
  return <div className="stat" role="listitem"><strong>{display}</strong><span>{label}</span></div>;
}

function useCountUp(target) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const end = Number(target);
    if (!Number.isFinite(end)) return undefined;
    let raf = 0;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      raf = requestAnimationFrame(() => setDisplay(end));
      return () => cancelAnimationFrame(raf);
    }
    const isInt = Number.isInteger(end);
    const start = performance.now();
    const duration = 850;
    const tick = (now) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(isInt ? Math.round(end * eased) : Number((end * eased).toFixed(1)));
      if (progress < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return display;
}

function Loading() {
  return <div className="loading"><span /> Loading database…</div>;
}

function Empty() {
  return <div className="empty-state"><Search size={25} /><h3>No matching records</h3><p>Try a broader search or remove a filter.</p></div>;
}

function formatLocation(review) {
  return [review.suburb, review.state, review.country === 'Australia' ? '' : review.country].filter(Boolean).join(', ') || 'Location not specified';
}

function formatAddress(review) {
  return [review.address, review.suburb, review.state].filter(Boolean).join(', ') || 'Location not specified';
}

// Agency reviews carry the agency in `title`/`agencyName` and the complained-about
// property in `address`; lead with the agency name so it isn't shown as an address.
function formatHeadline(review) {
  if (review.sourceType === 'agency') {
    return review.agencyName || review.title || 'Agency';
  }
  return formatAddress(review);
}

function formatProperty(review) {
  return [review.address, review.suburb, review.state].filter(Boolean).join(', ');
}

function readInitialTab() {
  const value = new URLSearchParams(window.location.search).get('view');
  return ['reviews', 'map', 'repeat'].includes(value) ? value : 'reviews';
}
