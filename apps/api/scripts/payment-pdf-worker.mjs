import { parentPort, workerData } from 'node:worker_threads';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
let task;
try {
  task = getDocument({
    data: new Uint8Array(workerData),
    isEvalSupported: false,
    useSystemFonts: false,
    disableFontFace: true,
    verbosity: 0,
  });
  const doc = await task.promise;
  if (doc.numPages < 1 || doc.numPages > 100) throw new Error('pages');
  const pages = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const text = await page.getTextContent();
    if (text.items.length > 20000) throw new Error('items');
    const lines = new Map();
    for (const item of text.items) {
      if (!('str' in item)) continue;
      const y = Math.round(item.transform[5] * 2) / 2;
      if (!lines.has(y)) lines.set(y, []);
      lines.get(y).push({ x: item.transform[4], text: item.str });
    }
    pages.push(
      [...lines.entries()]
        .sort((a, b) => b[0] - a[0])
        .map(([, parts]) =>
          parts
            .sort((a, b) => a.x - b.x)
            .map((p) => p.text)
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim(),
        )
        .filter(Boolean),
    );
    page.cleanup();
  }
  parentPort.postMessage({ pages });
} catch {
  parentPort.postMessage({ error: true });
} finally {
  await task?.destroy();
}
