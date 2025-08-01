
const { ccclass, property } = _decorator;

/**
 * 微信小游戏授权管理器
 * 负责处理微信授权、登录和用户状态管理
 */
@ccclass('WeChatAuthManager')
export class WeChatAuthManager extends Component {
    
    private static instance: WeChatAuthManager = null!;
    private isLoggedIn: boolean = false;
    private userInfo: any = null;
    private loginPromise: Promise<any> | null = null;
    
    // 微信小游戏API声明
    private wx: any = null;
    
    onLoad() {
        // 单例模式
        if (WeChatAuthManager.instance) {
            this.node.destroy();
            return;
        }
        WeChatAuthManager.instance = this;
        
        // 初始化微信API
        this.initWeChatAPI();
    }
    
    /**
     * 获取单例实例
     */
    public static getInstance(): WeChatAuthManager {
        return WeChatAuthManager.instance;
    }
    
    /**
     * 初始化微信API
     */
    private initWeChatAPI() {
        // 检查是否在微信小游戏环境中
        if (typeof wx !== 'undefined') {
            this.wx = wx;
            console.log('微信小游戏环境检测成功');
        } else {
            console.warn('非微信小游戏环境，将使用模拟数据');
            this.wx = this.createMockWeChatAPI();
        }
    }
    
    /**
     * 创建模拟微信API（用于开发测试）
     */
    private createMockWeChatAPI() {
        return {
            login: (options: any) => {
                console.log('模拟微信登录');
                setTimeout(() => {
                    options.success && options.success({
                        code: 'mock_code_' + Date.now(),
                        errMsg: 'login:ok'
                    });
                }, 1000);
            },
            getUserProfile: (options: any) => {
                console.log('模拟获取用户信息');
                setTimeout(() => {
                    options.success && options.success({
                        userInfo: {
                            nickName: '测试用户',
                            avatarUrl: '',
                            gender: 1,
                            country: 'China',
                            province: 'Guangdong',
                            city: 'Shenzhen',
                            language: 'zh_CN'
                        },
                        rawData: 'mock_raw_data',
                        signature: 'mock_signature',
                        encryptedData: 'mock_encrypted_data',
                        iv: 'mock_iv',
                        cloudID: 'mock_cloud_id',
                        errMsg: 'getUserProfile:ok'
                    });
                }, 1000);
            },
            showModal: (options: any) => {
                console.log('模拟显示弹窗:', options.title);
                setTimeout(() => {
                    options.success && options.success({
                        confirm: true,
                        cancel: false,
                        errMsg: 'showModal:ok'
                    });
                }, 500);
            },
            callCloudFunction: (options: any) => {
                console.log('模拟调用云函数:', options.name);
                setTimeout(() => {
                    options.success && options.success({
                        result: {
                            success: true,
                            isNewUser: false,
                            user: {
                                id: 'mock_user_id',
                                openId: 'mock_open_id',
                                nickname: '测试用户',
                                headUrl: '',
                                score: 100,
                                medalNum: 5
                            }
                        }
                    });
                }, 1000);
            }
        };
    }
    
    /**
     * 检查用户是否已登录
     */
    public isUserLoggedIn(): boolean {
        return this.isLoggedIn;
    }
    
    /**
     * 获取用户信息
     */
    public getUserInfo(): any {
        return this.userInfo;
    }
    
    /**
     * 检查用户授权状态
     */
    public async checkAuthStatus(): Promise<boolean> {
        try {
            // 检查本地存储的登录状态
            const loginData = this.getLocalLoginData();
            if (loginData && loginData.isLoggedIn) {
                this.isLoggedIn = true;
                this.userInfo = loginData.userInfo;
                console.log('从本地存储恢复登录状态');
                return true;
            }
            
            // 尝试静默登录
            const loginResult = await this.silentLogin();
            if (loginResult.success) {
                this.isLoggedIn = true;
                this.userInfo = loginResult.user;
                this.saveLocalLoginData(loginResult);
                console.log('静默登录成功');
                return true;
            }
            
            return false;
        } catch (error) {
            console.error('检查授权状态失败:', error);
            return false;
        }
    }
    
