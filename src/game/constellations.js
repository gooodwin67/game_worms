// Recognizable schematic outlines based on the supplied constellation chart.
// Relative placement is artistic, not an astronomical projection.
// Each region is [left, bottom, right, top] in screen fractions (Y points up).
// Separate regions keep the figures readable and leave room around the moon at (.72, .86).
export const CONSTELLATIONS = [
  {
    name: 'Большая Медведица', region: [.035, .79, .20, .93],
    points: [[-1.4,.15,4.3],[-.9,.45,3.8],[-.45,.32,4],[0,.12,3.2],[.92,.44,4.1],[.95,-.12,3.8],[.28,-.28,3.7]],
    edges: [[0,1],[1,2],[2,3],[3,4],[4,5],[5,6],[6,3]]
  },
  {
    // Five principal stars: an uneven W, with both outer tips pointing up.
    name: 'Кассиопея', region: [.25, .805, .35, .90],
    points: [[0,.65,3.8],[.32,-.5,4.1],[.83,.25,4.2],[1.32,-.35,3.7],[1.75,.85,3.6]],
    edges: [[0,1],[1,2],[2,3],[3,4]]
  },
  {
    name: 'Малая Медведица', region: [.225, .595, .305, .745], polarisIndex: 0,
    points: [[1.15,.95,5.2],[.55,.85,3],[ -.05,.5,3.1],[-.35,-.05,3.2],[-.85,.07,3.9],[-.98,-.76,3.7],[-.42,-.78,3]],
    edges: [[0,1],[1,2],[2,3],[3,4],[4,5],[5,6],[6,3]]
  },
  {
    // Shoulders, three belt stars, feet, head, raised arm and shield.
    name: 'Орион', region: [.445, .405, .545, .555],
    points: [[-.7,.7,4.8],[.65,.65,4],[-.2,0,4],[0,.04,4.1],[.22,.08,4],[-.55,-1,4],[.85,-.85,5],[0,1.05,3.4],[-.98,1.05,3],[-.86,1.65,3.2],[-.57,1.7,3],[-.6,1.05,3],[1.08,.94,3.2],[1.55,1.12,3.4],[1.48,1.5,3.1],[1.25,1.76,3],[1.6,.78,3],[1.64,.42,3],[1.4,.12,3]],
    edges: [[0,2],[2,3],[3,4],[4,1],[2,5],[4,6],[5,6],[0,7],[7,1],[0,8],[8,9],[0,11],[11,10],[1,12],[12,13],[13,14],[14,15],[13,16],[16,17],[17,18]]
  },
  {
    name: 'Лебедь', region: [.49, .59, .57, .745],
    points: [[0,0,4],[-.72,.08,3.8],[-1.05,.22,3.4],[-1.48,.28,3.3],[-1.8,.28,3.2],[.55,-.3,4.3],[.12,.92,3.6],[.64,1.43,3.2],[-.4,-.74,3.7],[-.2,-1.17,3.3],[-.3,-1.7,3.1]],
    edges: [[0,1],[1,2],[2,3],[3,4],[0,5],[0,6],[6,7],[0,8],[8,9],[9,10]]
  },
  {
    name: 'Цефей', region: [.395, .785, .465, .925],
    points: [[0,1.3,3.7],[-.62,.2,3.8],[.05,-.55,3.5],[1.2,-1,3.8],[.85,.3,3.6],[.37,1.56,3.1],[-1.05,-.1,3.2],[-1.1,-.43,3]],
    edges: [[0,1],[1,2],[2,3],[3,4],[4,0],[0,5],[1,6],[6,7]]
  },
  {
    name: 'Лира', region: [.61, .435, .68, .555],
    points: [[.93,-.83,4.6],[.63,-.42,3.5],[.61,.18,3.4],[-.38,.38,3.5],[-.34,-.23,3.4]],
    edges: [[0,1],[1,2],[2,3],[3,4],[4,1]]
  },
  {
    name: 'Дельфин', region: [.04, .435, .11, .545],
    points: [[0,.45,3.5],[.4,.65,3.8],[.85,.4,3.6],[.48,.18,3.5],[-.35,-.4,3.2]],
    edges: [[0,1],[1,2],[2,3],[3,0],[0,4]]
  },
  {
    name: 'Треугольник', region: [.185, .44, .235, .54],
    points: [[0,1,3.7],[-.45,0,3.5],[.4,.1,3.3]],
    edges: [[0,1],[1,2],[2,0]]
  },
  {
    name: 'Персей', region: [.05, .605, .145, .745],
    points: [[-.5,.35,4.2],[-1,.85,3.6],[-1.32,1.2,3.4],[.38,.47,3.7],[.7,.49,3.4],[.68,.84,3.1],[-.28,-.07,3.5],[.57,-.7,3.8],[.95,-.79,3.6],[1.42,-.69,3.4],[1.36,-.38,3.1]],
    edges: [[2,1],[1,0],[0,3],[3,4],[4,5],[0,6],[6,7],[7,8],[8,9],[9,10]]
  },
  {
    name: 'Жираф', region: [.36, .61, .43, .75],
    points: [[0,0,3.5],[-.35,.68,3.3],[.23,.78,3.2],[.69,1.07,3.4],[.48,-.24,3.2],[.96,-.34,3.1],[-1.1,-.31,3.3],[-.51,-.56,3]],
    edges: [[0,1],[1,2],[2,3],[0,4],[4,5],[0,6],[6,7]]
  },
  {
    name: 'Возничий', region: [.865, .78, .955, .92],
    points: [[-.48,.92,4.6],[.19,.87,3.8],[.95,.56,3.6],[1.07,-.35,3.5],[.08,-.43,3.4],[-.8,0,3.7]],
    edges: [[0,1],[1,2],[2,3],[3,4],[4,5],[5,0]]
  },
  {
    name: 'Геркулес', region: [.64, .60, .74, .745],
    points: [[-.5,.38,3.7],[.12,.79,3.5],[.46,.15,3.7],[-.33,-.13,3.8],[-1.17,.48,3.3],[-.98,1.65,3.1],[-.85,1.84,3],[.02,1.12,3.2],[-.04,1.7,3.3],[.23,1.66,3.1],[.8,1.58,3.2],[.94,.08,3.2],[1.42,-.11,3.4],[1.35,-.39,3],[-1.36,-.86,3.3],[-1.46,-1.22,3]],
    edges: [[0,1],[1,2],[2,3],[3,0],[0,4],[4,5],[5,6],[1,7],[7,8],[8,9],[9,10],[2,11],[11,12],[12,13],[3,14],[14,15]]
  },
  {
    name: 'Дракон', region: [.51, .775, .60, .925],
    points: [[-.8,.48,3.8],[-.45,.44,3.7],[-.3,.82,3.5],[-.9,.84,3.6],[1.13,1.43,3.4],[1.52,1.52,3.3],[1.52,.57,3.4],[.78,-.08,3.3],[.42,-.75,3.5],[.27,-1.12,3.4],[.59,-1.6,3.2],[1.62,-2.1,3.3],[2.73,-2.15,3.2],[3.1,-2.45,3.1]],
    edges: [[0,1],[1,2],[2,3],[3,0],[2,4],[4,5],[5,6],[6,7],[7,8],[8,9],[9,10],[10,11],[11,12],[12,13]]
  },
  {
    name: 'Рысь', region: [.285, .435, .385, .55],
    points: [[-.9,-.75,3.2],[-.79,-.5,3.1],[-.45,-.2,3.4],[.05,-.25,3.3],[.8,.2,3.3],[1.1,1.05,3.5],[1.43,1.14,3.2]],
    edges: [[0,1],[1,2],[2,3],[3,4],[4,5],[5,6]]
  },
  {
    name: 'Волопас', region: [.84, .595, .92, .745],
    points: [[.9,-1.08,4.8],[-.17,-.57,3.6],[-1.06,.06,3.4],[-.8,.74,3.5],[-.17,.66,3.3],[.05,-.05,3.6]],
    edges: [[0,1],[1,2],[2,3],[3,4],[4,5],[5,0],[1,5]]
  },
  {
    name: 'Северная Корона', region: [.79, .445, .865, .545],
    points: [[-.66,.73,3.3],[-.98,.5,3.5],[-1.04,.18,3.3],[-.73,-.28,3.7],[-.28,-.44,4],[.04,-.2,3.4]],
    edges: [[0,1],[1,2],[2,3],[3,4],[4,5]]
  }
];

