const STORAGE_KEY = "tenseline-project-v1";
const PALETTE = ["#e85d45", "#1967d2", "#0b8f71", "#9b51e0", "#d28a00", "#d43b78", "#44546a"];

const starterState = () => ({
  textSize: 24,
  nowX: 78,
  sentence: "My mom had cooked dinner when I got home.",
  events: [
    { id: makeId(), label: "Mom cooked dinner", color: PALETTE[0], x: 25, endX: 43, lane: "below", shape: "point" },
    { id: makeId(), label: "I got home", color: PALETTE[1], x: 48, endX: 66, lane: "above", shape: "point" },
  ],
  links: [],
});

let state = loadState();
let drag = null;
let saveTimer = null;
let layoutFrame = null;
let lastPreviewX = 50;
let nowDrag = false;

const els = {
  editor: document.querySelector("#paragraphEditor"),
  stage: document.querySelector("#timelineStage"),
  layer: document.querySelector("#eventLayer"),
  clickPreview: document.querySelector("#clickPreview"),
  nowMarker: document.querySelector("#nowMarker"),
  linkToolbar: document.querySelector("#linkToolbar"),
  textSizeRange: document.querySelector("#textSizeRange"),
  textSizeValue: document.querySelector("#textSizeValue"),
  savedState: document.querySelector("#savedState"),
  toast: document.querySelector("#toast"),
  dialog: document.querySelector("#newDialog"),
};

function loadState() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (stored?.events && Array.isArray(stored.links)) {
      stored.events.forEach((item) => { item.endX = clamp(item.endX ?? item.x + 18, item.x + 5, 96); });
      stored.textSize = clamp(Number(stored.textSize) || 24, 16, 48);
      stored.nowX = clamp(Number(stored.nowX) || 78, 4, 96);
      return stored;
    }
  } catch (_) {}
  const initial = starterState();
  const first = initial.sentence.indexOf("had cooked dinner");
  const second = initial.sentence.indexOf("got home");
  initial.links = [
    { eventId: initial.events[0].id, start: first, end: first + 17 },
    { eventId: initial.events[1].id, start: second, end: second + 8 },
  ];
  return initial;
}

function init() {
  bindGlobalEvents();
  setTextSize(state.textSize, false);
  setNowPosition(state.nowX, false);
  render();
}

function bindGlobalEvents() {
  els.textSizeRange.addEventListener("input", () => setTextSize(els.textSizeRange.value));
  document.querySelector("#textSmaller").addEventListener("click", () => setTextSize(state.textSize - 2));
  document.querySelector("#textLarger").addEventListener("click", () => setTextSize(state.textSize + 2));
  els.nowMarker.addEventListener("pointerdown", startNowDrag);
  els.nowMarker.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const step = event.shiftKey ? 5 : 1;
    setNowPosition(state.nowX + (event.key === "ArrowLeft" ? -step : step));
  });

  els.editor.addEventListener("input", () => {
    state.sentence = els.editor.innerText.replace(/\n$/, "");
    state.links = [];
    if (state.sentence) delete els.editor.dataset.empty;
    else els.editor.dataset.empty = "true";
    scheduleSave();
  });
  els.editor.addEventListener("blur", () => renderParagraph());

  document.querySelector("#addEventButton").addEventListener("click", () => addEvent(lastPreviewX));
  document.querySelector("#clearEventsButton").addEventListener("click", () => {
    if (!state.events.length) return showToast("The timeline is already clear");
    if (!window.confirm("Clear all timeline events? Your example paragraph will be kept.")) return;
    state.events = [];
    state.links = [];
    render();
    saveNow();
    showToast("All events cleared — paragraph kept");
  });
  document.querySelector("#stageAddHint").addEventListener("click", (event) => {
    event.stopPropagation();
    addEvent(lastPreviewX);
  });
  els.stage.addEventListener("pointermove", updateClickPreview);
  els.stage.addEventListener("pointerleave", hideClickPreview);
  els.stage.addEventListener("click", (event) => {
    if (event.target.closest(".timeline-event, .stage-add-hint, .now-line")) return;
    const rect = els.stage.getBoundingClientRect();
    const x = clamp(((event.clientX - rect.left) / rect.width) * 100, 4, 96);
    addEvent(x);
    hideClickPreview();
  });

  document.querySelector("#newButton").addEventListener("click", () => els.dialog.showModal());
  document.querySelector("#confirmNew").addEventListener("click", () => {
    state = starterState();
    state.sentence = "";
    state.events = [];
    state.links = [];
    setTextSize(state.textSize, false);
    setNowPosition(state.nowX, false);
    render();
    saveNow();
    showToast("New timeline ready");
  });

  document.querySelector("#presentButton").addEventListener("click", () => {
    document.body.classList.toggle("is-presenting");
    const presenting = document.body.classList.contains("is-presenting");
    document.querySelector("#presentButton").textContent = presenting ? "Exit presentation" : "Present";
    if (presenting) document.querySelector(".canvas-card").scrollIntoView({ behavior: "smooth", block: "center" });
  });

  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", endDrag);
  window.addEventListener("resize", scheduleCollisionLayout);
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && document.body.classList.contains("is-presenting")) {
      document.body.classList.remove("is-presenting");
      document.querySelector("#presentButton").textContent = "Present";
    }
  });
}

