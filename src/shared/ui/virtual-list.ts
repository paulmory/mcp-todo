type VirtualListOptions<T> = {
  container: HTMLElement;
  getKey: (item: T) => string | number;
  renderItem: (item: T, index: number) => string;
  estimateHeight?: number;
  overscan?: number;
};

/** Window a variable-height list against the document viewport. */
export function createVirtualList<T>({
  container,
  getKey,
  renderItem,
  estimateHeight = 96,
  overscan = 640,
}: VirtualListOptions<T>) {
  let items: T[] = [];
  let emptyHtml = "";
  let heights = new Map<string | number, number>();
  let offsets: number[] = [0];
  let renderedRange = "";
  let frame = 0;

  container.setAttribute("role", "list");

  function itemHeight(index: number) {
    return heights.get(getKey(items[index])) ?? estimateHeight;
  }

  function rebuildOffsets() {
    offsets = new Array(items.length + 1);
    offsets[0] = 0;
    for (let index = 0; index < items.length; index += 1) {
      offsets[index + 1] = offsets[index] + itemHeight(index);
    }
  }

  function firstItemAfter(position: number) {
    let low = 0;
    let high = items.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (offsets[middle + 1] <= position) low = middle + 1;
      else high = middle;
    }
    return low;
  }

  function render() {
    frame = 0;
    if (!items.length) {
      if (renderedRange !== "empty") {
        renderedRange = "empty";
        container.innerHTML = emptyHtml;
      }
      return;
    }

    const viewportTop = Math.max(0, -container.getBoundingClientRect().top);
    const viewportBottom = viewportTop + window.innerHeight;
    const windowTop = Math.max(0, viewportTop - overscan);
    const windowBottom = viewportBottom + overscan;
    let start = firstItemAfter(windowTop);
    let end = Math.min(items.length, firstItemAfter(windowBottom) + 1);
    const focusedRow = container.querySelector<HTMLElement>("[data-virtual-index] :focus")
      ?.closest<HTMLElement>("[data-virtual-index]");
    const focusedIndex = focusedRow ? Number(focusedRow.dataset.virtualIndex) : -1;
    if (focusedIndex >= 0) {
      start = Math.min(start, focusedIndex);
      end = Math.max(end, focusedIndex + 1);
    }
    const topHeight = offsets[start];
    const bottomHeight = offsets[items.length] - offsets[end];

    const range = `${start}:${end}:${items.length}`;
    if (range === renderedRange) return;

    const oldAnchor = container.querySelector<HTMLElement>(
      `[data-virtual-index="${Math.min(Math.max(start, 0), items.length - 1)}"]`,
    );
    const anchorKey = oldAnchor ? getKey(items[Number(oldAnchor.dataset.virtualIndex)]) : null;
    const anchorTop = oldAnchor?.getBoundingClientRect().top;
    const rows = items.slice(start, end).map((item, offset) => {
      const index = start + offset;
      const html = renderItem(item, index);
      return html.replace(
        /^<article\b/,
        `<article role="listitem" data-virtual-index="${index}" aria-posinset="${index + 1}" aria-setsize="${items.length}"`,
      );
    }).join("");

    renderedRange = range;
    container.innerHTML = `<div class="virtual-list-spacer" aria-hidden="true" style="height:${topHeight}px"></div>${rows}<div class="virtual-list-spacer" aria-hidden="true" style="height:${bottomHeight}px"></div>`;

    let changed = false;
    container.querySelectorAll<HTMLElement>("[data-virtual-index]").forEach((row) => {
      const index = Number(row.dataset.virtualIndex);
      const key = getKey(items[index]);
      const measured = row.getBoundingClientRect().height;
      if (measured > 0 && Math.abs((heights.get(key) ?? 0) - measured) > 1) {
        heights.set(key, measured);
        changed = true;
      }
    });

    if (changed) {
      rebuildOffsets();
      renderedRange = "";
      if (anchorKey !== null && anchorTop !== undefined) {
        const anchorIndex = items.findIndex((item) => getKey(item) === anchorKey);
        const newAnchor = container.querySelector<HTMLElement>(`[data-virtual-index="${anchorIndex}"]`);
        if (newAnchor) window.scrollBy(0, newAnchor.getBoundingClientRect().top - anchorTop);
      }
      scheduleRender();
    }
  }

  function scheduleRender() {
    if (!frame) frame = requestAnimationFrame(render);
  }

  window.addEventListener("scroll", scheduleRender, { passive: true });
  window.addEventListener("resize", scheduleRender, { passive: true });

  return {
    setItems(nextItems: T[], { resetMeasurements = false, empty = "" } = {}) {
      items = nextItems;
      emptyHtml = empty;
      if (resetMeasurements) heights = new Map();
      rebuildOffsets();
      renderedRange = "";
      render();
    },
    refresh: scheduleRender,
  };
}