export function createConstellationGeometryData(width, height) {
  width = Math.max(1, width);
  height = Math.max(1, height);
  const linePositions = [], starPositions = [], starSizes = [], polarisFlags = [];
  for (const { name, region, points, edges, polarisIndex = -1 } of CONSTELLATIONS) {
    const [left, bottom, right, top] = region;
    const minX = Math.min(...points.map(p => p[0])), maxX = Math.max(...points.map(p => p[0]));
    const minY = Math.min(...points.map(p => p[1])), maxY = Math.max(...points.map(p => p[1]));
    // Fit the outline uniformly in pixel space, preserving its shape on wide monitors.
    const scale = Math.min((right - left) * width / (maxX - minX), (top - bottom) * height / (maxY - minY));
    const mappedPoints = points.map(([x, y, size], index) => {
      const screenX = (left + right) / 2 + (x - (minX + maxX) / 2) * scale / width;
      const screenY = (bottom + top) / 2 + (y - (minY + maxY) / 2) * scale / height;
      const position = [screenX * 2 - 1, screenY * 2 - 1];
      if (!position.every(Number.isFinite) || !Number.isFinite(size)) {
        throw new Error(`Invalid constellation coordinates: ${name}`);
      }
      starPositions.push(...position, .06);
      starSizes.push(size * 1.6);
      polarisFlags.push(index === polarisIndex ? 1 : 0);
      return position;
    });
    // Both primitives use the same transformed points; no optional shifts or duplicate formulas.
    for (const [start, end] of edges) {
      linePositions.push(...mappedPoints[start], .05, ...mappedPoints[end], .05);
    }
  }
  return {
    linePositions: new Float32Array(linePositions),
    starPositions: new Float32Array(starPositions),
    starSizes: new Float32Array(starSizes),
    polarisFlags: new Float32Array(polarisFlags)
  };
}
