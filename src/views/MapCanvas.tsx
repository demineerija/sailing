import { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, CircleMarker, Polyline, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import type { Course } from '../store/useSailingStore';
import type { LiveGps } from '../services/geolocation';
import { midpoint } from '../math/sailing';

function FitBounds({ course, live }: { course: Course; live: LiveGps | null }) {
  const map = useMap();
  useEffect(() => {
    const pts: [number, number][] = [];
    if (course.pin) pts.push([course.pin.lat, course.pin.lon]);
    if (course.committee) pts.push([course.committee.lat, course.committee.lon]);
    if (course.windward) pts.push([course.windward.lat, course.windward.lon]);
    if (live) pts.push([live.coord.lat, live.coord.lon]);
    if (pts.length >= 2) {
      map.fitBounds(pts, { padding: [40, 40], maxZoom: 17 });
    } else if (pts.length === 1) {
      map.setView(pts[0], 16);
    }
  }, [map, course, live]);
  return null;
}

export function MapCanvas({ course, live }: { course: Course; live: LiveGps | null }) {
  const center: [number, number] = useMemo(() => {
    if (course.pin && course.committee) {
      const m = midpoint(course.pin, course.committee);
      return [m.lat, m.lon];
    }
    if (live) return [live.coord.lat, live.coord.lon];
    return [43.7, 7.27];
  }, [course, live]);

  return (
    <MapContainer
      center={center}
      zoom={15}
      className="w-full h-full rounded-2xl overflow-hidden"
      preferCanvas
      attributionControl={false}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
        crossOrigin
      />
      <FitBounds course={course} live={live} />

      {course.pin && course.committee && (
        <Polyline
          positions={[
            [course.pin.lat, course.pin.lon],
            [course.committee.lat, course.committee.lon]
          ]}
          pathOptions={{ color: '#FBBF24', weight: 5, opacity: 0.9 }}
        />
      )}

      {course.pin && (
        <CircleMarker
          center={[course.pin.lat, course.pin.lon]}
          radius={14}
          pathOptions={{ color: '#fff', weight: 3, fillColor: '#D5302E', fillOpacity: 1 }}
        />
      )}
      {course.committee && (
        <CircleMarker
          center={[course.committee.lat, course.committee.lon]}
          radius={14}
          pathOptions={{ color: '#fff', weight: 3, fillColor: '#2EA043', fillOpacity: 1 }}
        />
      )}
      {course.windward && (
        <CircleMarker
          center={[course.windward.lat, course.windward.lon]}
          radius={14}
          pathOptions={{ color: '#fff', weight: 3, fillColor: '#3B82F6', fillOpacity: 1 }}
        />
      )}

      {live && (
        <CircleMarker
          center={[live.coord.lat, live.coord.lon]}
          radius={8}
          pathOptions={{ color: '#fff', weight: 2, fillColor: '#FBBF24', fillOpacity: 1 }}
        />
      )}
    </MapContainer>
  );
}
