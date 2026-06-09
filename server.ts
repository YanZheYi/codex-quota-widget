import express from 'express';
import { createServer as createViteServer } from 'vite';
import fs from 'fs';
import path from 'path';
import os from 'os';

function resolveTilde(filePath: string) {
  if (!filePath || typeof filePath !== 'string') return '';
  if (filePath.startsWith('~/') || filePath === '~') {
    return filePath.replace('~', os.homedir());
  }
  return filePath;
}

function decodeJwtPayload(token: string): any {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = Buffer.from(parts[1], 'base64').toString('utf-8');
    return JSON.parse(payload);
  } catch (e) {
    return null;
  }
}

async function createServer() {
  const app = express();
  app.use(express.json());

  app.post('/api/usage', async (req, res) => {
    let { codexToken, codexAccountId, configPath } = req.body;
    let accountEmail = '';
    let accountName = '';
    
    // Try to read token from file if not directly provided
    let readError = null;
    if (!codexToken && configPath) {
      try {
        const fullPath = resolveTilde(configPath);
        if (fs.existsSync(fullPath)) {
          const fileContent = fs.readFileSync(fullPath, 'utf-8');
          const parsed = JSON.parse(fileContent);
          
          // Decode JWT payloads
          const idToken = parsed.tokens?.id_token || parsed.id_token || '';
          const accToken = parsed.access_token || parsed.token || parsed.codexToken || (parsed.tokens && parsed.tokens.access_token) || '';
          
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

          codexToken = accToken;
          if (!codexToken) {
            readError = `配置文件加载成功，但是没有在 ${fullPath} 中找到 token/access_token 字段`;
          }
          if (!codexAccountId) {
            codexAccountId = parsed.account_id || parsed.accountId || parsed.codexAccountId || (parsed.tokens && parsed.tokens.account_id) || '';
          }
        } else {
          readError = `找不到配置文件: ${fullPath}`;
        }
      } catch (err: any) {
        readError = `读取配置文件失败 ${configPath}: ${err.message}`;
      }
    } else if (codexToken) {
      // Decode if codexToken was passed directly
      const decoded = decodeJwtPayload(codexToken);
      if (decoded) {
        accountEmail = decoded["https://api.openai.com/profile"]?.email || decoded.email || '';
        accountName = decoded.name || '';
      }
    }
    
    if (!codexToken) {
      // Mock data when no token is provided for demonstration
      return res.json({
        planName: 'Plus (Mock)',
        window5Percentage: 42,
        window5ResetAt: Math.floor(Date.now() / 1000) + 7999,
        window7Percentage: 53,
        window7ResetAt: Math.floor(Date.now() / 1000) + 248000,
        accountEmail: 'mock.user@example.com',
        accountName: '游客用户',
        _debugNetworkError: readError || "No Token or Config provided. Using mock data.",
        _debugWhamData: readError ? { error: readError } : undefined
      });
    }

    try {
      const headers: Record<string, string> = {
        'Authorization': `Bearer ${codexToken}`,
        'Content-Type': 'application/json'
      };
      
      if (codexAccountId) {
         headers['Chatgpt-Account-Id'] = codexAccountId;
      }

      const whamUrl = 'https://chatgpt.com/backend-api/wham/usage';
      const response = await fetch(whamUrl, { headers });
      const whamData = await response.json();

      let planName = "Free";
      let needAccountCheck = true;
      if (whamData.plan_type) {
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
          const checkAccountUrl = "https://chatgpt.com/backend-api/accounts/check/v4-2023-04-27";
          const accountRes = await fetch(checkAccountUrl, { headers });
          if (accountRes.ok) {
            const accountData = await accountRes.json();
            debugAccountsData = accountData;
            
            // fallback logic
            const accountDataStr = JSON.stringify(accountData).toLowerCase();
            if (accountDataStr.includes("plus") || accountDataStr.includes("pro")) {
               planName = "Plus";
            }
          } else {
             debugNetworkError = `Check account returned ${accountRes.status}`;
          }
        } catch (e: any) {
          debugNetworkError = e.message;
          console.error("Error fetching account plan:", e);
        }
      }

      let window5Percentage = 0;
      let window5ResetAt = 0;
      let window7Percentage = 0;
      let window7ResetAt = 0;

      // Extract usage limits
      if (whamData.rate_limit) {
         if (whamData.rate_limit.primary_window) {
            window5Percentage = whamData.rate_limit.primary_window.used_percent || 0;
            window5ResetAt = whamData.rate_limit.primary_window.reset_at || 0;
         }
      }

      res.json({
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
      });
    } catch (err: any) {
      res.json({
         planName: '无',
         window5Percentage: 100,
         window5ResetAt: 0,
         window7Percentage: 100,
         window7ResetAt: 0,
         _debugNetworkError: err.message
      });
    }
  });

  if (process.env.NODE_ENV === 'production') {
     app.use(express.static('dist', { index: false }));
     app.use('*', async (req, res, next) => {
       try {
         let template = fs.readFileSync(path.resolve('dist/index.html'), 'utf-8');
         res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
       } catch (e) {
         next(e);
       }
     });
  } else {
     const vite = await createViteServer({
       server: { middlewareMode: true },
       appType: 'spa'
     });
     app.use(vite.middlewares);
  }

  app.listen(3000, () => {
    console.log('Server running on port 3000');
  });
}

createServer();
