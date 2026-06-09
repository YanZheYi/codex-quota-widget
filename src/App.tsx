import React, { useState, useEffect, useRef } from 'react';
import { Settings, RefreshCw, X, Minus, Palette, Link as LinkIcon, Clock, AlertTriangle, AlertOctagon } from 'lucide-react';
import { fetch as tauriFetch } from '@tauri-apps/api/http';
import { readTextFile } from '@tauri-apps/api/fs';
import { homeDir } from '@tauri-apps/api/path';
import { appWindow, LogicalSize } from '@tauri-apps/api/window';

function useAnimatedValue(target: number, animTrigger: number) {
  const [currentInt, setCurrentInt] = useState(0);
  const [currentFloat, setCurrentFloat] = useState(0);
  const [lastTrigger, setLastTrigger] = useState(animTrigger);

  // If the trigger changed, we instantly "jump" to 0 for this render
  let renderInt = currentInt;
  let renderFloat = currentFloat;
  if (lastTrigger !== animTrigger) {
    renderInt = 0;
    renderFloat = 0;
  }

  useEffect(() => {
    if (lastTrigger !== animTrigger) {
      setLastTrigger(animTrigger);
      setCurrentInt(0);
      setCurrentFloat(0);
    }
    
    if (target === 0) return;

    let startTimestamp: number | null = null;
    let animationFrame: number;

    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / 1000, 1);
      const easeProgress = 1 - Math.pow(1 - progress, 3); // easeOutCubic
      
      const nextFloat = target * easeProgress;
      setCurrentFloat(nextFloat);
      setCurrentInt(Math.round(nextFloat));

      if (progress < 1) {
        animationFrame = window.requestAnimationFrame(step);
      }
    };
    animationFrame = window.requestAnimationFrame(step);

    return () => window.cancelAnimationFrame(animationFrame);
  }, [target, animTrigger, lastTrigger]);

  return { currentInt: renderInt, currentFloat: renderFloat };
}

function decodeJwtPayload(token: string): any {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      window.atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch (e) {
    return null;
  }
}

interface UsageData {
  planName: string;
  window5Percentage: number;
  window5ResetAt: number;
  window7Percentage: number;
  window7ResetAt: number;
  accountEmail?: string;
  accountName?: string;
  _debugAccountsData?: any;
  _debugNetworkError?: any;
  _debugWhamData?: any;
}

const DEFAULT_MOCK_DATA: UsageData = {
  planName: '无',
  window5Percentage: 100, // default to 0% remaining (100% used)
  window5ResetAt: 0,
  window7Percentage: 100, // default to 0% remaining (100% used)
  window7ResetAt: 0,
  accountEmail: '',
  accountName: '',
};

