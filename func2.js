const fs = require('fs');
const path = require('path');
const axios = require('axios');
const colors = require('colors');
const readline = require('readline');
const { DateTime } = require('luxon');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');

class SecurityLabsClient {
    constructor() {
        this.headers = {
            "Accept": "application/json, text/plain, */*",
            "Accept-Encoding": "gzip, deflate, br, zstd",
            "Accept-Language": "de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7",
            "Connection": "keep-alive",
            "Host": "api.securitylabs.xyz",
            "Origin": "https://node.securitylabs.xyz",
            "Referer": "https://node.securitylabs.xyz/",
            "Sec-Ch-Ua": '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
            "Sec-Ch-Ua-Mobile": "?0",
            "Sec-Ch-Ua-Platform": '"Windows"',
            "Sec-Fetch-Dest": "empty",
            "Sec-Fetch-Mode": "cors",
            "Sec-Fetch-Site": "same-site",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
        };
        this.proxies = [];
        this.maxThreads = 50;
        this.timeout = 10 * 60 * 1000; // 10 minutes
        this.loadProxies();
    }

    async log(msg, type = 'info', accountNumber) {
        const timestamp = new Date().toLocaleTimeString();
        const accountPrefix = `[Tài khoản ${accountNumber}]`;
        const ipPrefix = this.getProxyIP(accountNumber - 1) ? `[${this.getProxyIP(accountNumber - 1)}]` : '[Unknown IP]';
        let logMessage = '';
        
        switch(type) {
            case 'success':
                logMessage = `${accountPrefix}${ipPrefix} ${msg}`.green;
                break;
            case 'error':
                logMessage = `${accountPrefix}${ipPrefix} ${msg}`.red;
                break;
            case 'warning':
                logMessage = `${accountPrefix}${ipPrefix} ${msg}`.yellow;
                break;
            default:
                logMessage = `${accountPrefix}${ipPrefix} ${msg}`.blue;
        }
        
        console.log(logMessage);
    }

    getProxyIP(index) {
        return this.proxyIPs && this.proxyIPs[index];
    }

    loadProxies() {
        try {
            const proxyFile = path.join(__dirname, 'proxy.txt');
            this.proxies = fs.readFileSync(proxyFile, 'utf8')
                .replace(/\r/g, '')
                .split('\n')
                .filter(Boolean);
            this.proxyIPs = new Array(this.proxies.length).fill(null);
        } catch (error) {
            console.log('Error loading proxies: ' + error.message);
            this.proxies = [];
            this.proxyIPs = [];
        }
    }

    async checkProxyIP(proxy, index) {
        try {
            const proxyAgent = new HttpsProxyAgent(proxy);
            const response = await axios.get('https://api.ipify.org?format=json', { 
                httpsAgent: proxyAgent,
                timeout: 10000
            });
            if (response.status === 200) {
                this.proxyIPs[index] = response.data.ip;
                return response.data.ip;
            }
        } catch (error) {
            console.error(`Error checking proxy IP: ${error.message}`);
            return null;
        }
    }

    getAxiosConfig(token, index) {
        const config = {
            headers: { ...this.headers }
        };
        
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }

        if (this.proxies.length > 0 && index < this.proxies.length) {
            const proxy = this.proxies[index];
            config.httpsAgent = new HttpsProxyAgent(proxy);
        }

