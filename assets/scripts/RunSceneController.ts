import { _decorator, Component, Node, director, Label, ProgressBar } from 'cc';
import { WeChatAuthManager } from './WeChatAuthManager';

const { ccclass, property } = _decorator;

@ccclass('RunSceneController')
export class RunSceneController extends Component {
    
    @property(Label)
    public loadingLabel: Label = null!;
    
    @property(ProgressBar)
    public progressBar: ProgressBar = null!;
    
    private authManager: WeChatAuthManager = null!;
    private loadingProgress: number = 0;
    
    async start() {
        console.log('Run场景开始加载...');
        
        // 初始化授权管理器
        this.authManager = WeChatAuthManager.getInstance();
        
        // 开始加载流程
        await this.startLoadingProcess();
    }
    
    /**
     * 开始加载流程
     */
    private async startLoadingProcess() {
        try {
            // 更新加载状态
            this.updateLoadingText('正在检查用户授权状态...');
            this.updateProgress(0.2);
            
            // 检查用户授权状态
            const isAuthorized = await this.authManager.checkAuthStatus();
            
            if (isAuthorized) {
                console.log('用户已授权，直接进入主菜单');
                this.updateLoadingText('用户已授权，正在进入游戏...');
                this.updateProgress(0.8);
                
                // 延迟一下让用户看到加载进度
                await this.delay(1000);
                
                // 跳转到主菜单场景
                this.loadMainMenuScene();
            } else {
                console.log('用户未授权，需要授权后进入主菜单');
                this.updateLoadingText('用户未授权，正在进入授权页面...');
                this.updateProgress(1.0);
                
                // 延迟一下让用户看到加载进度
                await this.delay(1000);
                
                // 跳转到主菜单场景（用户需要在那里进行授权）
                this.loadMainMenuScene();
            }
            
        } catch (error) {
            console.error('加载过程出错:', error);
            this.updateLoadingText('加载失败，请重试...');
            
            // 延迟后重试
            await this.delay(2000);
            this.startLoadingProcess();
        }
    }
    
    /**
     * 更新加载文本
     */
    private updateLoadingText(text: string) {
        if (this.loadingLabel) {
            this.loadingLabel.string = text;
        }
        console.log('加载状态:', text);
    }
    
    /**
     * 更新加载进度
     */
    private updateProgress(progress: number) {
        this.loadingProgress = progress;
        if (this.progressBar) {
            this.progressBar.progress = progress;
        }
    }
    
    /**
     * 延迟函数
     */
    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    /**
     * 加载主菜单场景
     */
    private loadMainMenuScene() {
        console.log('跳转到主菜单场景');
        director.loadScene('MainMenu');
    }
    
    /**
     * 获取当前加载进度
     */
    public getLoadingProgress(): number {
        return this.loadingProgress;
    }
} 