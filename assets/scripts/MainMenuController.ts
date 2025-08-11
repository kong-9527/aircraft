import { _decorator, Component, Node, Button, Label } from 'cc';
import { WeChatAuthManager } from './WeChatAuthManager';

const { ccclass, property } = _decorator;

@ccclass('MainMenuController')
export class MainMenuController extends Component {
    
    @property(Button)
    public buttonMenu: Button = null!;
    
    @property(Button)
    public buttonStore: Button = null!;
    
    @property(Button)
    public buttonActivity: Button = null!;
    
    @property(Button)
    public buttonCheckin: Button = null!;
    
    @property(Button)
    public buttonList: Button = null!;
    
    @property(Button)
    public buttonItem: Button = null!;
    
    @property(Button)
    public buttonAch: Button = null!;
    
    @property(Label)
    public statusLabel: Label = null!;
    
    private authManager: WeChatAuthManager = null!;
    private isProcessingAuth: boolean = false;
    private hasInitialized: boolean = false;
    
    start() {
        console.log('主菜单场景开始初始化...');
        
        // 初始化授权管理器
        this.authManager = WeChatAuthManager.getInstance();
        
        // 设置按钮事件
        this.setupButtonEvents();
        
        // 延迟一帧后开始授权流程，确保场景完全渲染
        this.scheduleOnce(() => {
            this.initializeAuthFlow();
        }, 0);
    }
    
    /**
     * 设置按钮事件
     */
    private setupButtonEvents() {
        // 为所有按钮添加点击事件
        const buttons = [
            this.buttonMenu,
            this.buttonStore,
            this.buttonActivity,
            this.buttonCheckin,
            this.buttonList,
            this.buttonItem,
            this.buttonAch
        ];
        
        buttons.forEach(button => {
            if (button) {
                button.node.on(Button.EventType.CLICK, this.onButtonClick, this);
            }
        });
    }
    
    /**
     * 初始化授权流程
     */
    private async initializeAuthFlow() {
        if (this.hasInitialized) {
            return;
        }
        
        this.hasInitialized = true;
        console.log('开始初始化授权流程...');
        
        try {
            // 检查用户是否已经完成基础授权
            if (!this.authManager.isUserLoggedIn()) {
                // 用户未完成基础授权，显示隐私协议弹窗
                await this.showPrivacyDialogAndGetOpenId();
            } else {
                // 用户已完成基础授权，更新状态
                this.updateStatusText('用户已登录，可以正常使用游戏功能');
                console.log('用户已完成基础授权');
            }
        } catch (error) {
            console.error('初始化授权流程失败:', error);
            this.updateStatusText('初始化失败，请重试');
        }
    }
    
    /**
     * 显示隐私协议弹窗并获取open_id
     */
    private async showPrivacyDialogAndGetOpenId() {
        try {
            this.updateStatusText('正在显示隐私协议...');
            
            // 显示隐私协议弹窗
            const agreedToPrivacy = await this.authManager.showPrivacyDialog();
            
            if (!agreedToPrivacy) {
                this.updateStatusText('需要同意隐私协议才能继续使用游戏');
                return;
            }
            
            this.updateStatusText('正在获取用户标识...');
            
            // 获取open_id（静默登录）
            const openIdResult = await this.authManager.getOpenIdSilently();
            
            if (openIdResult.success) {
                console.log('成功获取open_id:', openIdResult.openId);
                this.updateStatusText('登录成功！可以开始游戏了');
                
                // 延迟一下让用户看到成功消息
                await this.delay(2000);
                this.updateStatusText('点击任意按钮开始游戏');
            } else {
                console.error('获取open_id失败:', openIdResult.error);
                this.updateStatusText('登录失败，请重试');
            }
            
        } catch (error) {
            console.error('隐私协议流程失败:', error);
            this.updateStatusText('授权失败，请重试');
        }
    }
    
    /**
     * 按钮点击事件处理
     */
    private async onButtonClick(event: any) {
        if (this.isProcessingAuth) {
            console.log('正在处理授权，请稍候...');
            return;
        }
        
        const buttonNode = event.target;
        const buttonName = buttonNode.name;
        
        console.log('按钮被点击:', buttonName);
        
        // 根据按钮类型确定需要的授权级别
        const authLevel = this.getButtonAuthLevel(buttonName);
        
        // 检查并完成必要的授权
        const authResult = await this.checkAndCompleteAuth(authLevel);
        
        if (authResult.success) {
            // 授权完成，执行按钮功能
            this.handleButtonFunction(buttonName);
        } else {
            // 授权失败，显示错误信息
            this.updateStatusText(authResult.error || '授权失败，请重试');
        }
    }
    
