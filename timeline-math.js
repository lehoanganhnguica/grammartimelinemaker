(function exposeTimelineMath(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.TimelineMath = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createTimelineMath() {
  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function assignWaveTracks(events, gap = 1) {
    const tracks = {};
    const trackEnds = [];
    const ranges = events
      .filter((item) => item.shape === "range")
      .map((item) => ({ ...item, x: Number(item.x), endX: Number(item.endX) }))
      .sort((a, b) => a.x - b.x || a.endX - b.endX || String(a.id).localeCompare(String(b.id)));

    ranges.forEach((item) => {
      let track = trackEnds.findIndex((end) => end + gap <= item.x);
      if (track === -1) track = trackEnds.length;
      trackEnds[track] = item.endX;
      tracks[item.id] = {
        track,
        side: track % 2 === 0 ? "above" : "below",
        level: Math.floor(track / 2),
      };
    });

    return tracks;
  }

  function rangeFromDrag(startValue, endValue, min = 4, max = 96, minSpan = 5) {
    const direction = Number(endValue) >= Number(startValue) ? 1 : -1;
    let start = clamp(Number(startValue), min, max);
    let end = clamp(Number(endValue), min, max);

    if (Math.abs(end - start) < minSpan) {
      if (direction > 0) {
        end = Math.min(max, start + minSpan);
        start = end - minSpan;
      } else {
        start = Math.max(min, start - minSpan);
        end = start + minSpan;
      }
    }

    return {
      x: Math.round(Math.min(start, end)),
      endX: Math.round(Math.max(start, end)),
    };
  }

  function isAlongTimeline(clientY, stageRect, tolerance = 28) {
    const axisY = Number(stageRect.top) + Number(stageRect.height) / 2;
    return Math.abs(Number(clientY) - axisY) <= tolerance;
  }

  return { assignWaveTracks, rangeFromDrag, isAlongTimeline };
});