export default function App() {
  const cardRef = useRef<HTMLDivElement>(null);
  const lastFetchTimeRef = useRef<number>(0);
  const [configPath, setConfigPath] = useState(localStorage.getItem('configPath') || '~/.codex/auth.json');
  const [codexToken] = useState(localStorage.getItem('codexToken') || '');
  const [codexAccountId] = useState(localStorage.getItem('codexAccountId') || '');
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'zinc');
  const [presetUrl, setPresetUrl] = useState(localStorage.getItem('presetUrl') || 'https://chatgpt.com');
  const [yellowThreshold, setYellowThreshold] = useState(parseInt(localStorage.getItem('yellowThreshold') || '50', 10));
  const [redThreshold, setRedThreshold] = useState(parseInt(localStorage.getItem('redThreshold') || '25', 10));
  const [autoRefreshInterval, setAutoRefreshInterval] = useState(() => {
    const stored = localStorage.getItem('autoRefreshInterval');
    if (!stored) return 60;
    const val = parseInt(stored, 10);
    return val < 5 ? val * 60 : val;
  });
  
  const [data, setData] = useState<UsageData>(DEFAULT_MOCK_DATA);
  const [loading, setLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [refreshCount, setRefreshCount] = useState(0);

  const [debugAccountsData, setDebugAccountsData] = useState<any>(null);
  const [debugNetworkError, setDebugNetworkError] = useState<any>(null);
  const [debugWhamData, setDebugWhamData] = useState<any>(null);
  const [showDebug, setShowDebug] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Dynamically resize window based on card dimensions to eliminate transparent margins
  useEffect(() => {
    const isTauri = !!(window as any).__TAURI__;
    if (isTauri && cardRef.current) {
      const observer = new ResizeObserver((entries) => {
        for (let entry of entries) {
          const rect = entry.target.getBoundingClientRect();
          const newWidth = Math.ceil(rect.width);
          const newHeight = Math.ceil(rect.height);
          appWindow.setSize(new LogicalSize(newWidth, newHeight));
        }
      });
      observer.observe(cardRef.current);
      return () => observer.disconnect();
    }
  }, []);

  // Auto refresh interval setup
  useEffect(() => {
    if (autoRefreshInterval <= 0) return;
    const intervalSeconds = Math.max(autoRefreshInterval, 5);
    
    const intervalId = setInterval(() => {
      fetchData(true);
    }, intervalSeconds * 1000);
    
    return () => clearInterval(intervalId);
  }, [autoRefreshInterval, codexToken, codexAccountId, presetUrl]);

  const fetchData = async (isAutoRefresh = false) => {
    if (loading) return;
    const now = Date.now();
    if (!isAutoRefresh && now - lastFetchTimeRef.current < 3000) {
      return; // 3-second manual refresh cooldown
    }

    if (!isAutoRefresh) {
      lastFetchTimeRef.current = now;
      setLoading(true);
    }
    setDebugAccountsData(null);
    setDebugNetworkError(null);
    setDebugWhamData(null);
    setShowDebug(false);
    
    try {
      const isTauri = !!(window as any).__TAURI__;
      
      let json;
      if (isTauri) {
        // Direct fetching in Tauri
        let resolvedToken = codexToken;
        let resolvedAccountId = codexAccountId;
        let readError = null;
        let accountEmail = '';
        let accountName = '';

        if (resolvedToken) {
          const decoded = decodeJwtPayload(resolvedToken);
          if (decoded) {
            accountEmail = decoded["https://api.openai.com/profile"]?.email || decoded.email || '';
            accountName = decoded.name || '';
          }
        }
        
        if (!resolvedToken && configPath) {
          try {
             let fullPath = configPath;
             if (fullPath.startsWith('~')) {
                const home = await homeDir();
                fullPath = fullPath.replace('~', home.replace(/[\\/]+$/, ''));
             }
             const fileContent = await readTextFile(fullPath);
             const parsed = JSON.parse(fileContent);
             
             // Extract name/email from JWT tokens in file
             const idToken = parsed.tokens?.id_token || parsed.id_token || '';
             const accToken = parsed.access_token || parsed.token || parsed.codexToken || (parsed.tokens?.access_token) || '';
             
             if (idToken) {
               const decoded = decodeJwtPayload(idToken);
               if (decoded) {
                 accountEmail = decoded.email || '';
                 accountName = decoded.name || '';
               }
             }
             
             if (!accountEmail && accToken) {
               const decoded = decodeJwtPayload(accToken);
               if (decoded) {
                 accountEmail = decoded["https://api.openai.com/profile"]?.email || decoded.email || '';
                 accountName = decoded.name || '';
               }
             }

             if (!accountEmail) {
               accountEmail = parsed.user?.email || parsed.email || '';
             }
             if (!accountName) {
               accountName = parsed.user?.name || parsed.name || '';
             }

             resolvedToken = accToken;
             if (!resolvedToken) {
               readError = `在 ${fullPath} 中未找到 token。文件内容: ${JSON.stringify(parsed).substring(0, 150)}`;
             }
             if (!resolvedAccountId) {
                resolvedAccountId = parsed.account_id || parsed.accountId || parsed.codexAccountId || (parsed.tokens && parsed.tokens.account_id) || '';
             }
          } catch (err: any) {
             readError = `读取配置失败 ${configPath}: ${err.message || 'Unknown FS error'}`;
          }
        }

        if (!resolvedToken) {
           json = {
             ...DEFAULT_MOCK_DATA,
             planName: 'Plus (Mock)',
             window5Percentage: 42,
             window5ResetAt: Math.floor(Date.now() / 1000) + 7999,
             window7Percentage: 53,
             window7ResetAt: Math.floor(Date.now() / 1000) + 248000,
             accountEmail: 'mock.user@example.com',
             accountName: '游客用户',
             _debugNetworkError: readError || "No Token or Config provided. Using mock data.",
             _debugWhamData: readError ? { error: readError } : undefined
           };
        } else {
           const headers: Record<string, string> = {
             'Authorization': `Bearer ${resolvedToken}`,
             'Content-Type': 'application/json',
             'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
           };
           if (resolvedAccountId) headers['Chatgpt-Account-Id'] = resolvedAccountId;

           const baseUrl = presetUrl.replace(/\/+$/, '');
           const whamRes = await tauriFetch<any>(`${baseUrl}/backend-api/wham/usage`, {
             method: 'GET',
             headers
           });

           if (!whamRes.ok) {
             throw new Error(`wham/usage returned ${whamRes.status}`);
           }

           const whamData = whamRes.data;
           let planName = "Free";
           let needAccountCheck = true;
           if (whamData && whamData.plan_type) {
             needAccountCheck = false;
             const pt = String(whamData.plan_type).toLowerCase();
             if (pt.includes("plus") || pt.includes("pro") || pt.includes("team") || pt.includes("tier")) {
               planName = "Plus";
             }
           }

           let debugAccountsData = null;
           let debugNetworkError = null;

           if (needAccountCheck) {
             try {
                const accountRes = await tauriFetch<any>(`${baseUrl}/backend-api/accounts/check/v4-2023-04-27`, {
                  method: 'GET',
                  headers
                });
                if (accountRes.ok) {
                   debugAccountsData = accountRes.data;
                   const accountDataStr = JSON.stringify(accountRes.data).toLowerCase();
                   if (accountDataStr.includes("plus") || accountDataStr.includes("pro")) {
                     planName = "Plus";
                   }
                } else {
                   debugNetworkError = `Check account returned ${accountRes.status}`;
                }
             } catch (e: any) {
                debugNetworkError = e.message;
             }
           }

           let window5Percentage = 0;
           let window5ResetAt = 0;
           let window7Percentage = 0;
           let window7ResetAt = 0;

           if (whamData?.rate_limit?.primary_window) {
              window5Percentage = whamData.rate_limit.primary_window.used_percent || 0;
              window5ResetAt = whamData.rate_limit.primary_window.reset_at || 0;
           }
           
           if (whamData?.rate_limit?.secondary_window) {
              window7Percentage = whamData.rate_limit.secondary_window.used_percent || 0;
              window7ResetAt = whamData.rate_limit.secondary_window.reset_at || 0;
           }

           json = {
             planName,
             window5Percentage,
             window5ResetAt,
             window7Percentage,
             window7ResetAt,
             accountEmail,
             accountName,
             _debugWhamData: whamData,
             _debugAccountsData: debugAccountsData,
             _debugNetworkError: debugNetworkError
           };
        }
      } else {
        // Fallback to web proxy backend
        const response = await fetch('/api/usage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ codexToken, codexAccountId, presetUrl, configPath })
        });
        json = await response.json();
      }
      
      setData({ ...DEFAULT_MOCK_DATA, ...json });
      setDebugAccountsData(json._debugAccountsData || null);
      setDebugNetworkError(json._debugNetworkError || null);
      setDebugWhamData(json._debugWhamData || null);
      setLastRefreshed(new Date());
      setRefreshCount(c => c + 1);
      
    } catch (err: any) {
      console.warn("Failed to fetch from API", err);
      const errMsg = err?.message || (typeof err === 'string' ? err : JSON.stringify(err));
      setDebugNetworkError(errMsg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clearDebug = () => {
    setDebugAccountsData(null);
    setDebugNetworkError(null);
    setDebugWhamData(null);
    setShowDebug(false);
  };

  const handleMinimize = () => {
    try {
      if ((window as any).__TAURI__) {
        appWindow.minimize();
      }
    } catch (e) { console.error(e) }
  };

  const handleClose = () => {
    try {
      if ((window as any).__TAURI__) {
        appWindow.close();
      } else {
        window.close();
      }
    } catch (e) { console.error(e) }
  };

  const formatTimeLeft = (resetAt: number) => {
    if (!resetAt) return '';
    const now = Math.floor(Date.now() / 1000);
    const diff = resetAt - now;
    if (diff <= 0) return '已重置';
    
    const hours = Math.floor(diff / 3600);
    const minutes = Math.floor((diff % 3600) / 60);
    
    if (hours >= 24) {
       const days = Math.floor(hours / 24);
       const remainHours = hours % 24;
       return remainHours > 0 ? `${days}天${remainHours}小时后` : `${days}天后`;
    }
    return `${hours}小时${minutes}分钟后`;
  };

  const textMuted = "text-theme-muted";
  const inputClass = "bg-theme-inner border-theme-border text-theme-text placeholder:text-theme-subtle focus:border-theme-ring/50";
  const labelClass = `text-xs ${textMuted} mb-1.5 block font-medium flex items-center gap-1.5`;

  const hasDebugError = !!debugNetworkError;

  const targetPercent = 100 - (data.window5Percentage ?? 100);
  const { currentInt: displayPercent, currentFloat: displayPercentFloat } = useAnimatedValue(targetPercent, refreshCount);
  
  const getColorForPercent = (percent: number) => {
    if (percent <= redThreshold) return '#ef4444';
    if (percent <= yellowThreshold) return '#eab308';
    return 'var(--ring-color)';
  };

  const ringColor = getColorForPercent(targetPercent);
  let ringGlow = 'var(--ring-glow)';
  if (targetPercent <= redThreshold) ringGlow = 'rgba(239, 68, 68, 0.4)';
  else if (targetPercent <= yellowThreshold) ringGlow = 'rgba(234, 179, 8, 0.4)';

  let outerClass = "min-h-screen p-4 md:p-8 flex items-center justify-center font-sans bg-theme-page border-transparent transition-colors";
  if (!!(window as any).__TAURI__) {
    // In Tauri, fit the window size exactly with 0 padding/margins and allow content to define height
    outerClass = "w-full bg-transparent border-transparent p-0 font-sans";
  }

  return (
    <div className={outerClass}>
      <div 
        ref={cardRef} 
        className={`bg-theme-card w-fit max-w-md rounded-2xl overflow-hidden border border-theme-border transition-colors ${
          !!(window as any).__TAURI__ ? '' : 'shadow-xl shadow-black/20'
        }`}
      >
        
        {/* Header - Make it draggable for Tauri */}
        <div data-tauri-drag-region className="p-4 flex items-center justify-between border-b border-theme-border/80 cursor-default">
          <div className="flex items-center gap-2 pointer-events-none">
            <div className={`w-3 h-3 rounded-full ${loading ? 'bg-yellow-500 animate-pulse' : 'bg-theme-ring shadow-[0_0_10px_var(--ring-glow)]'}`}></div>
            <h1 className="text-xl font-semibold text-theme-text" data-tauri-drag-region>Codex 神力</h1>
          </div>
          <div className="flex gap-2 items-center">
             <button onClick={() => setShowSettings(!showSettings)} className="p-1.5 rounded-full hover:bg-theme-inner text-theme-muted transition-colors">
               <Settings size={16} />
             </button>
             <div className="w-px h-4 bg-theme-border mx-0.5"></div>
             <button onClick={handleMinimize} className="p-1.5 rounded-full hover:bg-theme-inner text-theme-muted transition-colors" title="最小化">
               <Minus size={16} />
             </button>
             <button onClick={handleClose} className="p-1.5 rounded-full hover:bg-red-500/20 text-theme-muted hover:text-red-400 transition-colors" title="关闭">
               <X size={16} />
             </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          
          {showSettings && (
             <div className="space-y-4 pb-6 border-b border-theme-border animate-in fade-in slide-in-from-top-2">
               <div>
                  <label className={labelClass}><Palette size={12}/> 皮肤主题 (Theme)</label>
                  <div className="flex gap-2 flex-wrap">
                    {['dark', 'light', 'zinc', 'slate', 'neutral', 'stone'].map(t => (
                      <button
                        key={t}
                        onClick={() => { setTheme(t); localStorage.setItem('theme', t); }}
                        className={`capitalize px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${theme === t ? 'bg-theme-ring/10 border-theme-ring/50 text-theme-ring' : 'bg-theme-inner/50 border-theme-inner text-theme-muted hover:bg-theme-inner'}`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
               </div>

               <div>
                  <label className={labelClass}>
                    <Clock size={12} />
                    定时刷新间隔 (秒)
                  </label>
                  <input
                    type="number"
                    min="5"
                    value={autoRefreshInterval}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10) || 0;
                      setAutoRefreshInterval(val);
                      localStorage.setItem('autoRefreshInterval', val.toString());
                    }}
                    className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none transition-colors ${inputClass}`}
                  />
                  <div className="mt-1.5 text-[10px] text-theme-subtle">
                    数据自动同步频率，最小允许配置为 5 秒
                  </div>
               </div>

               <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}><AlertTriangle size={12}/> 黄色阈值 (%)</label>
                    <input
                      type="number"
                      value={yellowThreshold}
                      onChange={(e) => { setYellowThreshold(parseInt(e.target.value) || 0); localStorage.setItem('yellowThreshold', e.target.value); }}
                      className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none transition-colors ${inputClass}`}
                    />
                  </div>
                  <div>
                    <label className={labelClass}><AlertOctagon size={12}/> 红色阈值 (%)</label>
                    <input
                      type="number"
                      value={redThreshold}
                      onChange={(e) => { setRedThreshold(parseInt(e.target.value) || 0); localStorage.setItem('redThreshold', e.target.value); }}
                      className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none transition-colors ${inputClass}`}
                    />
                  </div>
               </div>

               <div>
                  <label className={labelClass}>
                    <LinkIcon size={12} />
                    配置文件路径 (Config Path)
                  </label>
                  <input
                    type="text"
                    placeholder="~/.codex/auth.json"
                    value={configPath}
                    onChange={(e) => { setConfigPath(e.target.value); localStorage.setItem('configPath', e.target.value); }}
                    className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none transition-colors ${inputClass}`}
                  />
                  <div className="mt-1.5 text-[10px] text-theme-subtle">
                    本地客户端将监听或读取此入口的文件地址
                  </div>
               </div>
             </div>
          )}

          <div className="space-y-4">
            <div className="flex items-center justify-center gap-5">
              <div className="flex flex-col items-center">
                <div 
                  className="relative w-[150px] h-[150px] flex-shrink-0 flex items-center justify-center group"
                  title="ChatGPT 额度使用率"
                >
                  <svg className="absolute inset-0 w-full h-full transform -rotate-90" viewBox="0 0 150 150">
                    <circle
                      cx="75"
                      cy="75"
                      r="65"
                      fill="transparent"
                      stroke="currentColor"
                      strokeWidth="10"
                      className="text-theme-border"
                    />
                    <circle
                      cx="75"
                      cy="75"
                      r="65"
                      fill="transparent"
                      stroke={ringColor}
                      strokeWidth="10"
                      strokeLinecap="round"
                      strokeDasharray={408.4}
                      strokeDashoffset={408.4 - (displayPercentFloat / 100) * 408.4}
                      className="transition-colors ease-out duration-300"
                      style={{ filter: `drop-shadow(0 0 6px ${ringGlow})`, stroke: ringColor }}
                    />
                  </svg>
                  
                  <div className="absolute inset-3 bg-theme-ring/5 rounded-full group-hover:bg-theme-ring/10 transition-colors duration-300"></div>
                  
                  <div className="text-center absolute z-10 flex flex-col items-center justify-center" style={{ color: ringColor }}>
                    <div className="text-5xl font-bold drop-shadow-md">{displayPercent}</div>
                    <div className="text-xs font-bold mt-1 uppercase tracking-wider flex items-center gap-1">
                       {loading && <RefreshCw size={12} className="animate-spin" />}
                       %
                    </div>
                  </div>
                </div>
                {formatTimeLeft(data.window5ResetAt) && (
                <div className="mt-3 text-[13px] text-theme-text font-medium text-center flex items-center gap-1.5 justify-center bg-theme-inner px-2.5 py-1 rounded-full border border-theme-border/60">
                  <Clock size={13} className="text-theme-muted" />
                  <span>{formatTimeLeft(data.window5ResetAt)}</span>
                </div>
              )}
              </div>

              <div className="flex-1 space-y-3 min-w-[140px]">
                <div className="bg-theme-inner rounded-xl py-3 pl-5 pr-3 border border-theme-border">
                   <div className="text-[13px] text-theme-text mb-1">7天剩余</div>
                   <div className="text-2xl font-bold tracking-tight" style={{ color: getColorForPercent(100 - (data.window7Percentage ?? 100)) }}>
                      {100 - (data.window7Percentage ?? 100)}%
                   </div>
                   {formatTimeLeft(data.window7ResetAt) && (
                   <div className="text-[13px] text-theme-text mt-1.5 flex items-center gap-1.5">
                      <Clock size={13} className="text-theme-muted" />
                      <span>{formatTimeLeft(data.window7ResetAt)}</span>
                   </div>
                 )}
                </div>
                <div className="bg-theme-inner rounded-xl py-3 pl-5 pr-3 border border-theme-border">
                   <div className="text-[13px] text-theme-text mb-1">当前订阅</div>
                   <div className="text-base font-semibold text-theme-text">
                      {data.planName}
                   </div>
                </div>
              </div>
            </div>

            <div className="border-t border-theme-border/40 pt-3 mt-1 space-y-2.5">
              <div className="flex items-center justify-between gap-4 text-[13px] text-theme-text font-medium">
                 {/* Left: Account Info */}
                 <div 
                   className="truncate max-w-[200px] select-text cursor-text"
                   title={`${data.accountName || ''} (${data.accountEmail || ''})`}
                 >
                   {data.accountName ? `${data.accountName} (${data.accountEmail})` : (data.accountEmail || '无账号信息')}
                 </div>

                 {/* Right: Last Refresh Time with Icon */}
                 <button 
                   onClick={() => fetchData()}
                   disabled={loading}
                   className={`flex items-center gap-1.5 shrink-0 px-2 py-0.5 rounded transition-all text-theme-text font-medium ${
                     loading 
                       ? 'opacity-60 cursor-not-allowed' 
                       : 'hover:text-theme-ring hover:bg-theme-inner/60 cursor-pointer active:scale-95 active:bg-theme-inner'
                   }`}
                   title="点击手动刷新 (3秒冷却)"
                 >
                   <RefreshCw size={13} className={loading ? 'animate-spin text-theme-ring' : ''} />
                   <span>{lastRefreshed ? lastRefreshed.toLocaleTimeString() : '从未'}</span>
                 </button>
              </div>
              
              {hasDebugError && (
                <div className="flex justify-center">
                  <button 
                    onClick={() => setShowDebug(!showDebug)} 
                    className={`px-3 py-1 rounded transition-colors tracking-wider text-[10px] font-bold ${
                      showDebug ? 'bg-theme-border text-theme-text' : 'text-red-500 bg-red-500/10 hover:bg-red-500/20 shadow-sm border border-red-500/30'
                    }`}
                  >
                    错误日志 (Error)
                  </button>
                </div>
              )}
            </div>
          </div>
          
          {showDebug && hasDebugError && (
            <div className="mt-2 p-4 rounded-xl bg-black/40 border border-theme-border/80 max-h-80 overflow-y-auto custom-scrollbar animate-in fade-in slide-in-from-bottom-2">
               <div className="flex items-center justify-between mb-4 sticky top-0 bg-theme-card/80 backdrop-blur pb-2 z-10 border-b border-theme-border">
                 <h3 className="text-[11px] font-semibold text-theme-muted uppercase tracking-widest">Raw Response Data</h3>
                 <button onClick={clearDebug} className="text-xs px-3 py-1 bg-red-900/20 text-red-400 font-medium rounded hover:bg-red-900/40 transition-colors">
                   Clear Logs
                 </button>
               </div>
               
               {debugNetworkError && (
                 <div className="mb-5 last:mb-0">
                   <div className="text-xs text-red-500 mb-1.5 font-medium">Network Error</div>
                   <pre className="text-[11px] bg-red-950/20 p-3 rounded-lg text-red-300 break-all whitespace-pre-wrap border border-red-900/30">
                     {String(debugNetworkError)}
                   </pre>
                 </div>
               )}

               {debugWhamData && (
                 <div className="mb-5 last:mb-0">
                   <div className="text-xs text-theme-subtle mb-1.5 font-medium">wham/usage</div>
                   <pre className="text-[11px] text-theme-text overflow-x-auto bg-theme-inner p-3 rounded-lg border border-theme-border font-mono">
                     {JSON.stringify(debugWhamData, null, 2)}
                   </pre>
                 </div>
               )}
               
               {debugAccountsData && (
                 <div className="mb-5 last:mb-0">
                   <div className="text-xs text-theme-subtle mb-1.5 font-medium">accounts/check</div>
                   <pre className="text-[11px] text-theme-text overflow-x-auto bg-theme-inner p-3 rounded-lg border border-theme-border font-mono">
                     {JSON.stringify(debugAccountsData, null, 2)}
                   </pre>
                 </div>
               )}
            </div>
          )}

        </div>
      </div>
      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #3f3f46; border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #52525b; }
        
        [data-tauri-drag-region] {
          -webkit-app-region: drag;
        }
      `}} />
    </div>
  );
}
