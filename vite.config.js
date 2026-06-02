import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import transcriptHandler from './api/transcript.js';
import summarizeHandler from './api/summarize.js';

function createJsonResponse(res) {
  return {
    setHeader(name, value) {
      res.setHeader(name, value);
    },
    status(code) {
      res.statusCode = code;
      return this;
    },
    json(payload) {
      if (!res.headersSent) {
        res.setHeader('content-type', 'application/json');
      }
      res.end(JSON.stringify(payload));
    },
    end() {
      res.end();
    }
  };
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks).toString('utf8');
  return body ? JSON.parse(body) : {};
}

function localApiPlugin() {
  return {
    name: 'local-api',
    configureServer(server) {
      server.middlewares.use('/api/transcript', async (req, res) => {
        try {
          req.body = await readJsonBody(req);
          await transcriptHandler(req, createJsonResponse(res));
        } catch (error) {
          res.statusCode = 500;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ error: error.message || 'Local API request failed.' }));
        }
      });

      server.middlewares.use('/api/summarize', async (req, res) => {
        try {
          req.body = await readJsonBody(req);
          await summarizeHandler(req, createJsonResponse(res));
        } catch (error) {
          res.statusCode = 500;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ error: error.message || 'Local API request failed.' }));
        }
      });
    }
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  process.env.APIFY_TOKEN = env.APIFY_TOKEN;
  process.env.APIFY_ACTOR_ID = env.APIFY_ACTOR_ID;
  process.env.GEMINI_API_KEY = env.GEMINI_API_KEY;
  process.env.APIFY_LOCAL_CURL = process.platform === 'win32' ? '1' : '';

  return {
    server: { host: '127.0.0.1' },
    plugins: [react(), localApiPlugin()]
  };
});
