// Configuration: Set this to your live Vercel URL when deploying to production!
const API_BASE = 'http://localhost:5173';

document.addEventListener('DOMContentLoaded', async () => {
  const errorView = document.getElementById('error-view');
  const actionView = document.getElementById('action-view');
  const resultView = document.getElementById('result-view');
  const btnGenerate = document.getElementById('btn-generate');
  const statusText = document.getElementById('status-text');
  
  let currentVideoUrl = '';
  let currentTranscriptResult = null;
  let currentSummary = null;

  // 1. Get Active Tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tab.url;

  if (!url || !url.includes('youtube.com/watch')) {
    actionView.classList.add('hidden');
    errorView.classList.remove('hidden');
    return;
  }

  // Set initial info
  currentVideoUrl = url;
  document.getElementById('video-title').textContent = tab.title || 'YouTube Video';
  document.getElementById('video-url').textContent = url;

  // 2. Handle Generation
  btnGenerate.addEventListener('click', async () => {
    const lang = document.getElementById('language-select').value;
    
    btnGenerate.disabled = true;
    btnGenerate.textContent = 'Extracting...';
    statusText.textContent = 'Fetching transcript...';

    try {
      const response = await fetch(`${API_BASE}/api/transcript`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: currentVideoUrl, language: lang })
      });
      
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to extract.');
      
      currentTranscriptResult = data;
      renderTranscript(data);
      
      actionView.classList.add('hidden');
      resultView.classList.remove('hidden');
      statusText.textContent = 'Transcript Ready';

    } catch (err) {
      alert('Error: ' + err.message);
      btnGenerate.disabled = false;
      btnGenerate.textContent = 'Extract Transcript';
      statusText.textContent = 'Error';
    }
  });

  // 3. Render Transcript
  function renderTranscript(data) {
    const container = document.getElementById('segments-container');
    container.innerHTML = '';
    
    // We need to parse segments roughly if the API just returns flat text or handle it if it doesn't
    // Our API returns plain text, so we'll mock segments or parse if the API provides it.
    // For this extension MVP, since `api/transcript.js` just returns flat `data.transcript` 
    // unless we modified it to return `segments`, we'll just show the flat text in chunks.
    // Wait, the API `data.raw.segments` or `data.raw.transcript` usually has the objects.
    
    const segments = data.raw?.segments || [];
    
    if (segments.length > 0) {
      segments.forEach(seg => {
        const timeStr = new Date(seg.offset || 0).toISOString().substr(14, 5);
        const div = document.createElement('div');
        div.className = 'segment';
        div.innerHTML = `<div class="segment-time">[${timeStr}]</div><div class="segment-text">${seg.text}</div>`;
        container.appendChild(div);
      });
    } else {
      // Fallback if no structured segments are provided
      container.innerHTML = `<div class="segment"><div class="segment-text">${data.transcript.replace(/\n/g, '<br>')}</div></div>`;
    }
  }

  // 4. Handle Summarize
  const btnSummarize = document.getElementById('btn-summarize');
  btnSummarize.addEventListener('click', async () => {
    if (!currentTranscriptResult?.transcript) return;
    
    btnSummarize.disabled = true;
    btnSummarize.textContent = 'Thinking...';
    statusText.textContent = 'Summarizing...';

    try {
      const response = await fetch(`${API_BASE}/api/summarize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: currentTranscriptResult.transcript })
      });
      
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to summarize.');
      
      currentSummary = data.summary;
      
      const summaryBox = document.getElementById('summary-box');
      const summaryContent = document.getElementById('summary-content');
      
      summaryContent.textContent = currentSummary;
      summaryBox.classList.remove('hidden');
      statusText.textContent = 'Summary Ready';
      btnSummarize.textContent = 'Summarized';

    } catch (err) {
      alert('Error: ' + err.message);
      btnSummarize.disabled = false;
      btnSummarize.textContent = 'Summarize';
      statusText.textContent = 'Error';
    }
  });

  // 5. Handle Copying
  document.getElementById('btn-copy-text').addEventListener('click', () => {
    if (currentTranscriptResult) {
      navigator.clipboard.writeText(currentTranscriptResult.transcript);
      document.getElementById('btn-copy-text').textContent = 'Copied!';
      setTimeout(() => document.getElementById('btn-copy-text').textContent = 'Copy Text', 2000);
    }
  });

  document.getElementById('btn-copy-time').addEventListener('click', () => {
    if (currentTranscriptResult) {
      // reconstruct with time if we have segments
      const segments = currentTranscriptResult.raw?.segments || [];
      let textToCopy = currentTranscriptResult.transcript;
      if (segments.length > 0) {
        textToCopy = segments.map(seg => {
          const timeStr = new Date(seg.offset || 0).toISOString().substr(14, 5);
          return `[${timeStr}] ${seg.text}`;
        }).join('\n');
      }
      navigator.clipboard.writeText(textToCopy);
      document.getElementById('btn-copy-time').textContent = 'Copied!';
      setTimeout(() => document.getElementById('btn-copy-time').textContent = 'Copy w/ Time', 2000);
    }
  });

  document.getElementById('btn-copy-summary').addEventListener('click', () => {
    if (currentSummary) {
      navigator.clipboard.writeText(currentSummary);
      document.getElementById('btn-copy-summary').textContent = 'Copied!';
      setTimeout(() => document.getElementById('btn-copy-summary').textContent = 'Copy', 2000);
    }
  });

});
