'use client';
import { useEffect, useRef, useState } from 'react';
import type { Prospect } from '@/types/prospect';

interface Props {
  prospects: Prospect[];
  center?: [number, number];
  zoom?: number;
}

export function ProspectMap({ prospects, center, zoom = 13 }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<unknown>(null);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => { setIsClient(true); }, []);

  useEffect(() => {
    if (!isClient || !mapRef.current) return;

    // Dynamic import to avoid SSR issues with Leaflet
    import('leaflet').then(L => {
      if (mapInstanceRef.current) return;

      // Default center: first prospect with coords, or NYC
      const defaultCenter: [number, number] = center || (() => {
        const first = prospects.find(p => p.lat && p.lng);
        return first ? [first.lat!, first.lng!] : [40.7128, -74.0060];
      })();

      const map = L.map(mapRef.current!, {
        center: defaultCenter,
        zoom,
        zoomControl: true,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map);

      mapInstanceRef.current = map;

      // Add markers
      const priorityColors: Record<string, string> = {
        HIGH: '#ef4444',
        MEDIUM: '#f59e0b',
        LOW: '#10b981',
      };

      prospects.forEach(p => {
        if (!p.lat || !p.lng) return;
        const color = priorityColors[p.priority || ''] || '#6366f1';

        const icon = L.divIcon({
          className: '',
          html: `<div style="
            width:12px;height:12px;border-radius:50%;
            background:${color};border:2px solid white;
            box-shadow:0 2px 8px rgba(0,0,0,0.5);
            cursor:pointer;
          "></div>`,
          iconSize: [12, 12],
          iconAnchor: [6, 6],
        });

        const marker = L.marker([p.lat, p.lng], { icon }).addTo(map);
        marker.bindPopup(`
          <div style="font-family:Inter,sans-serif;min-width:180px">
            <div style="font-weight:600;font-size:13px;margin-bottom:4px">${p.name}</div>
            <div style="font-size:11px;color:#9ca3af;margin-bottom:6px">${p.category || ''}</div>
            ${p.website ? `<a href="${p.website}" target="_blank" style="font-size:11px;color:#818cf8">${p.website.replace(/^https?:\/\//, '')}</a><br>` : ''}
            ${p.phone ? `<span style="font-size:11px;color:#9ca3af">${p.phone}</span><br>` : ''}
            <div style="margin-top:8px;display:flex;gap:6px;align-items:center">
              <span style="font-size:11px;padding:2px 8px;border-radius:99px;background:${color}22;color:${color};border:1px solid ${color}44">
                ${p.priority || 'Unscored'}
              </span>
              ${p.lead_score !== undefined ? `<span style="font-size:11px;color:#9ca3af">Score: ${p.lead_score}</span>` : ''}
            </div>
          </div>
        `);
      });

      return () => {
        map.remove();
        mapInstanceRef.current = null;
      };
    });
  }, [isClient, prospects]);

  if (!isClient) {
    return (
      <div className="w-full h-full min-h-[400px] bg-gray-900 rounded-xl flex items-center justify-center">
        <p className="text-gray-500 text-sm">Loading map…</p>
      </div>
    );
  }

  return (
    <div
      ref={mapRef}
      className="w-full h-full min-h-[500px] rounded-xl overflow-hidden"
      style={{ minHeight: '500px' }}
    />
  );
}
