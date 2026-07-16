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

  function buildConceptQuestions(item, events = [], nowX = 78) {
    const timestamp = String(item.timestamp || "").trim();
    const isContinuous = item.shape === "range";
    const timeFrame = classifyEventTime(item, nowX);
    const questions = [];
    const lead = timestamp ? `${formatTimeLead(timestamp)} ` : "";
    const typeVerb = timestamp
      ? timeFrame === "past" ? "was this" : timeFrame === "future" ? "will this be" : "is this"
      : "Is this shown as";

    questions.push({
      question: `${lead}${typeVerb} A) one moment or B) continuing over time?`,
      answer: isContinuous ? "B) Continuing" : "A) One moment",
    });

    const nowQuestion = isContinuous
      ? timeFrame === "past" ? "Was it happening before, at, or after NOW?"
        : timeFrame === "future" ? "Will it be happening before, at, or after NOW?"
          : "Is it happening before, at, or after NOW?"
      : timeFrame === "past" ? "Did it happen before, at, or after NOW?"
        : timeFrame === "future" ? "Will it happen before, at, or after NOW?"
          : "Does it happen before, at, or after NOW?";
    questions.push({
      question: nowQuestion,
      answer: timeFrame === "past" ? "Before NOW" : timeFrame === "future" ? "After NOW" : "At NOW",
    });

    const relationship = buildRelationshipQuestion(item, events, timeFrame);
    if (relationship) questions.push(relationship);
    return questions;
  }

  function classifyEventTime(item, nowX = 78, tolerance = 1) {
    const start = Number(item.x);
    const end = item.shape === "range" ? Number(item.endX) : start;
    if (end < Number(nowX) - tolerance) return "past";
    if (start > Number(nowX) + tolerance) return "future";
    return "present";
  }

  function formatTimeLead(timestamp) {
    const value = String(timestamp).trim();
    const lower = value.toLowerCase();
    const naturalLead = /^(right now|now|today|tomorrow|yesterday|tonight|this\b|next\b|last\b)/.test(lower);
    const prepositionLead = /^(at|on|in|before|after|by|during|when)\b/.test(lower);
    const phrase = naturalLead || prepositionLead ? value : `At ${value}`;
    return `${phrase.charAt(0).toUpperCase()}${phrase.slice(1)},`;
  }

  function buildRelationshipQuestion(item, events, timeFrame) {
    const others = events.filter((event) => event.id !== item.id && event.label);
    if (!others.length) return null;

    if (item.shape === "range") {
      const containedMoment = others
        .filter((event) => event.shape !== "range" && Number(event.x) >= Number(item.x) && Number(event.x) <= Number(item.endX))
        .sort((a, b) => Number(b.x) - Number(a.x))[0];
      if (!containedMoment) return null;
      const verb = timeFrame === "past" ? "was this still" : timeFrame === "future" ? "will this be" : "is this still";
      return { question: `At “${containedMoment.label}”, ${verb} in progress?`, answer: "Yes" };
    }

    const containingRange = others.find((event) => event.shape === "range" && Number(item.x) >= Number(event.x) && Number(item.x) <= Number(event.endX));
    if (containingRange) return null;

    const nearest = [...others].sort((a, b) => Math.abs(eventCenter(a) - Number(item.x)) - Math.abs(eventCenter(b) - Number(item.x)))[0];
    if (!nearest || eventCenter(item) <= eventCenter(nearest)) return null;
    const verb = timeFrame === "past" ? "happened" : timeFrame === "future" ? "will happen" : "happens";
    return {
      question: `Which ${verb} first: this event or “${nearest.label}”?`,
      answer: `“${nearest.label}”`,
    };
  }

  function eventCenter(item) {
    return item.shape === "range" ? (Number(item.x) + Number(item.endX)) / 2 : Number(item.x);
  }

  function createHistory(limit = 60) {
    const undoStack = [];
    const redoStack = [];
    let lastKey = "";
    let lastRecordedAt = 0;

    function resetCoalescing() {
      lastKey = "";
      lastRecordedAt = 0;
    }

    function push(stack, snapshot) {
      if (stack.at(-1) === snapshot) return false;
      stack.push(snapshot);
      if (stack.length > limit) stack.splice(0, stack.length - limit);
      return true;
    }

    return {
      record(snapshot, key = "", coalesceWindow = 0, recordedAt = Date.now()) {
        const canCoalesce = Boolean(
          coalesceWindow && key && key === lastKey && recordedAt - lastRecordedAt <= coalesceWindow && undoStack.length,
        );
        const recorded = canCoalesce ? false : push(undoStack, snapshot);
        redoStack.length = 0;
        lastKey = key;
        lastRecordedAt = recordedAt;
        return recorded;
      },
      undo(currentSnapshot) {
        resetCoalescing();
        while (undoStack.length) {
          const snapshot = undoStack.pop();
          if (snapshot === currentSnapshot) continue;
          push(redoStack, currentSnapshot);
          return snapshot;
        }
        return null;
      },
      redo(currentSnapshot) {
        resetCoalescing();
        while (redoStack.length) {
          const snapshot = redoStack.pop();
          if (snapshot === currentSnapshot) continue;
          push(undoStack, currentSnapshot);
          return snapshot;
        }
        return null;
      },
      resetCoalescing,
      get canUndo() { return undoStack.length > 0; },
      get canRedo() { return redoStack.length > 0; },
    };
  }

  function nextUniqueColor(usedColors = [], palette = []) {
    const used = new Set(usedColors.map((color) => String(color).toLowerCase()));
    const available = palette.find((color) => !used.has(String(color).toLowerCase()));
    if (available) return available;

    for (let index = 0; index < 360; index += 1) {
      const hue = (index * 137.508) % 360;
      const color = hslToHex(hue, 68, 42);
      if (!used.has(color.toLowerCase())) return color;
    }
    return "#333333";
  }

  function hslToHex(hue, saturation, lightness) {
    const s = saturation / 100;
    const l = lightness / 100;
    const chroma = (1 - Math.abs(2 * l - 1)) * s;
    const section = hue / 60;
    const secondary = chroma * (1 - Math.abs((section % 2) - 1));
    const [red, green, blue] = section < 1 ? [chroma, secondary, 0]
      : section < 2 ? [secondary, chroma, 0]
        : section < 3 ? [0, chroma, secondary]
          : section < 4 ? [0, secondary, chroma]
            : section < 5 ? [secondary, 0, chroma]
              : [chroma, 0, secondary];
    const match = l - chroma / 2;
    return `#${[red, green, blue].map((channel) => Math.round((channel + match) * 255).toString(16).padStart(2, "0")).join("")}`;
  }

  return { assignWaveTracks, rangeFromDrag, isAlongTimeline, buildConceptQuestions, classifyEventTime, createHistory, nextUniqueColor };
});
