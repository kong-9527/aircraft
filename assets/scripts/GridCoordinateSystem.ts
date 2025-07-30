import { _decorator, Component, Node, UITransform } from 'cc';
const { ccclass, property } = _decorator;

/**
 * 网格坐标系统工具类
 * 处理12x12网格的坐标转换
 */
@ccclass('GridCoordinateSystem')
export class GridCoordinateSystem extends Component {
    
    // 网格尺寸
    public static readonly GRID_SIZE = 12;
    public static readonly TOTAL_CELLS = 144;
    
    // 棋盘尺寸（像素）
    @property
    public boardWidth: number = 600;
    
    @property
    public boardHeight: number = 600;
    
    /**
     * 将网格坐标转换为格子编号 (1-144)
     * @param x 网格X坐标 (1-12)
     * @param y 网格Y坐标 (1-12)
     * @returns 格子编号 (1-144)
     */
    public static gridToCellNumber(x: number, y: number): number {
        if (x < 1 || x > 12 || y < 1 || y > 12) {
            return -1; // 无效坐标
        }
        return (y - 1) * 12 + x;
    }
    
    /**
     * 将格子编号转换为网格坐标
     * @param cellNumber 格子编号 (1-144)
     * @returns 网格坐标 {x, y}
     */
    public static cellNumberToGrid(cellNumber: number): {x: number, y: number} {
        if (cellNumber < 1 || cellNumber > 144) {
            return {x: -1, y: -1}; // 无效编号
        }
        
        const y = Math.ceil(cellNumber / 12);
        const x = cellNumber - (y - 1) * 12;
        
        return {x, y};
    }
    
    /**
     * 将网格坐标转换为复数编号
     * @param x 网格X坐标 (1-12)
     * @param y 网格Y坐标 (1-12)
     * @returns 复数编号字符串 (如 "2+3i")
     */
    public static gridToComplexNumber(x: number, y: number): string {
        if (x < 1 || x > 12 || y < 1 || y > 12) {
            return "无效坐标";
        }
        return `${x}+${y}i`;
    }
    
    /**
     * 将复数编号转换为网格坐标
     * @param complexStr 复数编号字符串 (如 "2+3i")
     * @returns 网格坐标 {x, y}
     */
    public static complexNumberToGrid(complexStr: string): {x: number, y: number} {
        try {
            // 解析复数格式 "a+bi"
            const match = complexStr.match(/^(\d+)\+(\d+)i$/);
            if (!match) {
                return {x: -1, y: -1};
            }
            
            const x = parseInt(match[1]);
            const y = parseInt(match[2]);
            
            if (x < 1 || x > 12 || y < 1 || y > 12) {
                return {x: -1, y: -1};
            }
            
            return {x, y};
        } catch (error) {
            return {x: -1, y: -1};
        }
    }
    
    /**
     * 将屏幕坐标转换为网格坐标
     * @param screenX 屏幕X坐标
     * @param screenY 屏幕Y坐标
     * @param boardNode 棋盘节点
     * @returns 网格坐标 {x, y}
     */
    public static screenToGrid(screenX: number, screenY: number, boardNode: Node): {x: number, y: number} {
        // 获取棋盘的世界坐标
        const worldPos = boardNode.getWorldPosition();
        const boardSize = boardNode.getComponent(UITransform)?.contentSize;
        
        if (!boardSize) {
            return {x: -1, y: -1};
        }
        
        // 计算相对于棋盘的坐标
        const relativeX = screenX - worldPos.x + boardSize.width / 2;
        const relativeY = screenY - worldPos.y + boardSize.height / 2;
        
        // 转换为网格坐标
        const gridX = Math.floor(relativeX / (boardSize.width / 12)) + 1;
        const gridY = Math.floor(relativeY / (boardSize.height / 12)) + 1;
        
        // 确保坐标在有效范围内
        if (gridX < 1 || gridX > 12 || gridY < 1 || gridY > 12) {
            return {x: -1, y: -1};
        }
        
        return {x: gridX, y: gridY};
    }
    
    /**
     * 获取位置信息字符串
     * @param x 网格X坐标
     * @param y 网格Y坐标
     * @returns 位置信息字符串
     */
    public static getPositionInfo(x: number, y: number): string {
        if (x < 1 || x > 12 || y < 1 || y > 12) {
            return "无效位置";
        }
        
        const cellNumber = this.gridToCellNumber(x, y);
        const complexNumber = this.gridToComplexNumber(x, y);
        
        return `格子编号: ${cellNumber}, 复数编号: ${complexNumber}, 坐标: (${x}, ${y})`;
    }
} 