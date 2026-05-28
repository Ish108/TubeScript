import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ArrowRight,
  Clock3,
  Copy,
  Crown,
  FileText,
  History,
  Loader2,
  LockKeyhole,
  LogOut,
  ClipboardPaste,
  Play,
  ShieldCheck,
  Sparkles,
  Star,
  Trash2,
  User,
  Zap,
  Home,
  Library,
  BarChart2,
  HelpCircle,
  Download,
  FileText as FileTextIcon,
  Search
} from 'lucide-react';
import { supabase, isSupabaseConfigured } from './supabaseClient';
import { TIERS, getTierInfo } from './tierConfig';
import jsPDF from 'jspdf';
import './styles.css';

const sampleUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

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

// Extract segments from raw result, or fallback to splitting sentences
function getSegments(result) {
  if (!result) return [];
  
  if (result.raw?.segments && Array.isArray(result.raw.segments)) {
    return result.raw.segments.map((seg, i) => ({
      id: i,
      time: formatTime(seg.offset || seg.start || 0),
      text: seg.text || seg.caption || seg.content || '',
    })).filter(seg => seg.text.trim());
  }

  // Fallback to text splitting if no raw segments exist
  const sentences = result.transcript.match(/[^.!?]+[.!?]+[\s]*/g) || [result.transcript];
  let currentTime = 0;
  return sentences.map((text, i) => {
    const seg = {
      id: i,
      time: formatTime(currentTime),
      text: text.trim()
    };
    currentTime += Math.max(2, Math.floor(text.length / 15)); // rough estimate
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
        ? supabase.auth.signUp({ email, password })
        : supabase.auth.signInWithPassword({ email, password });

    const { error } = await action;
    setLoading(false);

    if (error) {
      setStatus(error.message);
      return;
    }

    setStatus(mode === 'signup' ? 'Check your email if confirmation is enabled.' : 'Logged in successfully.');
    if (mode === 'login') onClose();
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

/* ---------- Main app ---------- */
function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [url, setUrl] = useState('');
  const [language, setLanguage] = useState('en');
  const [showAuth, setShowAuth] = useState(false);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSegmentId, setActiveSegmentId] = useState(null);

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

  async function copyTranscript() {
    if (!result?.transcript) return;
    await navigator.clipboard.writeText(result.transcript);
    // Could add a toast notification here
  }

  function downloadPDF() {
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
      const text = `[${seg.time}] ${seg.text}`;
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
          <button className="nav-item active"><Home size={18} /> Home</button>
          <button className="nav-item"><Library size={18} /> Library</button>
          <button className="nav-item"><BarChart2 size={18} /> Analytics</button>
          <button className="nav-item"><HelpCircle size={18} /> Help</button>
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
        <header className="topbar">
          <div className="workspace-title">
            <h1>Workspace</h1>
            <p>Analyzing: {result ? result.title : 'New Video'}</p>
          </div>
          
          <div className="top-actions">
            <button className="action-btn" onClick={copyTranscript} disabled={!result}>
              <Copy size={16} /> Copy Transcript
            </button>
            <button className="action-btn" onClick={downloadPDF} disabled={!result}>
              <Download size={16} /> Download PDF
            </button>
            <button className="action-btn primary" disabled={!result}>
              <Sparkles size={16} /> Summarize
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
          </div>
        </div>
      </main>

      {showAuth && <AuthPanel onClose={() => setShowAuth(false)} />}
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
