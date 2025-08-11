
import { _decorator, Component, sys } from 'cc';

const { ccclass, property } = _decorator;

/**
 * 微信小游戏授权管理器
 * 负责处理微信授权、登录和用户状态管理
 */
@ccclass('WeChatAuthManager')
export class WeChatAuthManager extends Component {
    
    private static instance: WeChatAuthManager = null!;
    
    // 授权状态
    private privacyAgreed: boolean = false;  // 隐私协议是否同意
    private hasOpenId: boolean = false;      // 是否已获取open_id
    private hasUserProfile: boolean = false; // 是否已获取头像昵称
    private userInfo: any = null;
    private openId: string = '';
    
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
        
        // 从本地存储恢复状态
        this.restoreAuthStatus();
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
        if (typeof (globalThis as any).wx !== 'undefined') {
            this.wx = (globalThis as any).wx;
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
                            avatarUrl: 'https://example.com/avatar.jpg',
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
                                headUrl: 'https://example.com/avatar.jpg',
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
     * 从本地存储恢复授权状态
     */
    private restoreAuthStatus() {
        try {
            const authData = sys.localStorage.getItem('wechat_auth_status');
            if (authData) {
                const data = JSON.parse(authData);
                this.privacyAgreed = data.privacyAgreed || false;
                this.hasOpenId = data.hasOpenId || false;
                this.hasUserProfile = data.hasUserProfile || false;
                this.userInfo = data.userInfo || null;
                this.openId = data.openId || '';
                
                console.log('从本地存储恢复授权状态:', {
                    privacyAgreed: this.privacyAgreed,
                    hasOpenId: this.hasOpenId,
                    hasUserProfile: this.hasUserProfile
                });
            }
        } catch (error) {
            console.error('恢复授权状态失败:', error);
        }
    }
    
    /**
     * 保存授权状态到本地存储
     */
    private saveAuthStatus() {
        try {
            const data = {
                privacyAgreed: this.privacyAgreed,
                hasOpenId: this.hasOpenId,
                hasUserProfile: this.hasUserProfile,
                userInfo: this.userInfo,
                openId: this.openId,
                timestamp: Date.now()
            };
            sys.localStorage.setItem('wechat_auth_status', JSON.stringify(data));
        } catch (error) {
            console.error('保存授权状态失败:', error);
        }
    }
    
    /**
     * 检查用户是否已登录（隐私协议同意 + 有open_id）
     */
    public isUserLoggedIn(): boolean {
        return this.privacyAgreed && this.hasOpenId;
    }
    
    /**
     * 检查用户是否已完成头像昵称授权
     */
    public hasUserProfileAuth(): boolean {
        return this.hasUserProfile;
    }
    
    /**
     * 获取用户信息
     */
    public getUserInfo(): any {
        return this.userInfo;
    }
    
    /**
     * 获取open_id
     */
    public getOpenId(): string {
        return this.openId;
    }
    
    /**
     * 显示微信官方隐私协议弹窗
     */
    public async showPrivacyDialog(): Promise<boolean> {
        return new Promise((resolve) => {
            // 使用微信官方API显示隐私协议弹窗
            this.wx.showModal({
                title: '隐私协议',
                content: '我们需要获取您的微信授权信息来提供更好的游戏体验。请阅读并同意我们的隐私协议。\n\n我们承诺：\n1. 仅获取必要的用户信息\n2. 严格保护用户隐私\n3. 不会泄露用户个人信息',
                confirmText: '同意',
                cancelText: '不同意',
                success: (res: any) => {
                    const agreed = res.confirm;
                    if (agreed) {
                        this.privacyAgreed = true;
                        this.saveAuthStatus();
                        console.log('用户同意隐私协议');
                    } else {
                        console.log('用户拒绝隐私协议');
                    }
                    resolve(agreed);
                },
                fail: (error: any) => {
                    console.error('显示隐私协议弹窗失败:', error);
                    resolve(false);
                }
            });
        });
    }
    
    /**
     * 静默登录获取open_id（必须在用户同意隐私协议后调用）
     */
    public async getOpenIdSilently(): Promise<{ success: boolean; openId?: string; error?: string }> {
        if (!this.privacyAgreed) {
            return {
                success: false,
                error: '用户未同意隐私协议'
            };
        }
        
        return new Promise((resolve) => {
            this.wx.login({
                success: async (res: any) => {
                    try {
                        if (res.code) {
                            // 调用云函数进行登录获取open_id
                            const loginResult = await this.callLoginCloudFunction(res.code);
                            
                            if (loginResult.success) {
                                this.hasOpenId = true;
                                this.openId = loginResult.openid;
                                this.userInfo = loginResult.user;
                                this.saveAuthStatus();
                                
                                console.log('静默登录成功，获取open_id:', this.openId);
                                resolve({
                                    success: true,
                                    openId: this.openId
                                });
                            } else {
                                resolve({
                                    success: false,
                                    error: loginResult.error || '登录失败'
                                });
                            }
                        } else {
                            resolve({
                                success: false,
                                error: '微信登录失败: ' + res.errMsg
                            });
                        }
                    } catch (error) {
                        resolve({
                            success: false,
                            error: '登录过程出错: ' + error
                        });
                    }
                },
                fail: (error: any) => {
                    resolve({
                        success: false,
                        error: '微信登录失败: ' + error.errMsg
                    });
                }
            });
        });
    }
    
    /**
     * 获取用户头像昵称授权
     */
    public async getUserProfileAuth(): Promise<{ success: boolean; userInfo?: any; error?: string }> {
        if (!this.privacyAgreed) {
            return {
                success: false,
                error: '用户未同意隐私协议'
            };
        }
        
        if (!this.hasOpenId) {
            return {
                success: false,
                error: '未获取open_id，请先完成登录'
            };
        }
        
        return new Promise((resolve) => {
            this.wx.getUserProfile({
                desc: '用于完善用户资料和游戏体验',
                success: async (res: any) => {
                    try {
                        const userInfo = res.userInfo;
                        
                        // 调用云函数更新用户信息
                        const updateResult = await this.callUpdateUserInfoCloudFunction(userInfo);
                        
                        if (updateResult.success) {
                            this.hasUserProfile = true;
                            this.userInfo = updateResult.user;
                            this.saveAuthStatus();
                            
                            console.log('获取用户头像昵称成功:', userInfo.nickName);
                            resolve({
                                success: true,
                                userInfo: this.userInfo
                            });
                        } else {
                            resolve({
                                success: false,
                                error: updateResult.error || '更新用户信息失败'
                            });
                        }
                    } catch (error) {
                        resolve({
                            success: false,
                            error: '获取用户信息失败: ' + error
                        });
                    }
                },
                fail: (error: any) => {
                    resolve({
                        success: false,
                        error: '用户拒绝授权: ' + error.errMsg
                    });
                }
            });
        });
    }
    
    /**
     * 调用登录云函数
     */
    private async callLoginCloudFunction(code: string): Promise<any> {
        return new Promise((resolve) => {
            this.wx.cloud.callFunction({
                name: 'login',
                data: {
                    code: code
                },
                success: (res: any) => {
                    console.log('登录云函数调用成功:', res);
                    resolve(res.result);
                },
                fail: (error: any) => {
                    console.error('登录云函数调用失败:', error);
                    resolve({
                        success: false,
                        error: '云函数调用失败: ' + error.errMsg
                    });
                }
            });
        });
    }
    
    /**
     * 调用更新用户信息云函数
     */
    private async callUpdateUserInfoCloudFunction(userInfo: any): Promise<any> {
        return new Promise((resolve) => {
            this.wx.cloud.callFunction({
                name: 'update_user_info',
                data: {
                    nickName: userInfo.nickName,
                    avatarUrl: userInfo.avatarUrl
                },
                success: (res: any) => {
                    console.log('更新用户信息云函数调用成功:', res);
                    resolve(res.result);
                },
                fail: (error: any) => {
                    console.error('更新用户信息云函数调用失败:', error);
                    resolve({
                        success: false,
                        error: '云函数调用失败: ' + error.errMsg
                    });
                }
            });
        });
    }
    
    /**
     * 检查并完成必要的授权流程
     * @param requireUserProfile 是否需要头像昵称授权
     */
    public async ensureAuthComplete(requireUserProfile: boolean = false): Promise<{ success: boolean; error?: string }> {
        try {
            // 1. 检查隐私协议
            if (!this.privacyAgreed) {
                const privacyResult = await this.showPrivacyDialog();
                if (!privacyResult) {
                    return {
                        success: false,
                        error: '需要同意隐私协议才能继续'
                    };
                }
            }
            
            // 2. 检查open_id
            if (!this.hasOpenId) {
                const openIdResult = await this.getOpenIdSilently();
                if (!openIdResult.success) {
                    return {
                        success: false,
                        error: openIdResult.error || '获取用户标识失败'
                    };
                }
            }
            
            // 3. 检查头像昵称授权（如果需要）
            if (requireUserProfile && !this.hasUserProfile) {
                const profileResult = await this.getUserProfileAuth();
                if (!profileResult.success) {
                    return {
                        success: false,
                        error: profileResult.error || '需要授权头像昵称才能继续'
                    };
                }
            }
            
            return { success: true };
            
        } catch (error) {
            return {
                success: false,
                error: '授权流程出错: ' + error
            };
        }
    }
    
    /**
     * 清除所有授权状态
     */
    public clearAuthStatus() {
        this.privacyAgreed = false;
        this.hasOpenId = false;
        this.hasUserProfile = false;
        this.userInfo = null;
        this.openId = '';
        
        try {
            sys.localStorage.removeItem('wechat_auth_status');
        } catch (error) {
            console.error('清除授权状态失败:', error);
        }
        
        console.log('已清除所有授权状态');
    }
    
    /**
     * 获取当前授权状态
     */
    public getAuthStatus() {
        return {
            privacyAgreed: this.privacyAgreed,
            hasOpenId: this.hasOpenId,
            hasUserProfile: this.hasUserProfile,
            userInfo: this.userInfo,
            openId: this.openId
        };
    }
} 
