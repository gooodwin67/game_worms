export const DEFAULT_STATE = Object.freeze({
  version: 1,
  score: 0,
  soundEnabled: true,
  updatedAt: 0,
});

export function normalizeState(value = {}) {
  return {
    ...DEFAULT_STATE,
    ...value,
    version: DEFAULT_STATE.version,
    score: Math.max(0, Math.floor(Number(value.score) || 0)),
    soundEnabled: value.soundEnabled !== false,
    updatedAt: Math.max(0, Number(value.updatedAt) || 0),
  };
}

export function chooseNewestState(localState, cloudState) {
  const local = normalizeState(localState);
  const cloud = normalizeState(cloudState);
  return cloud.updatedAt > local.updatedAt ? cloud : local;
}

