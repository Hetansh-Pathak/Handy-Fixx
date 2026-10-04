import { useEffect } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export type MapMarker = {
  latitude: number;
  longitude: number;
  label: string;
  color?: "gold" | "blue" | "green";
  draggable?: boolean;
};

type LiveMapProps = {
  markers: MapMarker[];
  height?: string;
  zoom?: number;
  onMarkerDrag?: (latitude: number, longitude: number) => void;
};

const markerIcon = (color: MapMarker["color"] = "gold") => L.divIcon({
  className: "live-map-marker",
  html: `<span style="display:block;width:18px;height:18px;border-radius:50%;background:${color === "blue" ? "#2563eb" : color === "green" ? "#16a34a" : "hsl(var(--primary))"};border:3px solid hsl(var(--primary-foreground));box-shadow:0 2px 8px rgba(0,0,0,.4)"></span>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

const Recenter = ({ markers }: { markers: MapMarker[] }) => {
  const map = useMap();
  useEffect(() => {
    const invalidate = () => map.invalidateSize({ pan: false });
    const frame = requestAnimationFrame(invalidate);
    const firstRetry = window.setTimeout(invalidate, 100);
    const secondRetry = window.setTimeout(invalidate, 350);
    const container = map.getContainer().parentElement;
    const observer = container ? new ResizeObserver(invalidate) : null;
    observer?.observe(container as Element);

    if (markers.length === 1) map.setView([markers[0].latitude, markers[0].longitude]);
    if (markers.length > 1) {
      map.fitBounds(markers.map((marker) => [marker.latitude, marker.longitude] as [number, number]), { padding: [24, 24] });
    }

    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(firstRetry);
      window.clearTimeout(secondRetry);
      observer?.disconnect();
    };
  }, [map, markers]);
  return null;
};

const LiveMap = ({ markers, height = "220px", zoom = 15, onMarkerDrag }: LiveMapProps) => {
  const center: [number, number] = markers.length
    ? [markers[0].latitude, markers[0].longitude]
    : [20.5937, 78.9629];

  return (
    <div className="overflow-hidden rounded-xl border border-border" style={{ height }}>
      <MapContainer center={center} zoom={zoom} scrollWheelZoom className="h-full w-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Recenter markers={markers} />
        {markers.map((marker, index) => (
          <Marker
            key={`${marker.label}-${index}`}
            position={[marker.latitude, marker.longitude]}
            icon={markerIcon(marker.color)}
            draggable={marker.draggable}
            eventHandlers={marker.draggable && onMarkerDrag ? {
              dragend: (event) => {
                const position = event.target.getLatLng();
                onMarkerDrag(position.lat, position.lng);
              },
            } : undefined}
          >
            <Popup>{marker.label}</Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
};

export default LiveMap;