function render() {
  renderTimeline();
  renderParagraphTools();
}

function renderTimeline() {
  els.layer.innerHTML = state.events.map((item) => {
    const lane = item.lane === "above" ? "is-above" : "is-below";
    const shape = item.shape === "range" ? "is-range" : "is-point";
    item.endX = clamp(item.endX ?? item.x + 18, item.x + 5, 96);
    const width = item.shape === "range" ? item.endX - item.x : 0;
    return `
      <article class="timeline-event ${lane} ${shape}" data-id="${item.id}" style="--event-x:${item.x}%;--event-width:${width}%;--event-color:${item.color}" tabindex="0" aria-label="${escapeAttribute(item.label)} event">
        <div class="event-caption">
          <textarea class="inline-name" rows="1" aria-label="Event name">${escapeHtml(item.label)}</textarea>
          <div class="inline-controls">
            <label class="colour-control" title="Event colour"><span>Colour</span><input class="inline-colour" type="color" value="${item.color}" aria-label="Event colour" /></label>
            <button class="inline-action lane-action" type="button" title="Move ${item.lane === "above" ? "below" : "above"} the line" aria-label="Move ${item.lane === "above" ? "below" : "above"} the line">${item.lane === "above" ? "↓" : "↑"}</button>
            <button class="inline-action shape-action" type="button" title="${item.shape === "range" ? "Change to a single moment" : "Change to a continuous action"}" aria-label="${item.shape === "range" ? "Change to a single moment" : "Change to a continuous action"}">${item.shape === "range" ? "●" : "〰"}</button>
            <button class="inline-action remove-action" type="button" title="Remove event" aria-label="Remove ${escapeAttribute(item.label)}">×</button>
          </div>
        </div>
        <span class="event-stem" aria-hidden="true"></span>
        <span class="duration-wave" aria-hidden="true"></span>
        <button class="event-node event-start" type="button" aria-label="${item.shape === "range" ? "Drag the start of" : "Drag"} ${escapeAttribute(item.label)}"></button>
        ${item.shape === "range" ? `<button class="event-node event-end" type="button" aria-label="Drag the end of ${escapeAttribute(item.label)}"></button>` : ""}
      </article>`;
  }).join("");

  els.layer.querySelectorAll(".timeline-event").forEach((node) => {
    const item = state.events.find((entry) => entry.id === node.dataset.id);
    node.querySelector(".event-start").addEventListener("pointerdown", (event) => startDrag(event, item, node, item.shape === "range" ? "start" : "move"));
    node.querySelector(".event-end")?.addEventListener("pointerdown", (event) => startDrag(event, item, node, "end"));
    node.querySelector(".event-stem").addEventListener("pointerdown", (event) => startDrag(event, item, node, "move"));
    node.querySelector(".duration-wave").addEventListener("pointerdown", (event) => startDrag(event, item, node, "move"));
    const nameField = node.querySelector(".inline-name");
    resizeEventName(nameField, false);
    nameField.addEventListener("input", (event) => {
      item.label = event.target.value || "Untitled event";
      resizeEventName(event.target);
      renderParagraphTools(false);
      scheduleSave();
    });
    node.querySelector(".inline-colour").addEventListener("input", (event) => {
      item.color = event.target.value;
      node.style.setProperty("--event-color", item.color);
      renderParagraphTools();
      scheduleSave();
    });
    node.querySelector(".lane-action").addEventListener("click", () => {
      item.lane = item.lane === "above" ? "below" : "above";
      renderTimeline();
      scheduleSave();
    });
    node.querySelector(".shape-action").addEventListener("click", () => {
      item.shape = item.shape === "range" ? "point" : "range";
      if (item.shape === "range") item.endX = clamp(item.endX ?? item.x + 18, item.x + 5, 96);
      renderTimeline();
      scheduleSave();
    });
    node.querySelector(".remove-action").addEventListener("click", () => deleteEvent(item.id));
    node.addEventListener("keydown", (event) => {
      if (event.target.matches("input, textarea, button")) return;
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        const delta = event.key === "ArrowLeft" ? -2 : 2;
        if (item.shape === "range") {
          const duration = item.endX - item.x;
          item.x = clamp(item.x + delta, 4, 96 - duration);
          item.endX = item.x + duration;
        } else {
          item.x = clamp(item.x + delta, 4, 96);
        }
        renderTimeline();
        scheduleSave();
      }
    });
  });
  scheduleCollisionLayout();
}

