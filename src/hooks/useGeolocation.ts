import { useState, useEffect, useCallback } from 'react';
import type { Position } from '../types/navigation';

interface GeolocationState {
  position: Position | null;
  error: string | null;
  loading: boolean;
}

export function useGeolocation(watch = false) {
  const [state, setState] = useState<GeolocationState>({
    position: null,
    error: null,
    loading: true,
  });

  const getPosition = useCallback(() => {
    if (!navigator.geolocation) {
      setState({ position: null, error: 'Geolocation not supported', loading: false });
      return;
    }

    setState((prev) => ({ ...prev, loading: true }));

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setState({
          position: {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            timestamp: pos.timestamp,
            accuracy: pos.coords.accuracy,
          },
          error: null,
          loading: false,
        });
      },
      (err) => {
        setState({ position: null, error: err.message, loading: false });
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  }, []);

  useEffect(() => {
    if (!watch) {
      getPosition();
      return;
    }

    if (!navigator.geolocation) {
      setState({ position: null, error: 'Geolocation not supported', loading: false });
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setState({
          position: {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            timestamp: pos.timestamp,
            accuracy: pos.coords.accuracy,
          },
          error: null,
          loading: false,
        });
      },
      (err) => {
        setState((prev) => ({ ...prev, error: err.message, loading: false }));
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [watch, getPosition]);

  return { ...state, refresh: getPosition };
}
