import { haversineKm, type Rec } from "../shared/records.ts";

export type UserPosition = { lat: number; lng: number };
export type LocationStatus = "requesting" | "available" | "denied" | "unavailable";

const validCoordinate = (value: number, minimum: number, maximum: number) =>
  Number.isFinite(value) && value >= minimum && value <= maximum;

export function requestUserPosition(geolocation: Geolocation): Promise<UserPosition> {
  return new Promise((resolve, reject) => {
    geolocation.getCurrentPosition(
      ({ coords }) => {
        const position = { lat: coords.latitude, lng: coords.longitude };
        if (!validCoordinate(position.lat, -90, 90) || !validCoordinate(position.lng, -180, 180)) {
          reject(new Error("invalid_geolocation"));
          return;
        }
        resolve(position);
      },
      reject,
      { timeout: 20000, maximumAge: 60000, enableHighAccuracy: false },
    );
  });
}

export function estimatedDistanceKm(
  item: Pick<Rec, "lat" | "lng">,
  position: UserPosition | null,
): number | null {
  if (!position || item.lat === null || item.lng === null) return null;
  if (!validCoordinate(item.lat, -90, 90) || !validCoordinate(item.lng, -180, 180)) return null;
  return haversineKm(position, { lat: item.lat, lng: item.lng });
}

export function locationFailureStatus(error: unknown): Extract<LocationStatus, "denied" | "unavailable"> {
  if (error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === 1) {
    return "denied";
  }
  return "unavailable";
}

export function distanceDisplay(distanceKm: number | null, status: LocationStatus): string {
  if (status === "requesting") return "正在取得位置…";
  if (status === "denied") return "無法提供";
  if (status !== "available" || distanceKm === null || !Number.isFinite(distanceKm)) return "未提供";
  if (distanceKm < 1) return `直線距離約 ${Math.max(1, Math.round(distanceKm * 1000))} 公尺`;
  return `直線距離約 ${distanceKm.toFixed(1)} 公里`;
}