function scheduleCollisionLayout() {
  cancelAnimationFrame(layoutFrame);
  layoutFrame = requestAnimationFrame(applyCollisionLayout);
}

function resizeEventName(field, updateLayout = true) {
  field.style.height = "0px";
  field.style.height = `${field.scrollHeight}px`;
  if (updateLayout) scheduleCollisionLayout();
}

function applyCollisionLayout() {
  layoutFrame = null;
  const stageRect = els.stage.getBoundingClientRect();
  if (!stageRect.width) return;
  let greatestExtent = 0;

  ["above", "below"].forEach((lane) => {
    const entries = state.events
      .filter((item) => item.lane === lane)
      .map((item) => {
        const node = els.layer.querySelector(`[data-id="${item.id}"]`);
        const caption = node?.querySelector(".event-caption");
        const centerPercent = item.shape === "range" ? (item.x + item.endX) / 2 : item.x;
        const center = stageRect.width * centerPercent / 100;
        const box = caption?.getBoundingClientRect();
        const width = box?.width || 238;
        const height = box?.height || 56;
        return { node, height, left: center - width / 2, right: center + width / 2 };
      })
      .filter((entry) => entry.node)
      .sort((a, b) => a.left - b.left);

    const levelEnds = [];
    const levelHeights = [];
    entries.forEach((entry) => {
      let level = levelEnds.findIndex((right) => right + 14 <= entry.left);
      if (level === -1) level = levelEnds.length;
      levelEnds[level] = entry.right;
      levelHeights[level] = Math.max(levelHeights[level] || 0, entry.height);
      entry.level = level;
    });

    const offsets = [];
    levelHeights.forEach((height, level) => {
      offsets[level] = level === 0 ? 0 : offsets[level - 1] + levelHeights[level - 1] + 16;
    });
    entries.forEach((entry) => {
      const offset = offsets[entry.level] || 0;
      entry.node.style.setProperty("--stack-offset", `${offset}px`);
      greatestExtent = Math.max(greatestExtent, offset + entry.height);
    });
  });

  els.stage.style.height = `${Math.max(430, Math.ceil((106 + greatestExtent) * 2))}px`;
}

