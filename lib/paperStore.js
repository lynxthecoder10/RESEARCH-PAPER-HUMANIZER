import dbConnect from './db.js';
import Paper from '../models/Paper.js';

const memoryStore = globalThis.paperMemoryStore ||
  (globalThis.paperMemoryStore = new Map());

function plainPaper(paper) {
  if (!paper) return null;
  if (typeof paper.toObject === 'function') return paper.toObject();
  return paper;
}

export async function savePaper(paper) {
  const record = {
    ...paper,
    createdAt: paper.createdAt || new Date()
  };

  try {
    await dbConnect();
    const saved = await Paper.create(record);
    return plainPaper(saved);
  } catch {
    const id = `${record.userId || 'anonymous'}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const fallbackRecord = { _id: id, ...record };
    memoryStore.set(id, fallbackRecord);
    return fallbackRecord;
  }
}

export async function listPapersByUser(userId, limit = 20) {
  if (!userId) return [];

  try {
    await dbConnect();
    return await Paper.find({ userId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
  } catch {}

  return [...memoryStore.values()]
    .filter(paper => String(paper.userId) === String(userId))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit);
}
