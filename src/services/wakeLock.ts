type WakeLockSentinel = {
  released: boolean;
  release: () => Promise<void>;
  addEventListener: (ev: 'release', cb: () => void) => void;
};

type WakeLockNavigator = Navigator & {
  wakeLock?: { request: (kind: 'screen') => Promise<WakeLockSentinel> };
};

let sentinel: WakeLockSentinel | null = null;
let visibilityHandler: (() => void) | null = null;

function nav(): WakeLockNavigator | null {
  if (typeof navigator === 'undefined') return null;
  return navigator as WakeLockNavigator;
}

export async function acquire(): Promise<void> {
  const n = nav();
  if (!n?.wakeLock) return;
  try {
    sentinel = await n.wakeLock.request('screen');
    sentinel.addEventListener('release', () => {
      sentinel = null;
    });
    if (!visibilityHandler) {
      visibilityHandler = async () => {
        if (document.visibilityState === 'visible' && !sentinel) {
          try {
            sentinel = (await n.wakeLock!.request('screen')) ?? null;
          } catch {
            // ignore
          }
        }
      };
      document.addEventListener('visibilitychange', visibilityHandler);
    }
  } catch {
    // ignore - not supported / denied
  }
}

export async function release(): Promise<void> {
  if (sentinel) {
    try {
      await sentinel.release();
    } catch {
      // ignore
    }
    sentinel = null;
  }
  if (visibilityHandler) {
    document.removeEventListener('visibilitychange', visibilityHandler);
    visibilityHandler = null;
  }
}