function updateClickPreview(event) {
  if (drag || nowDrag || event.target.closest(".timeline-event, .stage-add-hint, .now-line")) return hideClickPreview();
  const rect = els.stage.getBoundingClientRect();
  lastPreviewX = clamp(((event.clientX - rect.left) / rect.width) * 100, 4, 96);
  els.clickPreview.style.left = `${lastPreviewX}%`;
  els.clickPreview.classList.add("is-visible");
}

function hideClickPreview() {
  els.clickPreview.classList.remove("is-visible");
}

function startNowDrag(event) {
  if (event.button !== 0) return;
  nowDrag = true;
  els.nowMarker.classList.add("is-dragging");
  hideClickPreview();
  event.preventDefault();
  event.stopPropagation();
}

function setNowPosition(value, save = true) {
  state.nowX = clamp(Math.round(Number(value) || 78), 4, 96);
  els.stage.style.setProperty("--now-x", `${state.nowX}%`);
  els.nowMarker.setAttribute("aria-valuetext", `Now at ${state.nowX}% of the timeline`);
  if (save) scheduleSave();
}

function startDrag(event, item, node, handle) {
  if (event.button !== 0) return;
  const rect = els.stage.getBoundingClientRect();
  drag = {
    id: item.id,
    handle,
    startY: event.clientY,
    pointerX: ((event.clientX - rect.left) / rect.width) * 100,
    originalX: item.x,
    originalEndX: item.endX,
  };
  node.classList.add("is-dragging");
  hideClickPreview();
  event.preventDefault();
}

function onPointerMove(event) {
  if (nowDrag) {
    const rect = els.stage.getBoundingClientRect();
    setNowPosition(((event.clientX - rect.left) / rect.width) * 100, false);
    return;
  }
  if (!drag) return;
  const item = state.events.find((entry) => entry.id === drag.id);
  const rect = els.stage.getBoundingClientRect();
  const pointerX = ((event.clientX - rect.left) / rect.width) * 100;
  if (drag.handle === "end") {
    item.endX = Math.round(clamp(pointerX, item.x + 5, 96));
  } else if (drag.handle === "start") {
    item.x = Math.round(clamp(pointerX, 4, item.endX - 5));
  } else if (item.shape === "range") {
    const duration = drag.originalEndX - drag.originalX;
    item.x = Math.round(clamp(drag.originalX + pointerX - drag.pointerX, 4, 96 - duration));
    item.endX = item.x + duration;
  } else {
    item.x = Math.round(clamp(pointerX, 4, 96));
  }
  if (Math.abs(event.clientY - drag.startY) > 12) item.lane = event.clientY < rect.top + rect.height / 2 ? "above" : "below";
  renderTimeline();
}

function endDrag() {
  if (nowDrag) {
    nowDrag = false;
    els.nowMarker.classList.remove("is-dragging");
    scheduleSave();
    return;
  }
  if (!drag) return;
  drag = null;
  renderTimeline();
  scheduleSave();
}

function renderParagraphTools(updateParagraph = true) {
  els.linkToolbar.innerHTML = state.events.length
    ? state.events.map((item) => `<button class="link-chip" style="--event-color:${item.color}" data-id="${item.id}" type="button"><i></i>${escapeHtml(item.label)}</button>`).join("") + `<button class="unlink-button" type="button">Clear links</button>`
    : `<span class="toolbar-empty">Add an event before linking words.</span>`;

  els.linkToolbar.querySelectorAll(".link-chip").forEach((button) => {
    button.addEventListener("pointerdown", (event) => event.preventDefault());
    button.addEventListener("click", () => linkSelection(button.dataset.id));
  });
  els.linkToolbar.querySelector(".unlink-button")?.addEventListener("click", () => {
    state.links = [];
    renderParagraph();
    scheduleSave();
  });
  if (updateParagraph) renderParagraph();
}