        return config;
    }

    async countdown(seconds) {
        for (let i = seconds; i > 0; i--) {
            const timestamp = new Date().toLocaleTimeString();
            readline.cursorTo(process.stdout, 0);
            process.stdout.write(`[${timestamp}] [*] Chờ ${i} giây để tiếp tục...`);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        readline.cursorTo(process.stdout, 0);
        readline.clearLine(process.stdout, 0);
    }

    async getUserInfo(token, index) {
        const url = "https://api.securitylabs.xyz/v1/users";
        try {
            const response = await axios.get(url, this.getAxiosConfig(token, index));
            if (response.status === 200) {
                return { 
                    success: true, 
                    balance: response.data.dipTokenBalance,
                    email: response.data.email,
                    id: response.data.id
                };
            } else {
                return { success: false, error: 'Failed to get user info' };
            }
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async getBalanceInfo(token, userId, index) {
        const url = `https://api.securitylabs.xyz/v1/users/get-balance/${userId}`;
        try {
            const response = await axios.get(url, this.getAxiosConfig(token, index));
            if (response.status === 200) {
                return { 
                    success: true, 
                    data: response.data
                };
            } else {
                return { success: false, error: 'Failed to get balance info' };
            }
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async earnTokens(token, userId, index) {
        const url = `https://api.securitylabs.xyz/v1/users/earn/${userId}`;
        try {
            const response = await axios.get(url, this.getAxiosConfig(token, index));
            if (response.status === 200) {
                return { 
                    success: true, 
                    data: response.data
                };
            } else {
                return { success: false, error: 'Failed to earn tokens' };
            }
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async activateEpoch(token, index, accountNumber) {
        const url = "https://api.securitylabs.xyz/v1/epoch/active";
        const config = this.getAxiosConfig(token, index);
        config.headers.Origin = "chrome-extension://gahmmgacnfeohncipkjfjfbdlpbfkfhi";
        
        try {
            const response = await axios.get(url, config);
            if (response.status === 200) {
                await this.log("Epoch được kích hoạt thành công", 'success', accountNumber);
                return { success: true };
            } else {
                return { success: false, error: 'Failed to activate epoch' };
            }
        } catch (error) {
            await this.log(`Lỗi kích hoạt epoch: ${error.message}`, 'error', accountNumber);
            return { success: false, error: error.message };
        }
    }

    async activateEpochLoop(token, index, accountNumber) {
        try {
            await this.activateEpoch(token, index, accountNumber);
            const randomDelay = Math.floor(Math.random() * 3 + 1) * 60000; // 1-3 phút
            await this.log(`Chờ ${randomDelay / 60000} phút trước khi kích hoạt epoch tiếp theo`, 'info', accountNumber);
            setTimeout(() => this.activateEpochLoop(token, index, accountNumber), randomDelay);
        } catch (error) {
            await this.log(`Lỗi trong activateEpochLoop: ${error.message}`, 'error', accountNumber);
            setTimeout(() => this.activateEpochLoop(token, index, accountNumber), 60000);
        }
    }

    async processAccountWithTimeout(token, index) {
        const accountNumber = index + 1;
        return new Promise(async (resolve, reject) => {
            const timeoutHandle = setTimeout(() => {
                reject(new Error('Account processing timed out'));
            }, this.timeout);

            try {
                await this.processAccount(token, index);
                clearTimeout(timeoutHandle);
                resolve();
            } catch (error) {
                clearTimeout(timeoutHandle);
                reject(error);
            }
        });
    }

    async processAccount(token, index) {
        const accountNumber = index + 1;
        
        if (this.proxies[index]) {
            try {
                await this.checkProxyIP(this.proxies[index], index);
            } catch (error) {
                await this.log(`Lỗi kiểm tra IP proxy: ${error.message}`, 'error', accountNumber);
            }
        }
        
        await this.log(`Đang kiểm tra thông tin tài khoản...`, 'info', accountNumber);
        const userInfo = await this.getUserInfo(token, index);
        
        if (!userInfo.success) {
            await this.log(`Lỗi lấy thông tin user: ${userInfo.error}`, 'error', accountNumber);
            return;
        }

        await this.log(`Email: ${userInfo.email}`, 'info', accountNumber);
        await this.log(`Balance: ${userInfo.balance}`, 'success', accountNumber);

        this.activateEpoch(token, index, accountNumber);

        const balanceInfo = await this.getBalanceInfo(token, userInfo.id, index);
        if (!balanceInfo.success) {
            await this.log(`Lỗi lấy thông tin balance: ${balanceInfo.error}`, 'error', accountNumber);
            return;
        }

        const nextMineTime = DateTime.fromISO(balanceInfo.data.dipInitMineTime).plus({ hours: 24 });
        const now = DateTime.now();

        if (now > nextMineTime) {
            const earnResult = await this.earnTokens(token, userInfo.id, index);
            if (earnResult.success) {
                await this.log(`Checkin thành công..nhận ${earnResult.data.tokensToAward} Token`, 'success', accountNumber);
            } else {
                await this.log(`Lỗi checkin: ${earnResult.error}`, 'error', accountNumber);
            }
        } else {
            const timeUntilNextMine = nextMineTime.diff(now).toFormat('hh:mm:ss');
            const nextMineTimeFormatted = nextMineTime.toFormat('HH:mm:ss dd/MM/yyyy');
            await this.log(`Thời gian checkin tiếp theo: ${timeUntilNextMine} (${nextMineTimeFormatted})`, 'warning', accountNumber);
        }
    }

    async main() {
        const dataFile = path.join(__dirname, 'data.txt');
        const tokens = fs.readFileSync(dataFile, 'utf8')
            .replace(/\r/g, '')
            .split('\n')
            .filter(Boolean);

        while (true) {
            for (let i = 0; i < tokens.length; i += this.maxThreads) {
                const batch = tokens.slice(i, i + this.maxThreads);
                const promises = batch.map((token, batchIndex) => 
                    this.processAccountWithTimeout(token, i + batchIndex)
                        .catch(error => this.log(`Error processing account ${i + batchIndex + 1}: ${error.message}`, 'error', i + batchIndex + 1))
                );

                await Promise.all(promises);
                
                if (i + this.maxThreads < tokens.length) {
                    await this.log(`Chờ 10 giây trước khi xử lý đợt tiếp theo...`, 'info', 1);
                    await new Promise(resolve => setTimeout(resolve, 10 * 1000));
                }
            }

            const randomDelay = Math.floor(Math.random() * (5 - 1 + 1) + 1) * 60 * 1000;

            await this.log(`Đã hoàn thành tất cả các tài khoản, đợi ${randomDelay / 1000} giây trước khi bắt đầu chu kỳ tiếp theo...`, 'info', 1);
            await new Promise(resolve => setTimeout(resolve, randomDelay));
        }
    }

    async retryOperation(operation, maxRetries = 3, delay = 5000) {
        for (let i = 0; i < maxRetries; i++) {
            try {
                return await operation();
            } catch (error) {
                if (i === maxRetries - 1) throw error;
                this.log(`Retry attempt ${i + 1}/${maxRetries} failed: ${error.message}`, 'warning');
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
}

if (isMainThread) {
    const client = new SecurityLabsClient();
    client.main().catch(err => {
        client.log(err.message, 'error');
        process.exit(1);
    });
}