    /**
     * 静默登录（不弹出授权框）
     */
    private async silentLogin(): Promise<any> {
        return new Promise((resolve, reject) => {
            this.wx.login({
                success: async (res: any) => {
                    try {
                        if (res.code) {
                            // 调用云函数进行登录
                            const loginResult = await this.callLoginCloudFunction(res.code);
                            resolve(loginResult);
                        } else {
                            reject(new Error('微信登录失败: ' + res.errMsg));
                        }
                    } catch (error) {
                        reject(error);
                    }
                },
                fail: (error: any) => {
                    reject(new Error('微信登录失败: ' + error.errMsg));
                }
            });
        });
    }
    
    /**
     * 显示微信授权弹窗
     */
    public async showAuthDialog(): Promise<any> {
        return new Promise((resolve, reject) => {
            // 先进行微信登录
            this.wx.login({
                success: async (loginRes: any) => {
                    if (loginRes.code) {
                        try {
                            // 获取用户信息
                            this.wx.getUserProfile({
                                desc: '用于完善用户资料',
                                success: async (userRes: any) => {
                                    try {
                                        // 调用云函数进行登录
                                        const loginResult = await this.callLoginCloudFunction(
                                            loginRes.code, 
                                            userRes.userInfo
                                        );
                                        
                                        if (loginResult.success) {
                                            this.isLoggedIn = true;
                                            this.userInfo = loginResult.user;
                                            this.saveLocalLoginData(loginResult);
                                            resolve(loginResult);
                                        } else {
                                            reject(new Error('登录失败: ' + loginResult.error));
                                        }
                                    } catch (error) {
                                        reject(error);
                                    }
                                },
                                fail: (error: any) => {
                                    reject(new Error('获取用户信息失败: ' + error.errMsg));
                                }
                            });
                        } catch (error) {
                            reject(error);
                        }
                    } else {
                        reject(new Error('微信登录失败: ' + loginRes.errMsg));
                    }
                },
                fail: (error: any) => {
                    reject(new Error('微信登录失败: ' + error.errMsg));
                }
            });
        });
    }
    
    /**
     * 调用登录云函数
     */
    private async callLoginCloudFunction(code: string, userInfo?: any): Promise<any> {
        return new Promise((resolve, reject) => {
            this.wx.cloud.callFunction({
                name: 'login',
                data: {
                    code: code,
                    userInfo: userInfo
                },
                success: (res: any) => {
                    console.log('云函数调用成功:', res);
                    resolve(res.result);
                },
                fail: (error: any) => {
                    console.error('云函数调用失败:', error);
                    reject(new Error('云函数调用失败: ' + error.errMsg));
                }
            });
        });
    }
    
    /**
     * 保存登录数据到本地存储
     */
    private saveLocalLoginData(loginResult: any) {
        try {
            const data = {
                isLoggedIn: true,
                userInfo: loginResult.user,
                timestamp: Date.now()
            };
            sys.localStorage.setItem('wechat_login_data', JSON.stringify(data));
        } catch (error) {
            console.error('保存登录数据失败:', error);
        }
    }
    
    /**
     * 从本地存储获取登录数据
     */
    private getLocalLoginData(): any {
        try {
            const data = sys.localStorage.getItem('wechat_login_data');
            if (data) {
                const loginData = JSON.parse(data);
                // 检查数据是否过期（24小时）
                if (Date.now() - loginData.timestamp < 24 * 60 * 60 * 1000) {
                    return loginData;
                }
            }
        } catch (error) {
            console.error('获取本地登录数据失败:', error);
        }
        return null;
    }
    
    /**
     * 清除本地登录数据
     */
    public clearLocalLoginData() {
        try {
            sys.localStorage.removeItem('wechat_login_data');
            this.isLoggedIn = false;
            this.userInfo = null;
        } catch (error) {
            console.error('清除登录数据失败:', error);
        }
    }
    
    /**
     * 显示隐私协议弹窗
     */
    public async showPrivacyDialog(): Promise<boolean> {
        return new Promise((resolve) => {
            this.wx.showModal({
                title: '隐私协议',
                content: '我们需要获取您的微信授权信息来提供更好的游戏体验。请阅读并同意我们的隐私协议。',
                confirmText: '同意',
                cancelText: '不同意',
                success: (res: any) => {
                    resolve(res.confirm);
                },
                fail: () => {
                    resolve(false);
                }
            });
        });
    }
    
    /**
     * 登出
     */
    public logout() {
        this.clearLocalLoginData();
        console.log('用户已登出');
    }
} 
