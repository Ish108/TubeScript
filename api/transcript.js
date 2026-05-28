const DEFAULT_ACTOR_ID = 'automation-lab/youtube-transcript';
const APIFY_TIMEOUT_MS = 45000;
const FALLBACK_TIMEOUT_MS = 15000;

async function readJsonFromCurl(apiUrl, input, token) {
  const { execFile } = await import('node:child_process');

  return new Promise((resolve, reject) => {
    const child = execFile(
      'curl.exe',
      [
        '--ssl-no-revoke',
        '--silent',
        '--show-error',
        '--max-time',
        String(Math.ceil(APIFY_TIMEOUT_MS / 1000)),
        '--request',
        'POST',
        '--header',
        'content-type: application/json',
        '--header',
        `Authorization: Bearer ${token}`,
        '--data',
        JSON.stringify(input),
        '--write-out',
        '\n__HTTP_STATUS__:%{http_code}',
        apiUrl.toString()
      ],
      { windowsHide: true, maxBuffer: 20 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr || error.message));
          return;
        }

        try {
          const [body, statusText = '200'] = stdout.split('\n__HTTP_STATUS__:');
          const status = Number(statusText.trim()) || 500;
          resolve({ ok: status >= 200 && status < 300, status, data: JSON.parse(body) });
        } catch {
          reject(new Error(stdout || 'Apify returned an unreadable response.'));
        }
      }
    );

    child.on('error', reject);
  });
}

async function readJsonFromFetch(apiUrl, input, token) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), APIFY_TIMEOUT_MS);

  try {
    const apifyResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify(input),
      signal: controller.signal
    });

    const data = await apifyResponse.json().catch(() => null);
    return { ok: apifyResponse.ok, status: apifyResponse.status, data };
  } finally {
    clearTimeout(timeout);
  }
}

async function runApify(apiUrl, input, token) {
  if (process.env.APIFY_LOCAL_CURL === '1') {
    return readJsonFromCurl(apiUrl, input, token);
  }

  return readJsonFromFetch(apiUrl, input, token);
}

function extractVideoId(value = '') {
  const trimmed = value.trim();

  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }

  try {
    const url = new URL(trimmed);
    const host = url.hostname.replace(/^www\./, '');

    if (host === 'youtu.be') {
      return url.pathname.split('/').filter(Boolean)[0] || '';
    }

    if (host.endsWith('youtube.com')) {
      if (url.pathname === '/watch') return url.searchParams.get('v') || '';
      if (url.pathname.startsWith('/shorts/')) return url.pathname.split('/')[2] || '';
      if (url.pathname.startsWith('/embed/')) return url.pathname.split('/')[2] || '';
      if (url.pathname.startsWith('/live/')) return url.pathname.split('/')[2] || '';
    }
  } catch {
    return '';
  }

  return '';
}

