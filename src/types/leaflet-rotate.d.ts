import 'leaflet';

declare module 'leaflet' {
  interface MapOptions {
    /** Enable rotated map (leaflet-rotate plugin). */
    rotate?: boolean;
    /** Initial bearing in degrees (clockwise, north = 0). */
    bearing?: number;
    /** Show built-in rotate control (default true in plugin — set false). */
    rotateControl?: boolean | Record<string, unknown>;
    /** Rotate map with device orientation (conflicts with fixed course bearing). */
    compassBearing?: boolean;
    touchRotate?: boolean;
    shiftKeyRotate?: boolean;
  }

  interface Map {
    setBearing(deg: number): this;
    getBearing(): number;
  }
}
