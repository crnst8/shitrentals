import { useEffect } from 'react';
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from 'react-leaflet';

const AUSTRALIA_CENTER = [-28.5, 134];

export function MapView({ points, onLocation }) {
  return (
    <div className="map-frame">
      <MapContainer center={AUSTRALIA_CENTER} zoom={4} minZoom={3} scrollWheelZoom>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitPoints points={points} />
        {points.map((point) => (
          <CircleMarker
            key={`${point.suburb}-${point.state}-${point.latitude}-${point.longitude}`}
            center={[point.latitude, point.longitude]}
            radius={Math.min(18, 5 + Math.sqrt(point.review_count) * 1.8)}
            pathOptions={{
              color: '#161410',
              fillColor: point.average_rating <= 2 ? '#e23b22' : '#f5b417',
              fillOpacity: 0.85,
              weight: 1.5
            }}
          >
            <Popup>
              <div className="map-popup">
                <strong>{point.suburb || 'Unknown locality'}, {point.state}</strong>
                <span>{point.review_count} review{point.review_count === 1 ? '' : 's'}</span>
                <span>{formatRating(point.average_rating)} average</span>
                <button onClick={() => onLocation(point)}>View reviews</button>
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
      <div className="map-note">Markers use suburb-level centroids, not exact property coordinates.</div>
    </div>
  );
}

function FitPoints({ points }) {
  const map = useMap();
  useEffect(() => {
    if (!points.length) return;
    if (points.length === 1) {
      map.setView([points[0].latitude, points[0].longitude], 12);
      return;
    }
    map.fitBounds(points.map((point) => [point.latitude, point.longitude]), {
      padding: [28, 28],
      maxZoom: 11
    });
  }, [map, points]);
  return null;
}

function formatRating(value) {
  return value == null ? 'No rating' : `${value}/5`;
}

