import { execSync, spawn } from 'child_process';
import os from 'os';
import readline from 'readline';

const command = process.argv[2]; // 'dev' or 'build'
const isWin = os.platform() === 'win32';
const port = 3000;

if (!command) {
    console.error("请指定运行模式，例如：node scripts/runner.js dev");
    process.exit(1);
}

function askQuestion(query) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    return new Promise(resolve => rl.question(query, ans => {
        rl.close();
        resolve(ans);
    }));
}

async function checkAndKillPort() {
    try {
        if (isWin) {
            const netstat = execSync(`netstat -ano | findstr :${port}`).toString();
            const lines = netstat.split('\n').map(l => l.trim()).filter(l => l);
            let pidsToKill = new Set();
            for (const line of lines) {
                if (line.includes(`:${port}`)) {
                    const parts = line.split(/\s+/);
                    const pid = parts[parts.length - 1];
                    if (pid && pid !== '0') pidsToKill.add(pid);
                }
            }
            if (pidsToKill.size > 0) {
                console.log(`\x1b[33m检测到端口 ${port} 被占用！\x1b[0m`);
                const answer = await askQuestion(`是否强制关闭占用该端口的程序？(Y/N) [默认 Y]: `);
                if (!answer || answer.trim().toUpperCase() === 'Y') {
                    for (const pid of pidsToKill) {
                        try {
                            execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
                        } catch (e) {}
                    }
                    console.log(`\x1b[32m已清理占用端口的程序。\x1b[0m`);
                } else {
                    console.log(`\x1b[31m已取消操作，脚本退出。\x1b[0m`);
                    process.exit(1);
                }
            }
        } else {
            try {
                const pid = execSync(`lsof -t -i:${port}`).toString().trim();
                if (pid) {
                    console.log(`\x1b[33m检测到端口 ${port} 被占用！\x1b[0m`);
                    const answer = await askQuestion(`是否强制关闭占用该端口的程序？(Y/N) [默认 Y]: `);
                    if (!answer || answer.trim().toUpperCase() === 'Y') {
                        const pids = pid.split('\n').filter(p => p);
                        for (const p of pids) {
                            execSync(`kill -9 ${p}`, { stdio: 'ignore' });
                        }
                        console.log(`\x1b[32m已清理占用端口的程序。\x1b[0m`);
                    } else {
                        console.log(`\x1b[31m已取消操作，脚本退出。\x1b[0m`);
                        process.exit(1);
                    }
                }
            } catch (e) {
                // lsof returns error code if nothing found, ignore
            }
        }
    } catch (e) {
        // Ignore if commands fail
    }
}

async function run() {
    console.log(`\x1b[36m========================================================\x1b[0m`);
    console.log(`\x1b[36mCodex Quota Widget - 启动模式: ${command.toUpperCase()}\x1b[0m`);
    console.log(`\x1b[36m========================================================\x1b[0m`);

    await checkAndKillPort();

    const env = { ...process.env };
    const pathKey = Object.keys(env).find(k => k.toUpperCase() === 'PATH') || 'PATH';

    if (isWin) {
        console.log(`\x1b[36m正在初始化 Windows 编译环境和环境变量...\x1b[0m`);
        try {
            const proxyCmd = `powershell -NoProfile -Command "(Get-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings' -ErrorAction SilentlyContinue).ProxyServer"`;
            const proxy = execSync(proxyCmd, { encoding: 'utf-8' }).trim();
            if (proxy) {
                console.log(`\x1b[32m检测到 Windows 系统代理: ${proxy}，已自动注入到底层网络引擎！\x1b[0m`);
                env.HTTP_PROXY = `http://${proxy}`;
                env.HTTPS_PROXY = `http://${proxy}`;
            }
        } catch (e) {}

        const userProfile = process.env.USERPROFILE || '';
        const msvcPath = "C:\\Program Files (x86)\\Microsoft Visual Studio\\2022\\BuildTools\\VC\\Tools\\MSVC\\14.44.35207\\bin\\Hostx64\\x64";
        try {
            const sdkDir = execSync('powershell -NoProfile -Command "(Get-ChildItem \'C:\\Program Files (x86)\\Windows Kits\\10\\bin\' -Directory | Sort-Object Name -Descending | Select-Object -First 1).FullName"', { encoding: 'utf-8' }).trim();
            if (sdkDir) {
                env[pathKey] = `${userProfile}\\.cargo\\bin;${msvcPath};${sdkDir}\\x64;${env[pathKey]}`;
            } else {
                env[pathKey] = `${userProfile}\\.cargo\\bin;${msvcPath};${env[pathKey]}`;
            }
        } catch (e) {
            env[pathKey] = `${userProfile}\\.cargo\\bin;${msvcPath};${env[pathKey]}`;
        }
    } else {
        const home = process.env.HOME || '';
        env[pathKey] = `${home}/.cargo/bin:${env[pathKey]}`;
    }

    console.log(`\x1b[36m正在检查并安装依赖...\x1b[0m`);
    const npmCmd = isWin ? 'npm.cmd' : 'npm';
    try {
        execSync(`${npmCmd} install`, { stdio: 'inherit', env });
    } catch (e) {
        console.error('依赖安装失败！');
        process.exit(1);
    }

    console.log(`\x1b[32m启动 Tauri 环境 (${command})...\x1b[0m`);
    const child = spawn(npmCmd, ['run', 'tauri', command], { stdio: 'inherit', env, shell: isWin });

    child.on('exit', (code) => {
        if (code === 0 && command === 'build') {
            console.log(`\x1b[35m打包完成！请前往 src-tauri/target/release/bundle 目录下寻找生成的包文件。\x1b[0m`);
        }
        process.exit(code || 0);
    });
}

run();