function getTranscriptText(item) {
  const candidates = [
    item?.transcript,
    item?.transcriptText,
    item?.fullText,
    item?.text,
    item?.plainText,
    item?.transcript_llm
  ];

  const direct = candidates.find((entry) => typeof entry === 'string' && entry.trim());
  if (direct) return direct.trim();

  const segments =
    (Array.isArray(item?.transcript) && item.transcript) ||
    item?.segments ||
    item?.captions ||
    item?.subtitles ||
    item?.transcriptItems;
  if (Array.isArray(segments)) {
    return segments
      .map((segment) => segment?.text || segment?.caption || segment?.content || '')
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  return '';
}

function normalizeItem(item, videoId, videoUrl, language) {
  const transcript = getTranscriptText(item);
  return {
    videoId: item?.videoId || videoId,
    videoUrl: item?.url || item?.videoUrl || videoUrl,
    title: item?.title || item?.videoTitle || item?.metadata?.title || 'YouTube video',
    channelName:
      item?.channelName ||
      item?.channel ||
      item?.author ||
      item?.metadata?.channelName ||
      item?.metadata?.author_name ||
      '',
    language: item?.language || language,
    transcript,
    raw: item
  };
}

function getActorError(item) {
  return item?.error || item?.message || item?.reason || item?.code || '';
}

function friendlyTranscriptError(message) {
  if (/requires login|age-restricted|private/i.test(message)) {
    return 'This video requires YouTube login or is private/age-restricted, so public transcript extraction is blocked. Try a public video with captions.';
  }

  if (/disabled|not available|no captions|no transcript/i.test(message)) {
    return 'No captions were found for this video. Try another video or one with captions enabled.';
  }

  return message;
}

async function getTranscriptFromPackage(videoId, videoUrl, language) {
  const { fetchTranscript } = await import('youtube-transcript');
  const fallbackFetch = (resource, options = {}) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FALLBACK_TIMEOUT_MS);

    return fetch(resource, { ...options, signal: controller.signal }).finally(() => clearTimeout(timeout));
  };
  const segments = await fetchTranscript(videoUrl || videoId, { lang: language, fetch: fallbackFetch });
  const transcript = segments
    .map((segment) => segment?.text || '')
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!transcript) return null;

  return {
    videoId,
    videoUrl,
    title: 'YouTube video',
    channelName: '',
    language,
    transcript,
    raw: { source: 'youtube-transcript', segments }
  };
}

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ error: 'Only POST requests are supported.' });
  }

  const token = process.env.APIFY_TOKEN;
  const actorId = process.env.APIFY_ACTOR_ID || DEFAULT_ACTOR_ID;

  if (!token) {
    return response.status(500).json({ error: 'APIFY_TOKEN is missing from server environment variables.' });
  }

  const { url, language = 'en' } = request.body || {};
  const videoId = extractVideoId(url);

  if (!videoId) {
    return response.status(400).json({ error: 'Please paste a valid YouTube URL or 11-character video ID.' });
  }

  const actorPath = actorId.replace('/', '~');
  const apiUrl = new URL(`https://api.apify.com/v2/acts/${actorPath}/run-sync-get-dataset-items`);
  apiUrl.searchParams.set('timeout', '120');

  const input = {
    language,
    metadata: true
  };

  if (actorId === 'automation-lab/youtube-transcript') {
    input.urls = [url];
    input.includeAutoGenerated = true;
    input.mergeSegments = true;
  } else {
    input.videoId = videoId;
    input.videoIds = [videoId];
  }

  try {
    const apifyResponse = await runApify(apiUrl, input, token);
    const { data } = apifyResponse;

    if (!apifyResponse.ok) {
      const fallback = await getTranscriptFromPackage(videoId, url, language).catch((fallbackError) => ({
        fallbackError: fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
      }));

      if (fallback?.transcript) {
        return response.status(200).json(fallback);
      }

      return response.status(apifyResponse.status).json({
        error: friendlyTranscriptError(
          data?.error?.message || data?.message || fallback?.fallbackError || 'Apify could not generate a transcript.'
        ),
        fallbackError: fallback?.fallbackError,
        details: data
      });
    }

    const items = Array.isArray(data) ? data : data?.items || [];
    const item = items.find((entry) => getTranscriptText(entry)) || items[0];

    if (!item) {
      return response.status(404).json({ error: 'No transcript result was returned for this video.' });
    }

    const result = normalizeItem(item, videoId, url, language);
    if (!result.transcript) {
      const actorError = getActorError(item);
      const fallback = await getTranscriptFromPackage(videoId, url, language).catch((fallbackError) => ({
        fallbackError: fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
      }));

      if (fallback?.transcript) {
        return response.status(200).json(fallback);
      }

      return response.status(422).json({
        error:
          friendlyTranscriptError(
            actorError ||
              fallback?.fallbackError ||
              'No transcript text was found. This video may have no captions, may be private, or may require login.'
          ),
        fallbackError: fallback?.fallbackError,
        raw: item
      });
    }

    return response.status(200).json(result);
  } catch (error) {
    const fallback = await getTranscriptFromPackage(videoId, url, language).catch((fallbackError) => ({
      fallbackError: fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
    }));

    if (fallback?.transcript) {
      return response.status(200).json(fallback);
    }

    const cause = error?.cause?.code || error?.cause?.message || '';
    const message = [error instanceof Error ? error.message : String(error), cause].filter(Boolean).join(' ');
    return response.status(500).json({
      error: friendlyTranscriptError(message || fallback?.fallbackError || 'Transcript generation failed. Please try again.'),
      details: message,
      fallbackError: fallback?.fallbackError
    });
  }
}
