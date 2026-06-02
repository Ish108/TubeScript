import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Clock3,
  Copy,
  Loader2,
  LogOut,
  ClipboardPaste,
  Play,
  Sparkles,
  User,
  Home,
  Library,
  BarChart2,
  HelpCircle,
  Download,
  Search
} from 'lucide-react';
import { supabase, isSupabaseConfigured } from './supabaseClient';
import { getTierInfo } from './tierConfig';
import { jsPDF } from 'jspdf';
import './styles.css';

function parseVideoId(value = '') {
  const trimmed = value.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;

  try {
    const url = new URL(trimmed);
    const host = url.hostname.replace(/^www\./, '');
    if (host === 'youtu.be') return url.pathname.split('/').filter(Boolean)[0] || '';
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

function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return '00:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function getSegments(result) {
  if (!result) return [];
  
  if (result.raw?.segments && Array.isArray(result.raw.segments)) {
    return result.raw.segments.map((seg, i) => {
      let rawOffset = seg.offset !== undefined ? seg.offset : (seg.start || 0);
      return {
        id: i,
        time: formatTime(rawOffset / 1000),
        text: seg.text || seg.caption || seg.content || '',
      };
    }).filter(seg => seg.text.trim());
  }

  const sentences = result.transcript.match(/[^.!?]+[.!?]+[\s]*/g) || [result.transcript];
  let currentTime = 0;
  return sentences.map((text, i) => {
    const seg = {
      id: i,
      time: formatTime(currentTime),
      text: text.trim()
    };
    currentTime += Math.max(2, Math.floor(text.length / 15)); 
    return seg;
  });
}

/* ---------- Auth panel ---------- */
function AuthPanel({ onClose }) {
  const [mode, setMode] = useState('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setStatus('');

    const action =
      mode === 'signup'
        ? supabase.auth.signUp({ 
            email, 
            password,
            options: {
              emailRedirectTo: window.location.origin
            }
          })
        : supabase.auth.signInWithPassword({ email, password });

    const { data, error } = await action;
    setLoading(false);

    if (error) {
      setStatus(error.message);
      return;
    }

    if (mode === 'signup') {
      // If session is null after signup, email confirmation is required
      if (!data.session) {
        setStatus('Account created! Please check your email to verify your account before logging in.');
      } else {
        setStatus('Account created successfully!');
        onClose();
      }
    } else {
      setStatus('Logged in successfully.');
      onClose();
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="auth-modal" role="dialog" aria-modal="true" aria-label="Authentication">
        <div className="modal-top">
          <div>
            <h2>Login or create account</h2>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close login modal">
            ✕
          </button>
        </div>

        <div className="segmented" aria-label="Authentication mode">
          <button className={mode === 'signup' ? 'active' : ''} onClick={() => setMode('signup')}>
            Sign up
          </button>
          <button className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>
            Login
          </button>
        </div>

        <form onSubmit={submit} className="auth-form">
          <label>
            Email
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </label>
          <label>
            Password
            <input
              type="password"
              minLength={6}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          <button type="submit" disabled={loading || !isSupabaseConfigured}>
            {loading ? <Loader2 className="spin" size={18} /> : mode === 'signup' ? 'Create account' : 'Login'}
          </button>
        </form>

        {!isSupabaseConfigured && (
          <div className="message">Add Supabase values in .env, then restart the dev server.</div>
        )}
        {status && <div className="message">{status}</div>}
      </div>
    </div>
  );
}

/* ---------- Views ---------- */

function LibraryView({ session, onLoadTranscript }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session?.user?.id) {
      setLoading(false);
      return;
    }
    
    supabase
      .from('transcript_history')
      .select('*')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (!error && data) setHistory(data);
        setLoading(false);
      });
  }, [session]);

  if (!session) return <div className="view-container" style={{alignItems: 'center', justifyContent: 'center'}}><h2>Please sign in to view your library.</h2></div>;
  if (loading) return <div className="view-container" style={{alignItems: 'center', justifyContent: 'center'}}><Loader2 className="spin" size={32} /></div>;

  return (
    <div className="view-container">
      <div className="workspace-title" style={{marginBottom: '24px'}}>
        <h1>Your Library</h1>
        <p>Past transcripts generated by your account.</p>
      </div>
      
      {history.length === 0 ? (
        <div style={{color: 'var(--text-muted)'}}>No transcripts found in your history. Generate one to see it here!</div>
      ) : (
        <div className="library-grid">
          {history.map(item => (
            <div key={item.id} className="history-card" onClick={() => onLoadTranscript({
              videoId: item.video_id,
              videoUrl: item.video_url,
              title: item.title,
              channelName: item.channel_name,
              language: item.language,
              transcript: item.transcript,
              raw: item.raw_result
            }, item.video_url)}>
              <img 
                src={`https://i.ytimg.com/vi/${item.video_id}/maxresdefault.jpg`} 
                alt="Thumbnail" 
                className="history-thumb"
                onError={(e) => { e.target.src = `https://i.ytimg.com/vi/${item.video_id}/hqdefault.jpg`; }}
              />
              <div className="history-info">
                <h4>{item.title}</h4>
                <p>{new Date(item.created_at).toLocaleDateString()}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AnalyticsView({ profile, tierInfo, session }) {
  const [totalGenerations, setTotalGenerations] = useState(0);

  useEffect(() => {
    if (!session?.user?.id) return;
    supabase
      .from('transcript_history')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', session.user.id)
      .then(({ count }) => {
        if (count !== null) setTotalGenerations(count);
      });
  }, [session]);

  if (!session || !profile) return <div className="view-container" style={{alignItems: 'center', justifyContent: 'center'}}><h2>Please sign in to view analytics.</h2></div>;

  const usagePercent = tierInfo.tier.dailyLimit === Infinity ? 0 : Math.min(100, (profile.generations_today / tierInfo.tier.dailyLimit) * 100);

  return (
    <div className="view-container">
      <div className="workspace-title" style={{marginBottom: '24px'}}>
        <h1>Analytics Overview</h1>
        <p>Monitor your transcript generation usage and account statistics.</p>
      </div>
      
      <div className="analytics-grid">
        <div className="stat-card">
          <span className="stat-card-title">Total Transcripts Generated</span>
          <span className="stat-card-value">{totalGenerations}</span>
        </div>
        
        <div className="stat-card">
          <span className="stat-card-title">Generations Today</span>
          <span className="stat-card-value">
            {profile.generations_today} 
            {tierInfo.tier.dailyLimit !== Infinity && <span style={{fontSize: '16px', color: 'var(--text-muted)'}}> / {tierInfo.tier.dailyLimit}</span>}
          </span>
          {tierInfo.tier.dailyLimit !== Infinity && (
            <div className="progress-bar-container">
              <div className="progress-bar-fill" style={{width: `${usagePercent}%`}}></div>
            </div>
          )}
        </div>
        
        <div className="stat-card">
          <span className="stat-card-title">Current Plan</span>
          <span className="stat-card-value">{tierInfo.tier.label}</span>
        </div>
      </div>
    </div>
  );
}

function HelpView() {
  return (
    <div className="view-container">
      <div className="workspace-title" style={{marginBottom: '24px'}}>
        <h1>Help & FAQ</h1>
        <p>Learn how to use TubeScript effectively.</p>
      </div>
      
      <div className="help-container">
        <div className="faq-item">
          <h3>How do I generate a transcript?</h3>
          <p>Navigate to the Home view, paste any YouTube video URL into the input box, select the language, and click "Generate Transcript". The system will extract the captions and present them to you.</p>
        </div>
        
        <div className="faq-item">
          <h3>Why did my generation fail?</h3>
          <p>Videos that are private, age-restricted, or simply don't have closed captions available cannot be processed. Make sure the video is public and has captions enabled.</p>
        </div>
        
        <div className="faq-item">
          <h3>What are the tier limits?</h3>
          <p>Free users are limited to 3 transcript generations per day. Pro users have unlimited access. Re-loading past transcripts from your Library does not count towards your daily limit.</p>
        </div>
        
        <div className="faq-item">
          <h3>How do I download a PDF?</h3>
          <p>After generating or loading a transcript, simply click the "Download PDF" button at the top of the workspace. It will instantly format and download the file to your device.</p>
        </div>
      </div>
    </div>
  );
}

/* ---------- Main app ---------- */
function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [currentView, setCurrentView] = useState('home'); // 'home', 'library', 'analytics', 'help'
  
  // Home View State
  const [url, setUrl] = useState('');
  const [language, setLanguage] = useState('en');
  const [showAuth, setShowAuth] = useState(false);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSegmentId, setActiveSegmentId] = useState(null);
  
  // Summary State
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  useEffect(() => {
    setSummary(null);
  }, [result]);

  const detectedVideoId = useMemo(() => parseVideoId(url), [url]);
  const tierInfo = useMemo(() => getTierInfo(profile, session), [profile, session]);
  
  const segments = useMemo(() => getSegments(result), [result]);
  const filteredSegments = useMemo(() => {
    if (!searchQuery.trim()) return segments;
    return segments.filter(s => s.text.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [segments, searchQuery]);

  // ---- Auth listener ----
  useEffect(() => {
    if (!isSupabaseConfigured) return;

    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  // ---- Load profile on login ----
  useEffect(() => {
    if (session?.user) {
      loadProfile();
      setShowAuth(false);
    } else {
      setProfile(null);
    }
  }, [session]);

  async function loadProfile() {
    const userId = session?.user?.id;
    if (!userId) return;

    let { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error && error.code === 'PGRST116') {
      const { data: newProfile, error: insertError } = await supabase
        .from('user_profiles')
        .insert({ id: userId })
        .select()
        .single();

      if (!insertError) {
        data = newProfile;
      }
    }

    if (data) setProfile(data);
  }

  async function incrementUsage() {
    const userId = session?.user?.id;
    if (!userId || !profile) return;

    const today = new Date().toISOString().split('T')[0];
    const needsReset = profile.last_generation_date !== today;
    const newCount = needsReset ? 1 : (profile.generations_today || 0) + 1;

    const { error } = await supabase
      .from('user_profiles')
      .update({
        generations_today: newCount,
        last_generation_date: today,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

    if (!error) {
      setProfile((prev) => ({
        ...prev,
        generations_today: newCount,
        last_generation_date: today,
      }));
    }
  }

  async function generateTranscript(event) {
    event.preventDefault();
    setMessage('');

    if (!session) {
      setShowAuth(true);
      return;
    }

    if (!tierInfo.canGenerate) {
      setMessage('Daily limit reached. Upgrade to Pro for unlimited access!');
      return;
    }

    if (!detectedVideoId) {
      setMessage('Please paste a valid YouTube URL or video ID.');
      return;
    }

    setLoading(true);
    setResult(null);
    setActiveSegmentId(null);
    setSearchQuery('');

    try {
      const response = await fetch('/api/transcript', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url, language })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Transcript generation failed.');

      setResult(data);
      await incrementUsage();

      // Save to history (ignoring errors for UI flow)
      supabase.from('transcript_history').insert({
        user_id: session.user.id,
        video_id: data.videoId,
        video_url: data.videoUrl,
        title: data.title,
        channel_name: data.channelName,
        language: data.language,
        transcript: data.transcript,
        raw_result: data.raw
      }).then();

    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  function handleLoadFromLibrary(loadedResult, loadedUrl) {
    setResult(loadedResult);
    setUrl(loadedUrl);
    setCurrentView('home');
    setActiveSegmentId(null);
    setSearchQuery('');
    setMessage('');
  }

  async function copyTranscript(withTimestamps = false) {
    if (!result?.transcript) return;
    let textToCopy = result.transcript;
    if (withTimestamps) {
      textToCopy = segments.map(seg => `[${seg.time}] ${seg.text}`).join('\n');
    }
    await navigator.clipboard.writeText(textToCopy);
  }

  async function generateSummary() {
    if (!result?.transcript) return;
    setSummaryLoading(true);
    try {
      const response = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ transcript: result.transcript })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setSummary(data.summary);
    } catch (error) {
      alert("Error generating summary: " + error.message);
    } finally {
      setSummaryLoading(false);
    }
  }

  async function copySummary() {
    if (!summary) return;
    await navigator.clipboard.writeText(summary);
  }

  function downloadPDF(withTimestamps = true) {
    if (!result?.transcript) return;
    
    const doc = new jsPDF();
    const margin = 15;
    const pageWidth = doc.internal.pageSize.getWidth();
    const maxLineWidth = pageWidth - margin * 2;
    
    // Add title
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    const titleLines = doc.splitTextToSize(result.title || 'Transcript', maxLineWidth);
    doc.text(titleLines, margin, 20);
    
    // Add channel & info
    let y = 20 + (titleLines.length * 7);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 100, 100);
    doc.text(`Channel: ${result.channelName || 'Unknown'} | Video ID: ${result.videoId}`, margin, y);
    y += 10;
    
    // Add transcript segments
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(11);
    
    segments.forEach(seg => {
      const text = withTimestamps ? `[${seg.time}] ${seg.text}` : seg.text;
      const lines = doc.splitTextToSize(text, maxLineWidth);
      
      // Check page break
      if (y + (lines.length * 5) > doc.internal.pageSize.getHeight() - margin) {
        doc.addPage();
        y = 20;
      }
      
      doc.text(lines, margin, y);
      y += (lines.length * 6);
    });
    
    doc.save(`transcript_${result.videoId}.pdf`);
  }

  async function signOut() {
    await supabase.auth.signOut();
    setResult(null);
    setProfile(null);
    setCurrentView('home');
  }

  const generateDisabled = loading || (!tierInfo.canGenerate && !!session);

  return (
    <div className="app-shell">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="brand">
          TubeScript
        </div>
        
        <nav className="nav-menu">
          <button className={`nav-item ${currentView === 'home' ? 'active' : ''}`} onClick={() => setCurrentView('home')}><Home size={18} /> Home</button>
          <button className={`nav-item ${currentView === 'library' ? 'active' : ''}`} onClick={() => setCurrentView('library')}><Library size={18} /> Library</button>
          <button className={`nav-item ${currentView === 'analytics' ? 'active' : ''}`} onClick={() => setCurrentView('analytics')}><BarChart2 size={18} /> Analytics</button>
          <button className={`nav-item ${currentView === 'help' ? 'active' : ''}`} onClick={() => setCurrentView('help')}><HelpCircle size={18} /> Help</button>
        </nav>

        <div className="sidebar-bottom">
          {session ? (
            <>
              <div className="user-profile">
                <div className="avatar">
                  <User size={20} color="#94a3b8" />
                </div>
                <div className="user-info">
                  <span className="user-name">Premium Account</span>
                  <span className="user-tier">{tierInfo.tier.label} User</span>
                </div>
              </div>
              {tierInfo.tier.key !== 'pro' && (
                <button className="sidebar-btn btn-upgrade" disabled>
                  Upgrade to Executive
                </button>
              )}
              <button className="sidebar-btn btn-logout" onClick={signOut}>
                <LogOut size={16} /> Log Out
              </button>
            </>
          ) : (
            <button className="sidebar-btn btn-upgrade" onClick={() => setShowAuth(true)}>
              Sign In
            </button>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        
        {currentView === 'home' && (
          <>
            <header className="topbar">
              <div className="workspace-title">
                <h1>Workspace</h1>
                <p>Analyzing: {result ? result.title : 'New Video'}</p>
              </div>
              
              <div className="top-actions">
                <button className="action-btn" onClick={() => copyTranscript(false)} disabled={!result} title="Copy Text Only">
                  <Copy size={16} /> Copy Text
                </button>
                <button className="action-btn" onClick={() => copyTranscript(true)} disabled={!result} title="Copy with Timestamps">
                  <Clock3 size={16} /> Copy Time
                </button>
                <button className="action-btn" onClick={() => downloadPDF(false)} disabled={!result} title="Download PDF Text Only">
                  <Download size={16} /> PDF Text
                </button>
                <button className="action-btn" onClick={() => downloadPDF(true)} disabled={!result} title="Download PDF with Timestamps">
                  <Download size={16} /> PDF Time
                </button>
                <button className="action-btn primary" onClick={generateSummary} disabled={!result || summaryLoading}>
                  {summaryLoading ? <Loader2 className="spin" size={16} /> : <Sparkles size={16} />} Summarize
                </button>
              </div>
            </header>

            <div className="workspace-grid">
              {/* Left Column: Video & Form */}
              <div className="video-column">
                <div className="video-card">
                  <div className="video-player-mock">
                    {detectedVideoId ? (
                      <img src={`https://i.ytimg.com/vi/${detectedVideoId}/maxresdefault.jpg`} alt="Thumbnail" className="video-thumbnail" 
                           onError={(e) => { e.target.src = `https://i.ytimg.com/vi/${detectedVideoId}/hqdefault.jpg`; }}/>
                    ) : (
                      <div style={{color: 'var(--text-muted)'}}>No Video Selected</div>
                    )}
                    {detectedVideoId && (
                      <div className="play-btn-mock">
                        <Play fill="currentColor" size={20} />
                      </div>
                    )}
                  </div>
                  <div className="video-info">
                    <h2>{result ? result.title : 'Ready to analyze'}</h2>
                    <p>{result ? (result.channelName || 'YouTube Video') : 'Enter a YouTube URL below to extract and analyze the transcript.'}</p>
                    {result && (
                      <div className="video-stats">
                        <span className="stat"><Clock3 size={14}/> {segments.length > 0 ? segments[segments.length-1].time : '00:00'}</span>
                        <span>•</span>
                        <span className="stat"><User size={14}/> {tierInfo.tier.label} limit: {tierInfo.remaining} left</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="input-card">
                  <h3>Extract New Transcript</h3>
                  <form className="url-form" onSubmit={generateTranscript}>
                    <div className="input-group">
                      <label>YouTube URL</label>
                      <div className="input-with-icon">
                        <input 
                          type="text" 
                          value={url} 
                          onChange={(e) => setUrl(e.target.value)} 
                          placeholder="https://youtube.com/watch?v=..."
                        />
                        <button type="button" className="icon-btn" onClick={async () => {
                          const text = await navigator.clipboard.readText();
                          setUrl(text);
                        }}>
                          <ClipboardPaste size={16} />
                        </button>
                      </div>
                    </div>
                    
                    <div className="input-group">
                      <label>Language</label>
                      <div className="input-with-icon">
                        <select value={language} onChange={(e) => setLanguage(e.target.value)}>
                          <option value="en">English</option>
                          <option value="es">Spanish</option>
                          <option value="fr">French</option>
                          <option value="de">German</option>
                          <option value="hi">Hindi</option>
                        </select>
                      </div>
                    </div>

                    <button className="generate-btn" disabled={generateDisabled}>
                      {loading ? <Loader2 className="spin" size={18} /> : 'Generate Transcript'}
                    </button>
                    {message && <div className="message">{message}</div>}
                  </form>
                </div>
              </div>

              {/* Right Column: Transcript Panel */}
              <div className="transcript-panel">
                <div className="panel-header">
                  <div className="panel-title">
                    <h2>Transcript</h2>
                    <span className="badge">Auto-Generated</span>
                  </div>
                  <div className="search-box">
                    <Search size={16} />
                    <input 
                      type="text" 
                      placeholder="Search transcript..." 
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      disabled={!result}
                    />
                  </div>
                </div>
                
                <div className="segments-list">
                  {!result ? (
                    <div style={{padding: '32px', textAlign: 'center', color: 'var(--text-muted)'}}>
                      No transcript generated yet.
                    </div>
                  ) : filteredSegments.length === 0 ? (
                    <div style={{padding: '32px', textAlign: 'center', color: 'var(--text-muted)'}}>
                      No results found for "{searchQuery}"
                    </div>
                  ) : (
                    filteredSegments.map((seg) => (
                      <div 
                        key={seg.id} 
                        className={`segment ${activeSegmentId === seg.id ? 'active' : ''}`}
                        onClick={() => setActiveSegmentId(seg.id)}
                      >
                        <div className="segment-time">{seg.time}</div>
                        <div className="segment-text">{seg.text}</div>
                      </div>
                    ))
                  )}
                </div>

                {summary && (
                  <div className="summary-box">
                    <div className="summary-header">
                      <h3><Sparkles size={16}/> AI Summary</h3>
                      <button className="action-btn" onClick={copySummary} title="Copy Summary">
                        <Copy size={14}/> Copy
                      </button>
                    </div>
                    <div className="summary-content">
                      {summary}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {currentView === 'library' && (
          <LibraryView session={session} onLoadTranscript={handleLoadFromLibrary} />
        )}
        
        {currentView === 'analytics' && (
          <AnalyticsView profile={profile} tierInfo={tierInfo} session={session} />
        )}

        {currentView === 'help' && (
          <HelpView />
        )}

      </main>

      {showAuth && <AuthPanel onClose={() => setShowAuth(false)} />}
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
