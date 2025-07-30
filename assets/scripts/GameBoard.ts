import { _decorator, Component, Node, Graphics, Color, Label, Button, EditBox } from 'cc';
import { GridCoordinateSystem } from './GridCoordinateSystem';
import { AircraftController } from './AircraftController';
const { ccclass, property } = _decorator;

/**
 * 游戏棋盘管理类
 * 处理12x12棋盘的显示和飞机管理
 */
@ccclass('GameBoard')
export class GameBoard extends Component {
    
    @property(Graphics)
    public gridGraphics: Graphics = null!;
    
    @property(Node)
    public aircraftContainer: Node = null!;
    
    @property(Label)
    public infoLabel: Label = null!;
    
    @property(EditBox)
    public cellNumberInput: EditBox = null!;
    
    @property(EditBox)
    public complexNumberInput: EditBox = null!;
    
    @property(Button)
    public setPositionButton: Button = null!;
    
    // 棋盘尺寸
    private readonly BOARD_SIZE = 600;
    private readonly CELL_SIZE = 50;
    
    // 飞机控制器列表
    private aircraftControllers: AircraftController[] = [];
    
    start() {
        this.drawGrid();
        this.setupUI();
        this.createAircrafts();
    }
    
    /**
     * 绘制12x12网格
     */
    private drawGrid() {
        if (!this.gridGraphics) return;
        
        this.gridGraphics.clear();
        this.gridGraphics.lineWidth = 1;
        this.gridGraphics.strokeColor = new Color(100, 100, 100, 255);
        
        // 绘制垂直线
        for (let i = 0; i <= 12; i++) {
            const x = i * this.CELL_SIZE;
            this.gridGraphics.moveTo(x, 0);
            this.gridGraphics.lineTo(x, this.BOARD_SIZE);
        }
        
        // 绘制水平线
        for (let i = 0; i <= 12; i++) {
            const y = i * this.CELL_SIZE;
            this.gridGraphics.moveTo(0, y);
            this.gridGraphics.lineTo(this.BOARD_SIZE, y);
        }
        
        this.gridGraphics.stroke();
        
        // 绘制坐标标签
        this.drawCoordinateLabels();
    }
    
    /**
     * 绘制坐标标签
     */
    private drawCoordinateLabels() {
        // 这里可以添加坐标标签的绘制逻辑
        // 由于Cocos Creator的Graphics组件不支持文本绘制
        // 建议使用Label节点来显示坐标
    }
    
    /**
     * 设置UI事件
     */
    private setupUI() {
        if (this.setPositionButton) {
            this.setPositionButton.node.on(Button.EventType.CLICK, this.onSetPositionClick, this);
        }
    }
    
    /**
     * 创建飞机
     */
    private createAircrafts() {
        // 根据图像中的位置创建飞机
        const aircraftPositions = [
            {x: 1, y: 5},   // 黑色圆点1
            {x: 3, y: 12},  // 黑色圆点2
            {x: 10, y: 1},  // 黑色圆点3
            {x: 11, y: 9}   // 黑色圆点4
        ];
        
        aircraftPositions.forEach((pos, index) => {
            this.createAircraft(pos.x, pos.y, index);
        });
    }
    
    /**
     * 创建单个飞机
     */
    private createAircraft(gridX: number, gridY: number, aircraftIndex: number) {
        // 创建飞机节点
        const aircraftNode = new Node(`Aircraft_${aircraftIndex}`);
        aircraftNode.setParent(this.aircraftContainer);
        
        // 添加飞机控制器组件
        const aircraftController = aircraftNode.addComponent(AircraftController);
        aircraftController.boardNode = this.node;
        aircraftController.aircraftNode = aircraftNode;
        aircraftController.positionLabel = this.infoLabel;
        
        // 设置飞机初始位置
        aircraftController.setAircraftPosition(gridX, gridY);
        
        // 添加到控制器列表
        this.aircraftControllers.push(aircraftController);
        
        // 绘制飞机（10个点）
        this.drawAircraft(aircraftNode, gridX, gridY, aircraftIndex);
    }
    
    /**
     * 绘制飞机
     */
    private drawAircraft(aircraftNode: Node, gridX: number, gridY: number, aircraftIndex: number) {
        // 计算飞机在屏幕上的位置
        const screenX = (gridX - 1) * this.CELL_SIZE + this.CELL_SIZE / 2;
        const screenY = (gridY - 1) * this.CELL_SIZE + this.CELL_SIZE / 2;
        
        aircraftNode.setPosition(screenX, screenY, 0);
        
        // 创建飞机的图形组件
        const aircraftGraphics = aircraftNode.addComponent(Graphics);
        
        // 绘制机头（黑色圆点）
        aircraftGraphics.circle(0, 0, 8);
        aircraftGraphics.fillColor = new Color(0, 0, 0, 255);
        aircraftGraphics.fill();
        
        // 绘制机身（9个白色圆点）
        const bodyPositions = [
            {x: -15, y: 0}, {x: 15, y: 0},
            {x: 0, y: -15}, {x: 0, y: 15},
            {x: -10, y: -10}, {x: 10, y: -10},
            {x: -10, y: 10}, {x: 10, y: 10},
            {x: 0, y: 0}  // 中心点（被机头覆盖）
        ];
        
        aircraftGraphics.strokeColor = new Color(255, 255, 255, 255);
        aircraftGraphics.lineWidth = 2;
        
        bodyPositions.forEach(pos => {
            aircraftGraphics.circle(pos.x, pos.y, 6);
            aircraftGraphics.stroke();
        });
    }
    
    /**
     * 设置位置按钮点击事件
     */
    private onSetPositionClick() {
        // 尝试通过格子编号设置位置
        if (this.cellNumberInput && this.cellNumberInput.string) {
            const cellNumber = parseInt(this.cellNumberInput.string);
            if (!isNaN(cellNumber) && cellNumber >= 1 && cellNumber <= 144) {
                this.aircraftControllers[0]?.setPositionByCellNumber(cellNumber);
                return;
            }
        }
        
        // 尝试通过复数编号设置位置
        if (this.complexNumberInput && this.complexNumberInput.string) {
            this.aircraftControllers[0]?.setPositionByComplexNumber(this.complexNumberInput.string);
        }
    }
    
    /**
     * 获取所有飞机的位置信息
     */
    public getAllAircraftPositions() {
        return this.aircraftControllers.map((controller, index) => {
            const position = controller.getCurrentPosition();
            return {
                aircraftIndex: index,
                ...position
            };
        });
    }
    
    /**
     * 根据格子编号查找飞机
     */
    public findAircraftByCellNumber(cellNumber: number) {
        return this.aircraftControllers.find(controller => {
            const position = controller.getCurrentPosition();
            return position.cellNumber === cellNumber;
        });
    }
    
    /**
     * 根据复数编号查找飞机
     */
    public findAircraftByComplexNumber(complexNumber: string) {
        return this.aircraftControllers.find(controller => {
            const position = controller.getCurrentPosition();
            return position.complexNumber === complexNumber;
        });
    }
    
    /**
     * 更新信息显示
     */
    public updateInfoDisplay() {
        if (!this.infoLabel) return;
        
        const positions = this.getAllAircraftPositions();
        let infoText = "飞机位置信息:\n";
        
        positions.forEach((pos, index) => {
            infoText += `飞机${index + 1}: ${pos.complexNumber} (格子${pos.cellNumber})\n`;
        });
        
        this.infoLabel.string = infoText;
    }
} 