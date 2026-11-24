import path from "node:path";

// Negative means the left file ranks higher. JS string comparison uses UTF-16 code units.
function compare(left, right) {
  if (left.size !== right.size) return right.size - left.size;
  return left.path < right.path ? -1 : left.path > right.path ? 1 : 0;
}

export class LargestFiles {
  constructor(limit) {
    this.limit = limit;
    this.heap = [];
  }

  add(filePath, name, size) {
    // Keep the worst retained file at the root so most files cost a single comparison.
    const heap = this.heap;
    if (heap.length === this.limit && size < heap[0].size) return;
    const candidate = { path: path.isAbsolute(filePath) ? filePath : path.resolve(filePath), name, size };
    if (heap.length < this.limit) {
      let index = heap.length;
      while (index > 0) {
        const parent = Math.floor((index - 1) / 2);
        if (compare(candidate, heap[parent]) <= 0) break;
        heap[index] = heap[parent];
        index = parent;
      }
      heap[index] = candidate;
      return;
    }
    if (compare(candidate, heap[0]) >= 0) return;
    let index = 0;
    for (;;) {
      let child = 2 * index + 1;
      if (child >= heap.length) break;
      if (child + 1 < heap.length && compare(heap[child + 1], heap[child]) > 0) child++;
      if (compare(heap[child], candidate) <= 0) break;
      heap[index] = heap[child];
      index = child;
    }
    heap[index] = candidate;
  }

  sorted() {
    return this.heap.slice().sort(compare);
  }
}
