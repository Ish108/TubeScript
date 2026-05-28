export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { transcript } = req.body;
  if (!transcript) {
    return res.status(400).json({ error: 'Transcript is required' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY is not configured on the server.' });
  }

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: `Please provide a detailed but concise summary of the following video transcript:\n\n${transcript}` }
            ]
          }
        ]
      })
    });

    const data = await response.json();
    
    if (data.error) {
      throw new Error(data.error.message || 'Error from Gemini API');
    }

    const summary = data.candidates?.[0]?.content?.parts?.[0]?.text || 'No summary could be generated.';

    res.status(200).json({ summary });
  } catch (error) {
    console.error('Summarize error:', error);
    res.status(500).json({ error: 'Failed to generate summary: ' + error.message });
  }
}
