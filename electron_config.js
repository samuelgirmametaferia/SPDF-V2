const ORBITAL_ORDER = [
  { n: 1, l: 's', capacity: 2 },
  { n: 2, l: 's', capacity: 2 },
  { n: 2, l: 'p', capacity: 6 },
  { n: 3, l: 's', capacity: 2 },
  { n: 3, l: 'p', capacity: 6 },
  { n: 4, l: 's', capacity: 2 },
  { n: 3, l: 'd', capacity: 10 },
  { n: 4, l: 'p', capacity: 6 },
  { n: 5, l: 's', capacity: 2 },
  { n: 4, l: 'd', capacity: 10 },
  { n: 5, l: 'p', capacity: 6 },
  { n: 6, l: 's', capacity: 2 },
  { n: 4, l: 'f', capacity: 14 },
  { n: 5, l: 'd', capacity: 10 },
  { n: 6, l: 'p', capacity: 6 },
  { n: 7, l: 's', capacity: 2 },
  { n: 5, l: 'f', capacity: 14 },
  { n: 6, l: 'd', capacity: 10 },
  { n: 7, l: 'p', capacity: 6 },
];

const ORDER_INDEX = new Map(ORBITAL_ORDER.map((o, idx) => [`${o.n}${o.l}`, idx]));

const EXCEPTION_ADJUSTMENTS = {
  24: [{ from: { n: 4, l: 's', count: 1 }, to: { n: 3, l: 'd', count: 1 } }],
  29: [{ from: { n: 4, l: 's', count: 1 }, to: { n: 3, l: 'd', count: 1 } }],
  41: [{ from: { n: 5, l: 's', count: 1 }, to: { n: 4, l: 'd', count: 1 } }],
  42: [{ from: { n: 5, l: 's', count: 1 }, to: { n: 4, l: 'd', count: 1 } }],
  44: [{ from: { n: 5, l: 's', count: 1 }, to: { n: 4, l: 'd', count: 1 } }],
  45: [{ from: { n: 5, l: 's', count: 1 }, to: { n: 4, l: 'd', count: 1 } }],
  46: [{ from: { n: 5, l: 's', count: 2 }, to: { n: 4, l: 'd', count: 2 } }],
  47: [{ from: { n: 5, l: 's', count: 1 }, to: { n: 4, l: 'd', count: 1 } }],
  57: [{ from: { n: 4, l: 'f', count: 1 }, to: { n: 5, l: 'd', count: 1 } }],
  58: [{ from: { n: 4, l: 'f', count: 1 }, to: { n: 5, l: 'd', count: 1 } }],
  64: [{ from: { n: 4, l: 'f', count: 1 }, to: { n: 5, l: 'd', count: 1 } }],
  78: [{ from: { n: 6, l: 's', count: 1 }, to: { n: 5, l: 'd', count: 1 } }],
  79: [{ from: { n: 6, l: 's', count: 1 }, to: { n: 5, l: 'd', count: 1 } }],
  89: [{ from: { n: 5, l: 'f', count: 1 }, to: { n: 6, l: 'd', count: 1 } }],
  90: [{ from: { n: 5, l: 'f', count: 2 }, to: { n: 6, l: 'd', count: 2 } }],
  91: [{ from: { n: 5, l: 'f', count: 1 }, to: { n: 6, l: 'd', count: 1 } }],
  92: [{ from: { n: 5, l: 'f', count: 1 }, to: { n: 6, l: 'd', count: 1 } }],
  93: [{ from: { n: 5, l: 'f', count: 1 }, to: { n: 6, l: 'd', count: 1 } }],
  96: [{ from: { n: 5, l: 'f', count: 1 }, to: { n: 6, l: 'd', count: 1 } }],
  103: [{ from: { n: 6, l: 'd', count: 1 }, to: { n: 7, l: 'p', count: 1 } }],
};

function ensureEntry(config, n, l) {
  let entry = config.find((c) => c.n === n && c.l === l);
  if (entry) return entry;
  const template = ORBITAL_ORDER.find((o) => o.n === n && o.l === l);
  if (!template) return null;
  entry = { n, l, capacity: template.capacity, electrons: 0 };
  const orderIndex = ORDER_INDEX.get(`${n}${l}`);
  if (orderIndex === undefined) {
    config.push(entry);
    return entry;
  }
  let insertAt = config.length;
  for (let i = 0; i < config.length; i += 1) {
    const idx = ORDER_INDEX.get(`${config[i].n}${config[i].l}`);
    if (idx !== undefined && idx > orderIndex) {
      insertAt = i;
      break;
    }
  }
  config.splice(insertAt, 0, entry);
  return entry;
}

function applyExceptions(config, atomicNumber) {
  const ops = EXCEPTION_ADJUSTMENTS[atomicNumber];
  if (!ops) return;
  ops.forEach(({ from, to }) => {
    if (from) {
      const target = config.find((c) => c.n === from.n && c.l === from.l);
      if (target) {
        target.electrons = Math.max(0, target.electrons - from.count);
      }
    }
    if (to) {
      const dest = ensureEntry(config, to.n, to.l);
      if (dest) {
        dest.electrons = Math.min(dest.capacity, dest.electrons + to.count);
      }
    }
  });
  for (let i = config.length - 1; i >= 0; i -= 1) {
    if (config[i].electrons <= 0) {
      config.splice(i, 1);
    }
  }
}

export function buildElectronConfiguration(atomicNumber) {
  const config = [];
  let remaining = atomicNumber;
  for (const orbital of ORBITAL_ORDER) {
    if (remaining <= 0) break;
    const electrons = Math.min(orbital.capacity, remaining);
    config.push({ ...orbital, electrons });
    remaining -= electrons;
  }
  applyExceptions(config, atomicNumber);
  return config;
}

export function formatElectronConfiguration(config) {
  return config.map((entry) => `${entry.n}${entry.l}${entry.electrons}`).join(' ');
}

export function computeValenceElectrons(config) {
  let maxShell = 0;
  config.forEach((entry) => {
    if (entry.n > maxShell) {
      maxShell = entry.n;
    }
  });
  return config.filter((entry) => entry.n === maxShell).reduce((sum, entry) => sum + entry.electrons, 0);
}

export function summarizeShellOccupation(config) {
  const summary = new Map();
  config.forEach(({ n, l, electrons, capacity }) => {
    const key = `${n}${l}`;
    summary.set(key, { n, l, electrons, capacity });
  });
  return Array.from(summary.values());
}
