export const DEFAULT_STATE = Object.freeze({
  version: 1,
  score: 0,
  soundEnabled: true,
  trainingLoadout: ['bazooka'],
  completedTrainingMissions: [],
  trainingWeaponPackOwned: false,
  updatedAt: 0,
});

export function normalizeState(value = {}) {
  return {
    ...DEFAULT_STATE,
    ...value,
    version: DEFAULT_STATE.version,
    score: Math.max(0, Math.floor(Number(value.score) || 0)),
    soundEnabled: value.soundEnabled !== false,
    trainingLoadout: normalizeStringList(value.trainingLoadout, ['bazooka']),
    completedTrainingMissions: normalizeStringList(value.completedTrainingMissions, []),
    trainingWeaponPackOwned: value.trainingWeaponPackOwned === true,
    updatedAt: Math.max(0, Number(value.updatedAt) || 0),
  };
}

function normalizeStringList(value, fallback) {
  if (!Array.isArray(value)) return [...fallback];
  return [...new Set(value.filter(item => typeof item === 'string' && /^[a-zA-Z]+$/.test(item)))];
}

export function chooseNewestState(localState, cloudState) {
  const local = normalizeState(localState);
  const cloud = normalizeState(cloudState);
  return cloud.updatedAt > local.updatedAt ? cloud : local;
}
