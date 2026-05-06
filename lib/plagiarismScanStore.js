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

export async function findScan(scanId, userId) {
  if (!scanId || !userId) return null;

  try {
    await dbConnect();
    const scan = await PlagiarismScan.findOne({ scanId, userId }).lean();
    if (scan) return scan;
  } catch {}

  const cached = memoryStore.get(scanId);
  if (!cached) return null;
  return String(cached.userId) === String(userId) ? cached : null;
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

export async function listScansByUser(userId, limit = 20) {
  if (!userId) return [];

  try {
    await dbConnect();
    return await PlagiarismScan.find({ userId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
  } catch {}

  return [...memoryStore.values()]
    .filter(scan => String(scan.userId) === String(userId))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit);
}
