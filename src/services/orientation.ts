type OrientationEvent = DeviceOrientationEvent & {
  webkitCompassHeading?: number;
  webkitCompassAccuracy?: number;
};

let permissionGranted = false;
const subscribers = new Set<(headingTrueDeg: number) => void>();
let listenerAttached = false;

function handle(ev: OrientationEvent) {
  let heading: number | null = null;
  if (typeof ev.webkitCompassHeading === 'number') {
    heading = ev.webkitCompassHeading; // already true heading on iOS Safari
  } else if (ev.alpha !== null && ev.alpha !== undefined) {
    // alpha: rotation around z-axis (0 = N, increases counter-clockwise on most devices)
    heading = (360 - ev.alpha) % 360;
  }
  if (heading === null || Number.isNaN(heading)) return;
  subscribers.forEach((cb) => cb(heading!));
}

function attach() {
  if (listenerAttached) return;
  window.addEventListener('deviceorientation', handle as EventListener, true);
  listenerAttached = true;
}

function detach() {
  if (!listenerAttached) return;
  window.removeEventListener('deviceorientation', handle as EventListener, true);
  listenerAttached = false;
}

type RequestPermissionFn = () => Promise<'granted' | 'denied'>;
type DOEC = typeof DeviceOrientationEvent & { requestPermission?: RequestPermissionFn };

export async function requestPermission(): Promise<'granted' | 'denied' | 'unsupported'> {
  if (typeof DeviceOrientationEvent === 'undefined') return 'unsupported';
  const ctor = DeviceOrientationEvent as DOEC;
  if (typeof ctor.requestPermission === 'function') {
    try {
      const r = await ctor.requestPermission();
      permissionGranted = r === 'granted';
      if (permissionGranted) attach();
      return r;
    } catch {
      return 'denied';
    }
  }
  permissionGranted = true;
  attach();
  return 'granted';
}

export function isPermissionGranted(): boolean {
  return permissionGranted;
}

export function subscribe(cb: (headingTrueDeg: number) => void): () => void {
  subscribers.add(cb);
  if (permissionGranted) attach();
  return () => {
    subscribers.delete(cb);
    if (subscribers.size === 0) detach();
  };
}
