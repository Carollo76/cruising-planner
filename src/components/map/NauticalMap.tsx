import { MapContainer, TileLayer, ZoomControl, useMapEvents } from 'react-leaflet';
import { MAP_CONFIG } from '../../constants/map-config';
import { useSettingsStore } from '../../stores/settings-store';
import 'leaflet/dist/leaflet.css';

interface NauticalMapProps {
  center?: [number, number];
  zoom?: number;
  onClick?: (lat: number, lng: number) => void;
  children?: React.ReactNode;
  className?: string;
}

function MapClickHandler({ onClick }: { onClick?: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onClick?.(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export function NauticalMap({
  center,
  zoom,
  onClick,
  children,
  className = 'h-full w-full',
}: NauticalMapProps) {
  const homePort = useSettingsStore((s) => s.homePort);
  const resolvedCenter: [number, number] = center ?? [homePort.lat, homePort.lng];
  const resolvedZoom = zoom ?? homePort.zoom;

  return (
    <MapContainer
      center={resolvedCenter}
      zoom={resolvedZoom}
      minZoom={MAP_CONFIG.minZoom}
      maxZoom={MAP_CONFIG.maxZoom}
      zoomControl={false}
      className={className}
    >
      <TileLayer
        url={MAP_CONFIG.tiles.base.url}
        attribution={MAP_CONFIG.tiles.base.attribution}
        maxZoom={MAP_CONFIG.tiles.base.maxZoom}
      />
      <TileLayer
        url={MAP_CONFIG.tiles.seamark.url}
        attribution={MAP_CONFIG.tiles.seamark.attribution}
        maxZoom={MAP_CONFIG.tiles.seamark.maxZoom}
        opacity={0.8}
      />
      <ZoomControl position="topright" />
      <MapClickHandler onClick={onClick} />
      {children}
    </MapContainer>
  );
}
