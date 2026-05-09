import { authenticatedUserFromRequest, jsonResponse } from '@/../lib/auth.js';
import { listPapersByUser, savePaper } from '@/../lib/paperStore.js';

export const runtime = 'nodejs';

function mapPaper(paper) {
  return {
    id: String(paper._id),
    title: paper.title,
    format: paper.format,
    fallback: Boolean(paper.fallback),
    wordCount: paper.wordCount || 0,
    preview: paper.preview || '',
    createdAt: paper.createdAt
  };
}

export async function GET(req) {
  try {
    const user = authenticatedUserFromRequest(req);
    if (!user) {
      return jsonResponse({ error: 'Authentication required' }, 401);
    }

    const papers = await listPapersByUser(user.userId, 20);
    return jsonResponse({ papers: papers.map(mapPaper) });
  } catch (error) {
    return jsonResponse({ error: error.message || 'Failed to load papers' }, 500);
  }
}

export async function POST(req) {
  try {
    const user = authenticatedUserFromRequest(req);
    if (!user) {
      return jsonResponse({ error: 'Authentication required' }, 401);
    }

    let body = {};
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: 'Invalid request payload' }, 400);
    }

    const generatedContent = String(body.generatedContent || body.result || '').trim();
    if (!generatedContent) {
      return jsonResponse({ error: 'generatedContent is required' }, 400);
    }

    const saved = await savePaper({
      userId: user.userId,
      title: String(body.title || 'Generated research paper').trim().slice(0, 180),
      format: String(body.format || 'ieee').trim().slice(0, 40),
      sourceContent: String(body.sourceContent || body.content || '').slice(0, 60000),
      generatedContent: generatedContent.slice(0, 120000),
      fallback: Boolean(body.fallback),
      wordCount: Number(body.wordCount) || generatedContent.split(/\s+/).filter(Boolean).length,
      preview: String(body.preview || generatedContent.replace(/\s+/g, ' ').trim().slice(0, 240))
    });

    return jsonResponse({ paper: mapPaper(saved) }, 201);
  } catch (error) {
    return jsonResponse({ error: error.message || 'Failed to save paper' }, 500);
  }
}
