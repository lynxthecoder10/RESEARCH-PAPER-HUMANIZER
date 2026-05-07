import { randomUUID } from 'crypto';
import dbConnect from './db.js';
import User from '../models/User.js';

const memoryUsersByEmail = globalThis.authUsersByEmail ||
  (globalThis.authUsersByEmail = new Map());

function normalizeUser(user) {
  if (!user) return null;

  if (typeof user.toObject === 'function') {
    const plain = user.toObject();
    return {
      id: String(plain._id),
      email: plain.email,
      passwordHash: plain.passwordHash,
      source: 'db'
    };
  }

  return user;
}

export async function findUserByEmail(email) {
  try {
    await dbConnect();
    const user = await User.findOne({ email });
    if (user) return normalizeUser(user);
  } catch {}

  const fallback = memoryUsersByEmail.get(email);
  return fallback || null;
}

export async function createUser({ email, passwordHash }) {
  try {
    await dbConnect();
    const existing = await User.findOne({ email }).lean();
    if (existing) {
      const error = new Error('Email already registered');
      error.status = 409;
      throw error;
    }

    const user = await User.create({ email, passwordHash });
    return normalizeUser(user);
  } catch (error) {
    if (error?.status === 409) throw error;
  }

  if (memoryUsersByEmail.has(email)) {
    const error = new Error('Email already registered');
    error.status = 409;
    throw error;
  }

  const user = {
    id: `mem_${randomUUID()}`,
    email,
    passwordHash,
    source: 'memory'
  };
  memoryUsersByEmail.set(email, user);
  return user;
}
