import { _decorator, Component, Graphics } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('DrawLine')
export class DrawLine extends Component {
    start() {
        // 获取Graphics组件
        let graphics = this.getComponent(Graphics);
        if (!graphics) {
            graphics = this.addComponent(Graphics);
        }
        
        // 设置线条样式
        graphics.lineWidth = 2; // 线宽
        graphics.strokeColor.set(0, 0, 0, 1); // 黑色
        
        // 绘制横线 (x1, y1) 到 (x2, y2)
        const startX = -200; // 起始x坐标
        const startY = 0;    // y坐标（横线保持不变）
        const endX = 200;   // 结束x坐标
        
        graphics.moveTo(startX, startY); // 移动到起点
        graphics.lineTo(endX, startY);  // 绘制到终点
        graphics.stroke();              // 执行绘制
    }
}