function renderParagraph() {
  els.editor.innerHTML = buildHighlightedText();
  if (!state.sentence) els.editor.dataset.empty = "true";
  else delete els.editor.dataset.empty;
}

function linkSelection(eventId) {
  const selection = window.getSelection();
  if (!selection?.rangeCount) return showSelectionHint();
  const range = selection.getRangeAt(0);
  if (!els.editor.contains(range.commonAncestorContainer) || range.collapsed) return showSelectionHint();

  const before = range.cloneRange();
  before.selectNodeContents(els.editor);
  before.setEnd(range.startContainer, range.startOffset);
  const start = before.toString().length;
  const end = start + range.toString().length;
  state.sentence = els.editor.innerText.replace(/\n$/, "");
  state.links = state.links.filter((link) => link.end <= start || link.start >= end);
  state.links.push({ eventId, start, end });
  state.links.sort((a, b) => a.start - b.start);
  renderParagraph();
  scheduleSave();
  showToast("Words linked to event");
}

function showSelectionHint() {
  showToast("Select some words in the paragraph first");
  els.editor.focus();
}

function buildHighlightedText() {
  if (!state.sentence) return "";
  const links = [...state.links].filter((link) => link.start >= 0 && link.end <= state.sentence.length).sort((a, b) => a.start - b.start);
  let cursor = 0;
  let html = "";
  links.forEach((link) => {
    const item = state.events.find((event) => event.id === link.eventId);
    if (!item || link.start < cursor) return;
    html += escapeHtml(state.sentence.slice(cursor, link.start));
    html += `<mark style="--mark:${item.color}" title="${escapeAttribute(item.label)}">${escapeHtml(state.sentence.slice(link.start, link.end))}</mark>`;
    cursor = link.end;
  });
  return html + escapeHtml(state.sentence.slice(cursor));
}

function addEvent(x = null) {
  const index = state.events.length;
  const item = {
    id: makeId(), label: `New event ${index + 1}`, color: PALETTE[index % PALETTE.length],
    x: x ?? clamp(25 + index * 15, 10, 90), lane: index % 2 ? "above" : "below", shape: "point",
  };
  item.endX = clamp(item.x + 18, item.x + 5, 96);
  state.events.push(item);
  render();
  scheduleSave();
  requestAnimationFrame(() => {
    const input = els.layer.querySelector(`[data-id="${item.id}"] .inline-name`);
    input?.focus();
    input?.select();
  });
}

function deleteEvent(id) {
  state.events = state.events.filter((item) => item.id !== id);
  state.links = state.links.filter((link) => link.eventId !== id);
  render();
  scheduleSave();
}

function scheduleSave() {
  els.savedState.textContent = "Saving…";
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 350);
}

function setTextSize(value, save = true) {
  state.textSize = clamp(Math.round(Number(value) || 24), 16, 48);
  document.documentElement.style.setProperty("--readability-size", `${state.textSize}px`);
  els.textSizeRange.value = state.textSize;
  els.textSizeValue.textContent = `${state.textSize}px`;
  requestAnimationFrame(() => {
    els.layer.querySelectorAll(".inline-name").forEach((field) => resizeEventName(field, false));
    scheduleCollisionLayout();
  });
  if (save) scheduleSave();
}

function saveNow() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  els.savedState.textContent = "Saved locally";
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("is-visible");
  setTimeout(() => els.toast.classList.remove("is-visible"), 2200);
}

function clamp(value, min, max) { return Math.min(Math.max(value, min), max); }
function makeId() { return globalThis.crypto?.randomUUID?.() || `event-${Date.now()}-${Math.random().toString(16).slice(2)}`; }
function escapeHtml(value) { return String(value).replace(/[&<>'\"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#039;", '\"': "&quot;" })[char]); }
function escapeAttribute(value) { return escapeHtml(value); }

init();
