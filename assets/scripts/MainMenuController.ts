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
    
    start() {
        console.log('主菜单场景开始初始化...');
        
        // 初始化授权管理器
        this.authManager = WeChatAuthManager.getInstance();
        
        // 设置按钮事件
        this.setupButtonEvents();
        
        // 检查用户登录状态
        this.checkUserLoginStatus();
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
     * 检查用户登录状态
     */
    private async checkUserLoginStatus() {
        try {
            const isLoggedIn = this.authManager.isUserLoggedIn();
            
            if (isLoggedIn) {
                console.log('用户已登录');
                this.updateStatusText('用户已登录，可以正常使用游戏功能');
            } else {
                console.log('用户未登录，需要授权');
                this.updateStatusText('请点击任意按钮进行微信授权');
            }
        } catch (error) {
            console.error('检查登录状态失败:', error);
            this.updateStatusText('登录状态检查失败，请重试');
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
        
        // 检查用户是否已登录
        if (!this.authManager.isUserLoggedIn()) {
            // 用户未登录，需要授权
            await this.handleUserAuthorization();
        } else {
            // 用户已登录，执行正常的按钮功能
            this.handleButtonFunction(buttonName);
        }
    }
    
    /**
     * 处理用户授权
     */
    private async handleUserAuthorization() {
        try {
            this.isProcessingAuth = true;
            this.updateStatusText('正在处理微信授权...');
            
            // 显示隐私协议弹窗
            const agreedToPrivacy = await this.authManager.showPrivacyDialog();
            
            if (!agreedToPrivacy) {
                this.updateStatusText('需要同意隐私协议才能继续使用');
                this.isProcessingAuth = false;
                return;
            }
            
            this.updateStatusText('正在获取微信授权...');
            
            // 显示微信授权弹窗
            const authResult = await this.authManager.showAuthDialog();
            
            if (authResult.success) {
                console.log('微信授权成功:', authResult.user);
                this.updateStatusText(`授权成功！欢迎 ${authResult.user.nickname}`);
                
                // 延迟一下让用户看到成功消息
                await this.delay(2000);
                
                // 重新检查登录状态
                this.checkUserLoginStatus();
            } else {
                console.error('微信授权失败:', authResult.error);
                this.updateStatusText('授权失败，请重试');
            }
            
        } catch (error) {
            console.error('授权过程出错:', error);
            this.updateStatusText('授权失败，请重试');
        } finally {
            this.isProcessingAuth = false;
        }
    }
    
    /**
     * 处理按钮功能
     */
    private handleButtonFunction(buttonName: string) {
        const userInfo = this.authManager.getUserInfo();
        
        switch (buttonName) {
            case 'button_menu':
                this.updateStatusText('菜单功能 - 用户: ' + (userInfo?.nickname || '未知'));
                break;
            case 'button_sotre':
                this.updateStatusText('商店功能 - 用户: ' + (userInfo?.nickname || '未知'));
                break;
            case 'button_activity':
                this.updateStatusText('双倍签到功能 - 用户: ' + (userInfo?.nickname || '未知'));
                break;
            case 'button_checkin':
                this.updateStatusText('签到功能 - 用户: ' + (userInfo?.nickname || '未知'));
                break;
            case 'button_list':
                this.updateStatusText('排行榜功能 - 用户: ' + (userInfo?.nickname || '未知'));
                break;
            case 'button_item':
                this.updateStatusText('军武库功能 - 用户: ' + (userInfo?.nickname || '未知'));
                break;
            case 'button_ach':
                this.updateStatusText('成就功能 - 用户: ' + (userInfo?.nickname || '未知'));
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
     * 检查是否正在处理授权
     */
    public isProcessingAuthorization(): boolean {
        return this.isProcessingAuth;
    }
    
    /**
     * 手动触发授权（用于测试）
     */
    public async triggerAuthorization() {
        await this.handleUserAuthorization();
    }
} 