import dbConnect from './db.js';
import PlagiarismScan from '../models/PlagiarismScan';

const memoryStore = globalThis.similarityScanMemoryStore ||
  (globalThis.similarityScanMemoryStore = new Map());

function plainScan(scan) {
  if (!scan) return null;
  if (typeof scan.toObject === 'function') return scan.toObject();
  return scan;
}

export async function saveScan(scan) {
  try {
    await dbConnect();
    const saved = await PlagiarismScan.create(scan);
    return plainScan(saved);
  } catch {
    memoryStore.set(scan.scanId, { ...scan });
    return scan;
  }
}

export async function findScan(scanId) {
  try {
    await dbConnect();
    const scan = await PlagiarismScan.findOne({ scanId }).lean();
    if (scan) return scan;
  } catch {}

  return memoryStore.get(scanId) || null;
}

export async function updateScan(scanId, update) {
  try {
    await dbConnect();
    const scan = await PlagiarismScan.findOneAndUpdate(
      { scanId },
      { $set: update },
      { new: true }
    ).lean();
    if (scan) return scan;
  } catch {}

  const existing = memoryStore.get(scanId);
  if (!existing) return null;
  const next = { ...existing, ...update };
  memoryStore.set(scanId, next);
  return next;
}
