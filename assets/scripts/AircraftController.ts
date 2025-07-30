import { _decorator, Component, Node, input, Input, EventTouch, Vec3, UITransform, Label } from 'cc';
import { GridCoordinateSystem } from './GridCoordinateSystem';
const { ccclass, property } = _decorator;

/**
 * 飞机控制器
 * 处理飞机的拖拽和位置识别
 */
@ccclass('AircraftController')
export class AircraftController extends Component {
    
    @property(Node)
    public boardNode: Node = null!;
    
    @property(Label)
    public positionLabel: Label = null!;
    
    @property(Node)
    public aircraftNode: Node = null!;
    
    // 飞机当前位置
    private currentGridX: number = 1;
    private currentGridY: number = 1;
    
    // 拖拽相关
    private isDragging: boolean = false;
    private dragOffset: Vec3 = new Vec3();
    
    // 飞机尺寸（10个点）
    private readonly AIRCRAFT_SIZE = 10;
    
    start() {
        this.setupTouchEvents();
        this.updatePositionDisplay();
    }
    
    /**
     * 设置触摸事件
     */
    private setupTouchEvents() {
        // 监听触摸开始
        input.on(Input.EventType.TOUCH_START, this.onTouchStart, this);
        
        // 监听触摸移动
        input.on(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
        
        // 监听触摸结束
        input.on(Input.EventType.TOUCH_END, this.onTouchEnd, this);
    }
    
    /**
     * 触摸开始事件
     */
    private onTouchStart(event: EventTouch) {
        const touchPos = event.getLocation();
        
        // 检查是否点击在飞机上
        if (this.isPointOnAircraft(touchPos)) {
            this.isDragging = true;
            
            // 计算拖拽偏移
            const aircraftWorldPos = this.aircraftNode.getWorldPosition();
            this.dragOffset.x = touchPos.x - aircraftWorldPos.x;
            this.dragOffset.y = touchPos.y - aircraftWorldPos.y;
        }
    }
    
    /**
     * 触摸移动事件
     */
    private onTouchMove(event: EventTouch) {
        if (!this.isDragging) return;
        
        const touchPos = event.getLocation();
        
        // 更新飞机位置
        const newWorldPos = new Vec3(
            touchPos.x - this.dragOffset.x,
            touchPos.y - this.dragOffset.y,
            0
        );
        
        this.aircraftNode.setWorldPosition(newWorldPos);
        
        // 识别飞机位置
        this.identifyAircraftPosition();
    }
    
    /**
     * 触摸结束事件
     */
    private onTouchEnd(event: EventTouch) {
        if (this.isDragging) {
            this.isDragging = false;
            
            // 最终位置识别
            this.identifyAircraftPosition();
            
            // 可选：将飞机对齐到最近的网格中心
            this.snapToGrid();
        }
    }
    
    /**
     * 检查点是否在飞机上
     */
    private isPointOnAircraft(point: Vec3): boolean {
        const aircraftWorldPos = this.aircraftNode.getWorldPosition();
        const aircraftSize = this.aircraftNode.getComponent(UITransform)?.contentSize;
        
        if (!aircraftSize) return false;
        
        const halfWidth = aircraftSize.width / 2;
        const halfHeight = aircraftSize.height / 2;
        
        return Math.abs(point.x - aircraftWorldPos.x) <= halfWidth &&
               Math.abs(point.y - aircraftWorldPos.y) <= halfHeight;
    }
    
    /**
     * 识别飞机位置
     */
    private identifyAircraftPosition() {
        if (!this.boardNode) return;
        
        // 获取飞机中心位置
        const aircraftWorldPos = this.aircraftNode.getWorldPosition();
        
        // 转换为网格坐标
        const gridPos = GridCoordinateSystem.screenToGrid(
            aircraftWorldPos.x,
            aircraftWorldPos.y,
            this.boardNode
        );
        
        if (gridPos.x !== -1 && gridPos.y !== -1) {
            this.currentGridX = gridPos.x;
            this.currentGridY = gridPos.y;
            
            // 更新显示
            this.updatePositionDisplay();
        }
    }
    
    /**
     * 将飞机对齐到网格中心
     */
    private snapToGrid() {
        if (!this.boardNode) return;
        
        // 计算网格中心位置
        const boardSize = this.boardNode.getComponent(UITransform)?.contentSize;
        if (!boardSize) return;
        
        const cellWidth = boardSize.width / 12;
        const cellHeight = boardSize.height / 12;
        
        const boardWorldPos = this.boardNode.getWorldPosition();
        
        // 计算目标位置（网格中心）
        const targetX = boardWorldPos.x - boardSize.width / 2 + (this.currentGridX - 0.5) * cellWidth;
        const targetY = boardWorldPos.y - boardSize.height / 2 + (this.currentGridY - 0.5) * cellHeight;
        
        // 设置飞机位置
        this.aircraftNode.setWorldPosition(targetX, targetY, 0);
    }
    
    /**
     * 更新位置显示
     */
    private updatePositionDisplay() {
        if (!this.positionLabel) return;
        
        const positionInfo = GridCoordinateSystem.getPositionInfo(this.currentGridX, this.currentGridY);
        this.positionLabel.string = positionInfo;
    }
    
    /**
     * 设置飞机位置
     * @param gridX 网格X坐标
     * @param gridY 网格Y坐标
     */
    public setAircraftPosition(gridX: number, gridY: number) {
        if (gridX < 1 || gridX > 12 || gridY < 1 || gridY > 12) {
            console.warn("无效的网格坐标");
            return;
        }
        
        this.currentGridX = gridX;
        this.currentGridY = gridY;
        
        // 更新飞机位置
        this.snapToGrid();
        
        // 更新显示
        this.updatePositionDisplay();
    }
    
    /**
     * 获取飞机当前位置信息
     */
    public getCurrentPosition() {
        return {
            gridX: this.currentGridX,
            gridY: this.currentGridY,
            cellNumber: GridCoordinateSystem.gridToCellNumber(this.currentGridX, this.currentGridY),
            complexNumber: GridCoordinateSystem.gridToComplexNumber(this.currentGridX, this.currentGridY)
        };
    }
    
    /**
     * 根据格子编号设置飞机位置
     * @param cellNumber 格子编号 (1-144)
     */
    public setPositionByCellNumber(cellNumber: number) {
        const gridPos = GridCoordinateSystem.cellNumberToGrid(cellNumber);
        if (gridPos.x !== -1 && gridPos.y !== -1) {
            this.setAircraftPosition(gridPos.x, gridPos.y);
        }
    }
    
    /**
     * 根据复数编号设置飞机位置
     * @param complexNumber 复数编号 (如 "2+3i")
     */
    public setPositionByComplexNumber(complexNumber: string) {
        const gridPos = GridCoordinateSystem.complexNumberToGrid(complexNumber);
        if (gridPos.x !== -1 && gridPos.y !== -1) {
            this.setAircraftPosition(gridPos.x, gridPos.y);
        }
    }
    
    onDestroy() {
        // 清理事件监听
        input.off(Input.EventType.TOUCH_START, this.onTouchStart, this);
        input.off(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
        input.off(Input.EventType.TOUCH_END, this.onTouchEnd, this);
    }
} 