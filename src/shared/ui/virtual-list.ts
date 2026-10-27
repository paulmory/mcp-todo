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
  let itemHeights: number[] = [];
  let tree: number[] = [0];
  let renderedRange = "";
  let frame = 0;

  container.setAttribute("role", "list");

  function prefixHeight(count: number) {
    let total = 0;
    for (let index = count; index > 0; index -= index & -index) total += tree[index];
    return total;
  }

  function addHeight(index: number, delta: number) {
    for (let node = index + 1; node < tree.length; node += node & -node) tree[node] += delta;
  }

  function appendItem(item: T) {
    const index = items.length;
    const height = heights.get(getKey(item)) ?? estimateHeight;
    const node = index + 1;
    const rangeStart = node - (node & -node);
    tree.push(height + prefixHeight(index) - prefixHeight(rangeStart));
    items.push(item);
    itemHeights.push(height);
  }

  function resetItems(nextItems: T[]) {
    // Keep the rendered list independent from caller-owned arrays so appendItems
    // cannot mutate workspace state as a side effect.
    items = [...nextItems];
    itemHeights = new Array(items.length);
    tree = new Array(items.length + 1).fill(0);
    for (let index = 1; index <= items.length; index += 1) {
      const height = heights.get(getKey(items[index - 1])) ?? estimateHeight;
      itemHeights[index - 1] = height;
      tree[index] += height;
      const parent = index + (index & -index);
      if (parent <= items.length) tree[parent] += tree[index];
    }
  }

  function setMeasuredHeight(index: number, height: number) {
    const difference = height - itemHeights[index];
    if (Math.abs(difference) <= 1) return 0;
    itemHeights[index] = height;
    heights.set(getKey(items[index]), height);
    addHeight(index, difference);
    return difference;
  }

  function firstItemAfter(position: number) {
    let index = 0;
    let total = 0;
    let step = 1;
    while ((step << 1) <= items.length) step <<= 1;
    for (; step > 0; step >>= 1) {
      const candidate = index + step;
      if (candidate <= items.length && total + tree[candidate] <= position) {
        index = candidate;
        total += tree[candidate];
      }
    }
    return index;
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
    const topHeight = prefixHeight(start);
    const totalHeight = prefixHeight(items.length);
    const bottomHeight = totalHeight - prefixHeight(end);

    const range = `${start}:${end}:${items.length}`;
    if (range === renderedRange) return;

    const visibleIndex = firstItemAfter(viewportTop);
    const oldAnchor = container.querySelector<HTMLElement>(`[data-virtual-index="${visibleIndex}"]`);
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
      const measured = row.getBoundingClientRect().height;
      if (measured > 0 && setMeasuredHeight(index, measured)) {
        changed = true;
      }
    });

    if (changed) {
      if (anchorTop !== undefined) {
        const newAnchor = container.querySelector<HTMLElement>(`[data-virtual-index="${visibleIndex}"]`);
        if (newAnchor) window.scrollBy(0, newAnchor.getBoundingClientRect().top - anchorTop);
      }
      renderedRange = "";
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
      resetItems(nextItems);
      renderedRange = "";
      render();
    },
    appendItems(nextItems: T[]) {
      if (!nextItems.length) return;
      for (const item of nextItems) appendItem(item);
      renderedRange = "";
      render();
    },
    refresh: scheduleRender,
  };
}
