import { _decorator, Component, Node, Label, Button } from 'cc';
import { GridCoordinateSystem } from './GridCoordinateSystem';
import { AircraftController } from './AircraftController';
import { GameBoard } from './GameBoard';
const { ccclass, property } = _decorator;

/**
 * 游戏使用示例
 * 展示如何使用飞机拖拽和位置识别系统
 */
@ccclass('GameExample')
export class GameExample extends Component {
    
    @property(GameBoard)
    public gameBoard: GameBoard = null!;
    
    @property(Label)
    public statusLabel: Label = null!;
    
    @property(Button)
    public testButton1: Button = null!;
    
    @property(Button)
    public testButton2: Button = null!;
    
    @property(Button)
    public testButton3: Button = null!;
    
    start() {
        this.setupTestButtons();
        this.updateStatus();
    }
    
    /**
     * 设置测试按钮
     */
    private setupTestButtons() {
        if (this.testButton1) {
            this.testButton1.node.on(Button.EventType.CLICK, this.onTestButton1Click, this);
        }
        
        if (this.testButton2) {
            this.testButton2.node.on(Button.EventType.CLICK, this.onTestButton2Click, this);
        }
        
        if (this.testButton3) {
            this.testButton3.node.on(Button.EventType.CLICK, this.onTestButton3Click, this);
        }
    }
    
    /**
     * 测试按钮1：通过格子编号设置飞机位置
     */
    private onTestButton1Click() {
        // 将第一架飞机移动到格子编号50
        const aircraftController = this.gameBoard.getAllAircraftPositions()[0];
        if (aircraftController) {
            this.gameBoard.findAircraftByCellNumber(aircraftController.cellNumber)?.setPositionByCellNumber(50);
            this.updateStatus();
        }
    }
    
    /**
     * 测试按钮2：通过复数编号设置飞机位置
     */
    private onTestButton2Click() {
        // 将第一架飞机移动到复数位置 "6+8i"
        const aircraftController = this.gameBoard.getAllAircraftPositions()[0];
        if (aircraftController) {
            this.gameBoard.findAircraftByCellNumber(aircraftController.cellNumber)?.setPositionByComplexNumber("6+8i");
            this.updateStatus();
        }
    }
    
    /**
     * 测试按钮3：显示所有飞机位置信息
     */
    private onTestButton3Click() {
        this.gameBoard.updateInfoDisplay();
        this.updateStatus();
    }
    
    /**
     * 更新状态显示
     */
    private updateStatus() {
        if (!this.statusLabel) return;
        
        const positions = this.gameBoard.getAllAircraftPositions();
        let statusText = "当前状态:\n";
        
        positions.forEach((pos, index) => {
            statusText += `飞机${index + 1}: 位置${pos.complexNumber}, 格子${pos.cellNumber}\n`;
        });
        
        statusText += "\n操作说明:\n";
        statusText += "1. 拖拽飞机到任意位置\n";
        statusText += "2. 系统自动识别位置编号\n";
        statusText += "3. 点击测试按钮查看效果\n";
        
        this.statusLabel.string = statusText;
    }
    
    /**
     * 演示坐标转换功能
     */
    public demonstrateCoordinateConversion() {
        console.log("=== 坐标转换演示 ===");
        
        // 演示网格坐标转格子编号
        console.log("网格坐标 (3, 4) -> 格子编号:", GridCoordinateSystem.gridToCellNumber(3, 4));
        
        // 演示格子编号转网格坐标
        console.log("格子编号 50 -> 网格坐标:", GridCoordinateSystem.cellNumberToGrid(50));
        
        // 演示网格坐标转复数编号
        console.log("网格坐标 (6, 8) -> 复数编号:", GridCoordinateSystem.gridToComplexNumber(6, 8));
        
        // 演示复数编号转网格坐标
        console.log("复数编号 '6+8i' -> 网格坐标:", GridCoordinateSystem.complexNumberToGrid("6+8i"));
        
        // 演示位置信息
        console.log("位置信息 (5, 7):", GridCoordinateSystem.getPositionInfo(5, 7));
    }
    
    /**
     * 获取飞机位置统计
     */
    public getAircraftPositionStats() {
        const positions = this.gameBoard.getAllAircraftPositions();
        
        const stats = {
            totalAircrafts: positions.length,
            occupiedCells: positions.map(p => p.cellNumber),
            occupiedComplexNumbers: positions.map(p => p.complexNumber),
            gridCoordinates: positions.map(p => ({x: p.gridX, y: p.gridY}))
        };
        
        console.log("飞机位置统计:", stats);
        return stats;
    }
    
    /**
     * 检查飞机位置是否有效
     */
    public validateAircraftPositions() {
        const positions = this.gameBoard.getAllAircraftPositions();
        const validPositions = positions.filter(pos => 
            pos.gridX >= 1 && pos.gridX <= 12 && 
            pos.gridY >= 1 && pos.gridY <= 12
        );
        
        console.log(`有效位置: ${validPositions.length}/${positions.length}`);
        return validPositions.length === positions.length;
    }
} 