    /**
     * 获取按钮需要的授权级别
     */
    private getButtonAuthLevel(buttonName: string): 'basic' | 'profile' {
        // 需要头像昵称授权的按钮
        const profileButtons = [
            'button_list',      // 排行榜
            'button_menu'       // 菜单按钮（设置等）
        ];
        
        // 只需要基础授权（隐私协议+open_id）的按钮
        const basicButtons = [
            'button_sotre',     // 商店
            'button_activity',  // 活动
            'button_checkin',   // 签到
            'button_item',      // 武器库
            'button_ach'        // 成就
        ];
        
        if (profileButtons.indexOf(buttonName) !== -1) {
            return 'profile';
        } else if (basicButtons.indexOf(buttonName) !== -1) {
            return 'basic';
        } else {
            // 默认需要基础授权
            return 'basic';
        }
    }
    
    /**
     * 检查并完成必要的授权
     */
    private async checkAndCompleteAuth(authLevel: 'basic' | 'profile'): Promise<{ success: boolean; error?: string }> {
        try {
            this.isProcessingAuth = true;
            
            // 使用授权管理器的统一授权检查方法
            const requireUserProfile = authLevel === 'profile';
            const authResult = await this.authManager.ensureAuthComplete(requireUserProfile);
            
            if (authResult.success) {
                console.log('授权检查完成，级别:', authLevel);
                return { success: true };
            } else {
                return {
                    success: false,
                    error: authResult.error || '授权失败'
                };
            }
            
        } catch (error) {
            console.error('授权检查失败:', error);
            return {
                success: false,
                error: '授权过程出错: ' + error
            };
        } finally {
            this.isProcessingAuth = false;
        }
    }
    
    /**
     * 处理按钮功能
     */
    private handleButtonFunction(buttonName: string) {
        const userInfo = this.authManager.getUserInfo();
        const openId = this.authManager.getOpenId();
        
        switch (buttonName) {
            case 'button_menu':
                this.updateStatusText('菜单功能 - 用户: ' + (userInfo?.nickname || '未知') + ' (ID: ' + openId + ')');
                // 这里可以打开菜单界面，包含设置等功能
                break;
            case 'button_sotre':
                this.updateStatusText('商店功能 - 用户: ' + (userInfo?.nickname || '未知') + ' (ID: ' + openId + ')');
                // 这里可以打开商店界面
                break;
            case 'button_activity':
                this.updateStatusText('活动功能 - 用户: ' + (userInfo?.nickname || '未知') + ' (ID: ' + openId + ')');
                // 这里可以打开活动界面
                break;
            case 'button_checkin':
                this.updateStatusText('签到功能 - 用户: ' + (userInfo?.nickname || '未知') + ' (ID: ' + openId + ')');
                // 这里可以打开签到界面
                break;
            case 'button_list':
                this.updateStatusText('排行榜功能 - 用户: ' + (userInfo?.nickname || '未知') + ' (ID: ' + openId + ')');
                // 这里可以打开排行榜界面
                break;
            case 'button_item':
                this.updateStatusText('武器库功能 - 用户: ' + (userInfo?.nickname || '未知') + ' (ID: ' + openId + ')');
                // 这里可以打开武器库界面
                break;
            case 'button_ach':
                this.updateStatusText('成就功能 - 用户: ' + (userInfo?.nickname || '未知') + ' (ID: ' + openId + ')');
                // 这里可以打开成就界面
                break;
            default:
                this.updateStatusText('未知按钮: ' + buttonName);
                break;
        }
    }
    
    /**
     * 更新状态文本
     */
    private updateStatusText(text: string) {
        if (this.statusLabel) {
            this.statusLabel.string = text;
        }
        console.log('状态更新:', text);
    }
    
    /**
     * 延迟函数
     */
    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    /**
     * 获取当前用户信息
     */
    public getCurrentUserInfo(): any {
        return this.authManager.getUserInfo();
    }
    
    /**
     * 获取当前open_id
     */
    public getCurrentOpenId(): string {
        return this.authManager.getOpenId();
    }
    
    /**
     * 检查是否正在处理授权
     */
    public isProcessingAuthorization(): boolean {
        return this.isProcessingAuth;
    }
    
    /**
     * 获取当前授权状态
     */
    public getAuthStatus() {
        return this.authManager.getAuthStatus();
    }
    
    /**
     * 手动触发隐私协议弹窗（用于测试）
     */
    public async triggerPrivacyDialog() {
        await this.showPrivacyDialogAndGetOpenId();
    }
    
    /**
     * 手动触发头像昵称授权（用于测试）
     */
    public async triggerUserProfileAuth() {
        try {
            this.isProcessingAuth = true;
            this.updateStatusText('正在获取头像昵称授权...');
            
            const result = await this.authManager.getUserProfileAuth();
            
            if (result.success) {
                this.updateStatusText('头像昵称授权成功！');
            } else {
                this.updateStatusText('头像昵称授权失败: ' + result.error);
            }
        } catch (error) {
            this.updateStatusText('授权过程出错: ' + error);
        } finally {
            this.isProcessingAuth = false;
        }
    }
    
    /**
     * 清除所有授权状态（用于测试）
     */
    public clearAllAuth() {
        this.authManager.clearAuthStatus();
        this.updateStatusText('已清除所有授权状态，请重新授权');
    }
} 